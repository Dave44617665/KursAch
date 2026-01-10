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

	// URL Rust SFU - без пути, т.к. ваш Rust просто слушает на корне
	rustSignalingURL = "ws://rrtc:8080" // используем имя контейнера из docker-compose

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
	Room          string         `json:"room,omitempty"`
	ParticipantID string         `json:"participant,omitempty"`
	Name          string         `json:"name,omitempty"`
	SDP           string         `json:"sdp,omitempty"`
	Candidate     string         `json:"candidate,omitempty"`
	Muted         *bool          `json:"muted,omitempty"`
	VideoOn       *bool          `json:"video_on,omitempty"`
	ScreenSharing *bool          `json:"screen_sharing,omitempty"`
	YourId        *string        `json:"your_id,omitempty"`
	Participants  *[]interface{} `json:"participants,omitempty"`
	Participant   interface{}    `json:"participant,omitempty"`
}

// Для отправки клиенту (camelCase)
type ClientWSMessage struct {
	Type          string         `json:"type"`
	YourId        *string        `json:"yourId,omitempty"`
	Participants  *[]interface{} `json:"participants,omitempty"`
	Participant   interface{}    `json:"participant,omitempty"`
	ParticipantId *string        `json:"participantId,omitempty"`
	SDP           string         `json:"sdp,omitempty"`
	Candidate     string         `json:"candidate,omitempty"`
	State         interface{}    `json:"state,omitempty"`
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

	userID, err := utils.GetUserIDFromToken(token)
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

	// Подключаемся к Rust SFU напрямую (без query параметров, т.к. Rust ожидает JSON)
	log.Printf("Connecting to Rust SFU at %s", rustSignalingURL)
	rustConn, _, err := websocket.DefaultDialer.Dial(rustSignalingURL, nil)
	if err != nil {
		log.Printf("Failed to connect to Rust SFU: %v", err)
		conn.WriteJSON(gin.H{"error": "Failed to connect to media server"})
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
	client.room = room
	room.mu.Unlock()

	// Отправляем join в Rust SFU
	joinMsg := WSMessage{
		Type:          "join",
		Room:          conferenceID,
		ParticipantID: participant.ID.String(),
		Name:          user.Nickname,
	}
	if err := rustConn.WriteJSON(joinMsg); err != nil {
		log.Printf("Failed to send join to Rust SFU: %v", err)
		conn.Close()
		rustConn.Close()
		return
	}

	log.Printf("Sent join message to Rust SFU for participant %s", participant.ID.String())

	// Получаем текущих участников из БД
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

	// Отправляем joined клиенту
	conn.WriteJSON(ClientWSMessage{
		Type:         "joined",
		YourId:       ptr(participant.ID.String()),
		Participants: &partList,
	})

	// Broadcast о присоединении другим клиентам
	broadcastToClients(room, ClientWSMessage{
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
	go client.handleClientMessages()
}

func ptr(s string) *string {
	return &s
}

// relayFromRust пересылает сообщения от Rust SFU к клиенту
func (c *Client) relayFromRust() {
	defer func() {
		log.Printf("Closing Rust relay for participant %s", c.participant.ID.String())
		c.cleanup()
	}()

	for {
		_, data, err := c.proxyConn.ReadMessage()
		if err != nil {
			log.Printf("Rust relay error for participant %s: %v", c.participant.ID.String(), err)
			return
		}

		var msg WSMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("Failed to parse Rust message: %v", err)
			continue
		}

		log.Printf("← From Rust SFU: type=%s for participant %s", msg.Type, c.participant.ID.String())

		// Пересылаем WebRTC сообщения клиенту
		switch msg.Type {
		case "joined":
			// Игнорируем, мы уже отправили свой joined
			continue

		case "answer":
			// Конвертируем в camelCase для клиента
			clientMsg := ClientWSMessage{
				Type: "answer",
				SDP:  msg.SDP,
			}
			if err := c.conn.WriteJSON(clientMsg); err != nil {
				log.Printf("Failed to send answer to client: %v", err)
				return
			}

		case "candidate":
			clientMsg := ClientWSMessage{
				Type:      "candidate",
				Candidate: msg.Candidate,
			}
			if err := c.conn.WriteJSON(clientMsg); err != nil {
				log.Printf("Failed to send candidate to client: %v", err)
				return
			}

		default:
			// Пересылаем как есть
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				log.Printf("Failed to relay message to client: %v", err)
				return
			}
		}
	}
}

// handleClientMessages обрабатывает сообщения от клиента
func (c *Client) handleClientMessages() {
	defer func() {
		log.Printf("Closing client handler for participant %s", c.participant.ID.String())
		c.cleanup()
	}()

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			log.Printf("Client read error: %v", err)
			return
		}

		var clientMsg map[string]interface{}
		if err := json.Unmarshal(data, &clientMsg); err != nil {
			log.Printf("Failed to parse client message: %v", err)
			continue
		}

		msgType, _ := clientMsg["type"].(string)
		log.Printf("→ From client: type=%s for participant %s", msgType, c.participant.ID.String())

		switch msgType {
		case "offer":
			// Пересылаем offer в Rust SFU
			sdp, _ := clientMsg["sdp"].(string)
			rustMsg := WSMessage{
				Type: "offer",
				SDP:  sdp,
			}
			if err := c.proxyConn.WriteJSON(rustMsg); err != nil {
				log.Printf("Failed to send offer to Rust: %v", err)
				return
			}

		case "candidate":
			// Пересылаем candidate в Rust SFU
			candidate, _ := clientMsg["candidate"].(string)
			rustMsg := WSMessage{
				Type:      "candidate",
				Candidate: candidate,
			}
			if err := c.proxyConn.WriteJSON(rustMsg); err != nil {
				log.Printf("Failed to send candidate to Rust: %v", err)
				return
			}

		case "state_update":
			// Обрабатываем state_update локально
			if stateMap, ok := clientMsg["state"].(map[string]interface{}); ok {
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

				// Обновляем в БД
				services.UpdateParticipant(
					c.participant.ConferenceID.String(),
					c.participant.ID.String(),
					c.userID,
					isMuted, isVideoOn, screenSharing,
				)

				// Broadcast всем клиентам
				broadcastToClients(c.room, ClientWSMessage{
					Type:          "state_update",
					ParticipantId: ptr(c.participant.ID.String()),
					State:         stateMap,
				}, nil)

				// Также отправляем в Rust SFU
				var muted, videoOn, screenShare bool
				if isMuted != nil {
					muted = *isMuted
				}
				if isVideoOn != nil {
					videoOn = *isVideoOn
				}
				if screenSharing != nil {
					screenShare = *screenSharing
				}

				rustMsg := WSMessage{
					Type:          "state_update",
					Muted:         &muted,
					VideoOn:       &videoOn,
					ScreenSharing: &screenShare,
				}
				c.proxyConn.WriteJSON(rustMsg)
			}
		}
	}
}

