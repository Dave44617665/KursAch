package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"backend/models"
	"backend/services"
	"backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}

	rustSignalingURL = "ws://127.0.0.1:8081/ws" // ← URL Rust SFU signaling

	roomsMu sync.Mutex
	rooms   = make(map[string]*Room) // conferenceID -> Room
)

type Room struct {
	clients map[*Client]bool
	mu      sync.Mutex
}

type Client struct {
	conn        *websocket.Conn
	proxyConn   *websocket.Conn
	userID      string
	participant *models.Participant
	room        *Room
}

type WSMessage struct {
	Type          string         `json:"type"`
	SDP           interface{}    `json:"sdp,omitempty"`
	Candidate     interface{}    `json:"candidate,omitempty"`
	State         interface{}    `json:"state,omitempty"`
	Participant   interface{}    `json:"participant,omitempty"`
	ParticipantId *string        `json:"participantId,omitempty"`
	YourId        *string        `json:"yourId,omitempty"`
	Participants  *[]interface{} `json:"participants,omitempty"`
}

func getOrCreateRoom(conferenceID string) *Room {
	roomsMu.Lock()
	defer roomsMu.Unlock()
	if rooms[conferenceID] == nil {
		rooms[conferenceID] = &Room{clients: make(map[*Client]bool)}
	}
	return rooms[conferenceID]
}

// ConferenceWSHandler — основной WebSocket хэндлер для конференции
func ConferenceWSHandler(c *gin.Context) {
	conferenceID := c.Param("id")
	if conferenceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing conference id"})
		return
	}

	// Аутентификация по query token
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
		return
	}

	userID, err := utils.GetUserIDFromToken(token) // ← твоя функция извлечения userID из JWT
	if err != nil || userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	user, err := services.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("WS upgrade error:", err)
		return
	}

	// Присоединяемся к конференции
	participant, err := services.JoinConference(conferenceID, userID)
	if err != nil {
		conn.WriteJSON(gin.H{"error": err.Error()})
		conn.Close()
		return
	}

	// Подключаемся к Rust SFU как прокси (можно добавить query-параметры, если нужно)
	rustURL := rustSignalingURL + "?room=" + conferenceID + "&participant=" + participant.ID.String()
	rustConn, _, err := websocket.DefaultDialer.Dial(rustURL, nil)
	if err != nil {
		log.Printf("Failed to connect to Rust SFU for conference %s: %v", conferenceID, err)
		conn.Close()
		return
	}

	client := &Client{
		conn:        conn,
		proxyConn:   rustConn,
		userID:      userID,
		participant: participant,
	}

	room := getOrCreateRoom(conferenceID)
	room.mu.Lock()
	room.clients[client] = true
	room.mu.Unlock()

	// Отправляем начальные данные клиенту
	participants, _ := services.GetParticipants(conferenceID)
	partList := make([]interface{}, len(participants))
	for i, p := range participants {
		partList[i] = map[string]interface{}{
			"id":            p.ID.String(),
			"name":          p.User.Nickname,
			"isMuted":       p.IsMuted,
			"isVideoOn":     p.IsVideoOn,
			"screenSharing": p.ScreenSharing,
		}
	}

	conn.WriteJSON(WSMessage{
		Type:         "joined",
		YourId:       ptr(participant.ID.String()),
		Participants: &partList,
	})

	// Broadcast о присоединении
	broadcast(room, WSMessage{
		Type: "participant_joined",
		Participant: map[string]interface{}{
			"id":            participant.ID.String(),
			"name":          user.Nickname,
			"isMuted":       participant.IsMuted,
			"isVideoOn":     participant.IsVideoOn,
			"screenSharing": participant.ScreenSharing,
		},
	}, client)

	// Запускаем relay-горутины
	go client.relayFromRust()
	go client.handleClientMessages(room)
}

// Вспомогательная функция для указателя строки
func ptr(s string) *string {
	return &s
}

func (c *Client) relayFromRust() {
	defer c.conn.Close()
	defer c.proxyConn.Close()

	for {
		msgType, data, err := c.proxyConn.ReadMessage()
		if err != nil {
			log.Println("Rust relay error:", err)
			return
		}

		// Пересылаем только WebRTC-сообщения (answer/candidate)
		var msg WSMessage
		if json.Unmarshal(data, &msg) == nil {
			if msg.Type == "answer" || msg.Type == "candidate" {
				c.conn.WriteMessage(msgType, data)
			}
		}
	}
}

func (c *Client) handleClientMessages(room *Room) {
	defer func() {
		// Cleanup
		room.mu.Lock()
		delete(room.clients, c)
		room.mu.Unlock()

		c.proxyConn.Close()
		c.conn.Close()

		// Пометить как покинувшего
		services.LeaveConference(c.participant.ConferenceID.String(), c.userID)

		// Broadcast об уходе
		broadcast(room, WSMessage{
			Type:          "participant_left",
			ParticipantId: ptr(c.participant.ID.String()),
		}, nil)

		// Удалить пустую комнату (опционально)
		room.mu.Lock()
		if len(room.clients) == 0 {
			room.mu.Unlock()
			roomsMu.Lock()
			delete(rooms, c.participant.ConferenceID.String())
			roomsMu.Unlock()
			return
		}
		room.mu.Unlock()
	}()

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}

		var msg WSMessage
		if json.Unmarshal(data, &msg) != nil {
			continue
		}

		switch msg.Type {
		case "offer", "candidate":
			// Пересылаем в Rust SFU
			c.proxyConn.WriteMessage(websocket.TextMessage, data)

		case "state_update":
			// Обрабатываем и обновляем в БД + broadcast
			if stateMap, ok := msg.State.(map[string]interface{}); ok {
				var isMuted, isVideoOn, screenSharing *bool
				if v, ok := stateMap["isMuted"].(bool); ok {
					isMuted = &v
				}
				if v, ok := stateMap["isVideoOn"].(bool); ok {
					isVideoOn = &v
				}
				if v, ok := stateMap["screenSharing"].(bool); ok {
					screenSharing = &v
				}

				services.UpdateParticipant(
					c.participant.ConferenceID.String(),
					c.participant.ID.String(),
					c.userID,
					isMuted, isVideoOn, screenSharing,
				)

				broadcast(room, WSMessage{
					Type:          "state_update",
					ParticipantId: ptr(c.participant.ID.String()),
					State:         stateMap,
				}, nil)
			}
		}
	}
}

func broadcast(room *Room, msg WSMessage, exclude *Client) {
	data, _ := json.Marshal(msg)

	room.mu.Lock()
	defer room.mu.Unlock()

	for client := range room.clients {
		if client == exclude {
			continue
		}
		client.conn.WriteMessage(websocket.TextMessage, data)
	}
}
