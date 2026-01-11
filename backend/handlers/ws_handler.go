package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

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

	// Получаем URL Rust SFU из переменной окружения или используем дефолтное значение
	rustSignalingURL = getRustSFUURL()

	roomsMu sync.Mutex
	rooms   = make(map[string]*Room) // conferenceID -> Room
)

// getRustSFUURL получает URL Rust SFU из переменной окружения
func getRustSFUURL() string {
	url := os.Getenv("RUST_SFU_URL")
	if url == "" {
		// Дефолтное значение для локальной разработки
		// В Docker используйте переменную окружения RUST_SFU_URL=ws://media:8080
		url = "ws://localhost:8081"
	}
	log.Printf("Using Rust SFU URL: %s", url)
	return url
}

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
	once        sync.Once
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
	Message       string         `json:"message,omitempty"`
	Timestamp     string         `json:"timestamp,omitempty"`
	//Participant   interface{}    `json:"participant,omitempty"`
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
	Message       string         `json:"message,omitempty"`
	Name          string         `json:"name,omitempty"`
	AvatarUrl     string         `json:"avatarUrl,omitempty"`
	Timestamp     string         `json:"timestamp,omitempty"`
}

func getOrCreateRoom(conferenceID string) *Room {
	roomsMu.Lock()
	defer roomsMu.Unlock()
	if rooms[conferenceID] == nil {
		rooms[conferenceID] = &Room{clients: make(map[*Client]bool)}
	}
	return rooms[conferenceID]
}