// cleanup закрывает соединения и убирает клиента из комнаты
func (c *Client) cleanup() {
	// Закрываем соединения
	c.conn.Close()
	c.proxyConn.Close()

	if c.room == nil {
		return
	}

	// Удаляем из комнаты
	c.room.mu.Lock()
	delete(c.room.clients, c)
	clientsCount := len(c.room.clients)
	c.room.mu.Unlock()

	// Помечаем как покинувшего в БД
	services.LeaveConference(c.participant.ConferenceID.String(), c.userID)

	// Broadcast об уходе
	broadcastToClients(c.room, ClientWSMessage{
		Type:          "participant_left",
		ParticipantId: ptr(c.participant.ID.String()),
	}, nil)

	// Удаляем пустую комнату
	if clientsCount == 0 {
		roomsMu.Lock()
		delete(rooms, c.participant.ConferenceID.String())
		roomsMu.Unlock()
		log.Printf("Room %s deleted (empty)", c.participant.ConferenceID.String())
	}
}

// broadcastToClients отправляет сообщение всем клиентам в комнате (кроме exclude)
func broadcastToClients(room *Room, msg ClientWSMessage, exclude *Client) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal broadcast message: %v", err)
		return
	}

	room.mu.Lock()
	defer room.mu.Unlock()

	for client := range room.clients {
		if client == exclude {
			continue
		}
		if err := client.conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("Failed to broadcast to client: %v", err)
		}
	}
}