// ConferenceWSHandler – основной WebSocket хэндлер для конференции
func ConferenceWSHandler(c *gin.Context) {
	conferenceID := c.Param("id")
	if conferenceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing conference id"})
		return
	}

	// Аутентификация по query token
	token := c.Query("token")
	if token == "" {
		log.Printf("WebSocket connection attempt without token for conference %s", conferenceID)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
		return
	}

	userID, err := utils.GetUserIDFromToken(token)
	if err != nil || userID == "" {
		log.Printf("Invalid token for conference %s: %v", conferenceID, err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	user, err := services.GetUserByID(userID)
	if err != nil {
		log.Printf("User not found for ID %s: %v", userID, err)
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	log.Printf("[WS] WebSocket upgrade request from user %s (%s) for conference %s", user.Nickname, userID, conferenceID)
	log.Printf("[WS] Request headers: %v", c.Request.Header)

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[WS] ERROR: Upgrade failed for user %s: %v", userID, err)
		return
	}

	log.Printf("[WS] ✓ WebSocket upgraded successfully for user %s", user.Nickname)

	// Присоединяемся к конференции
	log.Printf("[WS] Attempting to join conference %s for user %s", conferenceID, userID)
	participant, err := services.JoinConference(conferenceID, userID)
	if err != nil {
		log.Printf("[WS] ERROR: Failed to join conference %s for user %s: %v", conferenceID, userID, err)
		conn.WriteJSON(gin.H{"error": err.Error()})
		conn.Close()
		return
	}

	log.Printf("[WS] ✓ User %s joined conference %s as participant %s", user.Nickname, conferenceID, participant.ID.String())

	// Подключаемся к Rust SFU напрямую
	log.Printf("[WS] Attempting to connect to Rust SFU at %s for participant %s", rustSignalingURL, participant.ID.String())
	rustConn, resp, err := websocket.DefaultDialer.Dial(rustSignalingURL, nil)
	if err != nil {
		log.Printf("[WS] ERROR: Failed to connect to Rust SFU at %s: %v", rustSignalingURL, err)
		if resp != nil {
			log.Printf("[WS] ERROR: Rust SFU response status: %d", resp.StatusCode)
		}
		conn.WriteJSON(gin.H{"error": "Failed to connect to media server"})
		conn.Close()
		return
	}

	log.Printf("[WS] ✓ Successfully connected to Rust SFU for participant %s", participant.ID.String())

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
	log.Printf("[WS] Sending join message to Rust SFU: %+v", joinMsg)
	if err := rustConn.WriteJSON(joinMsg); err != nil {
		log.Printf("[WS] ERROR: Failed to send join to Rust SFU: %v", err)
		conn.Close()
		rustConn.Close()
		return
	}

	log.Printf("[WS] ✓ Sent join message to Rust SFU for participant %s", participant.ID.String())

	// Получаем текущих участников из БД
	participants, _ := services.GetParticipants(conferenceID)
	partList := make([]interface{}, len(participants))
	for i, p := range participants {
		partList[i] = map[string]interface{}{
			"id":            p.ID.String(),
			"name":          p.User.Nickname,
			"avatarUrl":     p.User.AvatarURL,
			"isMuted":       p.IsMuted,
			"isVideoOn":     p.IsVideoOn,
			"screenSharing": p.ScreenSharing,
		}
	}

	// Отправляем joined клиенту
	log.Printf("[WS] Sending joined confirmation to client for participant %s with %d participants", participant.ID.String(), len(partList))
	if err := conn.WriteJSON(ClientWSMessage{
		Type:         "joined",
		YourId:       ptr(participant.ID.String()),
		Participants: &partList,
	}); err != nil {
		log.Printf("[WS] ERROR: Failed to send joined to client: %v", err)
		conn.Close()
		rustConn.Close()
		return
	}

	log.Printf("[WS] ✓ Sent joined confirmation to client for participant %s", participant.ID.String())

	// Broadcast о присоединении другим клиентам
	broadcastToClients(room, ClientWSMessage{
		Type: "participant_joined",
		Participant: map[string]interface{}{
			"id":            participant.ID.String(),
			"name":          user.Nickname,
			"avatarUrl":     user.AvatarURL,
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
		log.Printf("[RELAY] Closing Rust relay for participant %s", c.participant.ID.String())
		c.cleanup()
	}()

	log.Printf("[RELAY] Starting relay from Rust SFU for participant %s", c.participant.ID.String())

	for {
		_, data, err := c.proxyConn.ReadMessage()
		if err != nil {
			log.Printf("[RELAY] ERROR: Rust relay error for participant %s: %v", c.participant.ID.String(), err)
			return
		}

		log.Printf("[RELAY] Raw message from Rust SFU: %s", string(data))

		var msg WSMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("[RELAY] ERROR: Failed to parse Rust message: %v, raw: %s", err, string(data))
			continue
		}

		log.Printf("[RELAY] ← From Rust SFU: type=%s for participant %s", msg.Type, c.participant.ID.String())

		// Пересылаем WebRTC сообщения клиенту
		switch msg.Type {
		case "joined":
			// Игнорируем, мы уже отправили свой joined
			continue

		case "answer":
			// Конвертируем в camelCase для клиента
			log.Printf("[Relay→Client] Forwarding answer to client (SDP length: %d)", len(msg.SDP))
			clientMsg := ClientWSMessage{
				Type: "answer",
				SDP:  msg.SDP,
			}
			if err := c.conn.WriteJSON(clientMsg); err != nil {
				log.Printf("[Relay→Client] ERROR: Failed to send answer to client: %v", err)
				return
			}
			log.Printf("[Relay→Client] ✓ Answer sent to client")

		case "candidate":
			log.Printf("[Relay→Client] Forwarding ICE candidate to client")
			clientMsg := ClientWSMessage{
				Type:      "candidate",
				Candidate: msg.Candidate,
			}
			if err := c.conn.WriteJSON(clientMsg); err != nil {
				log.Printf("[Relay→Client] ERROR: Failed to send candidate to client: %v", err)
				return
			}
			log.Printf("[Relay→Client] ✓ Candidate sent to client")

		default:
			// Пересылаем как есть
			log.Printf("[Relay→Client] Forwarding unknown message type to client: %s", msg.Type)
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				log.Printf("[Relay→Client] ERROR: Failed to relay message to client: %v", err)
				return
			}
		}
	}
}

// handleClientMessages обрабатывает сообщения от клиента
func (c *Client) handleClientMessages() {
	defer func() {
		log.Printf("[CLIENT] Closing client handler for participant %s", c.participant.ID.String())
		c.cleanup()
	}()

	log.Printf("[CLIENT] Starting to handle client messages for participant %s", c.participant.ID.String())

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			log.Printf("[CLIENT] ERROR: Client read error for participant %s: %v", c.participant.ID.String(), err)
			return
		}

		log.Printf("[CLIENT] Raw message from client: %s", string(data))

		var clientMsg map[string]interface{}
		if err := json.Unmarshal(data, &clientMsg); err != nil {
			log.Printf("[CLIENT] ERROR: Failed to parse client message: %v", err)
			continue
		}

		msgType, _ := clientMsg["type"].(string)
		log.Printf("[CLIENT] → From client: type=%s for participant %s", msgType, c.participant.ID.String())

		switch msgType {
		case "offer":
			// Пересылаем offer в Rust SFU
			sdp, _ := clientMsg["sdp"].(string)
			log.Printf("[CLIENT] Received offer from client, SDP length: %d", len(sdp))
			rustMsg := WSMessage{
				Type:          "offer",
				ParticipantID: c.participant.ID.String(),
				SDP:           sdp,
			}
			log.Printf("[CLIENT] Forwarding offer to Rust SFU: %+v", rustMsg)
			if err := c.proxyConn.WriteJSON(rustMsg); err != nil {
				log.Printf("[CLIENT] ERROR: Failed to send offer to Rust: %v", err)
				return
			}
			log.Printf("[CLIENT] ✓ Offer sent to Rust SFU successfully")

		case "candidate":
			// Пересылаем candidate в Rust SFU
			candidate, _ := clientMsg["candidate"].(string)
			log.Printf("[CLIENT] Received ICE candidate from client: %s", candidate)
			rustMsg := WSMessage{
				Type:      "candidate",
				Candidate: candidate,
			}
			log.Printf("[CLIENT] Forwarding candidate to Rust SFU")
			if err := c.proxyConn.WriteJSON(rustMsg); err != nil {
				log.Printf("[CLIENT] ERROR: Failed to send candidate to Rust: %v", err)
				return
			}
			log.Printf("[CLIENT] ✓ Candidate sent to Rust SFU successfully")
			log.Printf("[Client→Relay] ✓ Candidate sent to Rust SFU")

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

		case "chat":
			// Обрабатываем chat сообщения
			message, _ := clientMsg["message"].(string)
			if message != "" {
				log.Printf("[CLIENT] Chat message from %s: %s", c.participant.User.Nickname, message)

				// Получаем текущее время
				timestamp := time.Now().Format(time.RFC3339)

				// Broadcast всем клиентам в комнате
				broadcastToClients(c.room, ClientWSMessage{
					Type:          "chat",
					ParticipantId: ptr(c.participant.ID.String()),
					Name:          c.participant.User.Nickname,
					AvatarUrl:     c.participant.User.AvatarURL,
					Message:       message,
					Timestamp:     timestamp,
				}, nil)
			}
		}
	}
}

// cleanup закрывает соединения и убирает клиента из комнаты
func (c *Client) cleanup() {
	c.once.Do(func() {
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

		log.Printf("Participant %s cleaned up, remaining clients: %d", c.participant.ID.String(), clientsCount)

		// Удаляем пустую комнату
		if clientsCount == 0 {
			roomsMu.Lock()
			delete(rooms, c.participant.ConferenceID.String())
			roomsMu.Unlock()
			log.Printf("Room %s deleted (empty)", c.participant.ConferenceID.String())
		}
	})
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
			delete(room.clients, client)
		}
	}
}
