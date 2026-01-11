package handlers

import (
	"backend/services"
	"backend/utils"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// CreateConferenceHandler - создать новую конференцию (POST /conferences)
func CreateConferenceHandler(c *gin.Context) {
	userID := c.GetString("user_id")

	var req struct {
		Title     string    `json:"title" binding:"required,min=3"`
		StartTime time.Time `json:"start_time" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.SendResponse(c, http.StatusBadRequest, false, nil, err.Error())
		return
	}

	conference, err := services.CreateConference(userID, req.Title, req.StartTime)
	if err != nil {
		if err.Error() == "start time cannot be in the past" || err.Error() == "invalid host ID" {
			utils.SendResponse(c, http.StatusBadRequest, false, nil, err.Error())
		} else {
			utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		}
		return
	}

	utils.SendResponse(c, http.StatusCreated, true, conference, "Conference created successfully")
}

// GetMyConferencesHandler - получить список конференций текущего пользователя (GET /conferences или /my/conferences)
func GetMyConferencesHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	status := c.Query("status") // опционально, например ?status=scheduled

	conferences, err := services.GetConferencesByUser(userID, status)
	if err != nil {
		utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		return
	}

	utils.SendResponse(c, http.StatusOK, true, conferences, "")
}

// GetConferenceHandler - получить конференцию по ID (GET /conferences/:id)
func GetConferenceHandler(c *gin.Context) {
	conferenceID := c.Param("id")

	conference, err := services.GetConferenceByID(conferenceID)
	if err != nil {
		if err.Error() == "conference not found" {
			utils.SendResponse(c, http.StatusNotFound, false, nil, err.Error())
		} else {
			utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		}
		return
	}

	// Опционально: можно добавить проверку доступа (хост или участник), но в текущих сервисах её нет
	// Если нужно — добавьте здесь запрос к Participant

	utils.SendResponse(c, http.StatusOK, true, conference, "")
}

// UpdateConferenceHandler - обновить конференцию (PATCH /conferences/:id)
func UpdateConferenceHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	conferenceID := c.Param("id")

	var req struct {
		Title     string     `json:"title" binding:"omitempty,min=3"`
		Status    string     `json:"status" binding:"omitempty"`
		StartTime *time.Time `json:"start_time" binding:"omitempty"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.SendResponse(c, http.StatusBadRequest, false, nil, err.Error())
		return
	}

	conference, err := services.UpdateConference(conferenceID, userID, req.Title, req.Status, req.StartTime)
	if err != nil {
		if err.Error() == "only host can update conference" {
			utils.SendResponse(c, http.StatusForbidden, false, nil, err.Error())
		} else if err.Error() == "conference not found" {
			utils.SendResponse(c, http.StatusNotFound, false, nil, err.Error())
		} else if err.Error() == "invalid status" {
			utils.SendResponse(c, http.StatusBadRequest, false, nil, err.Error())
		} else {
			utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		}
		return
	}

	utils.SendResponse(c, http.StatusOK, true, conference, "Conference updated successfully")
}

// DeleteConferenceHandler - удалить конференцию (DELETE /conferences/:id)
func DeleteConferenceHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	conferenceID := c.Param("id")

	err := services.DeleteConference(conferenceID, userID)
	if err != nil {
		if err.Error() == "only host can delete conference" {
			utils.SendResponse(c, http.StatusForbidden, false, nil, err.Error())
		} else if err.Error() == "conference not found" {
			utils.SendResponse(c, http.StatusNotFound, false, nil, err.Error())
		} else {
			utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		}
		return
	}

	utils.SendResponse(c, http.StatusOK, true, gin.H{"message": "Conference deleted successfully"}, "")
}

// StartConferenceHandler - начать конференцию (POST /conferences/:id/start)
func StartConferenceHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	conferenceID := c.Param("id")

	conference, err := services.StartConference(conferenceID, userID)
	if err != nil {
		if err.Error() == "only host can start conference" {
			utils.SendResponse(c, http.StatusForbidden, false, nil, err.Error())
		} else if err.Error() == "conference not found" {
			utils.SendResponse(c, http.StatusNotFound, false, nil, err.Error())
		} else {
			utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		}
		return
	}

	utils.SendResponse(c, http.StatusOK, true, conference, "Conference started")
}

// EndConferenceHandler - завершить конференцию (POST /conferences/:id/end)
func EndConferenceHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	conferenceID := c.Param("id")

	conference, err := services.EndConference(conferenceID, userID)
	if err != nil {
		if err.Error() == "only host can end conference" {
			utils.SendResponse(c, http.StatusForbidden, false, nil, err.Error())
		} else if err.Error() == "conference not found" {
			utils.SendResponse(c, http.StatusNotFound, false, nil, err.Error())
		} else {
			utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		}
		return
	}

	utils.SendResponse(c, http.StatusOK, true, conference, "Conference ended")
}

// JoinConferenceByReadableIDHandler - присоединиться к конференции по ReadableID (POST /conferences/join/:readable_id)
func JoinConferenceByReadableIDHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	readableID := c.Param("readable_id")

	// Получить конференцию по ReadableID
	conference, err := services.GetConferenceByReadableID(readableID)
	if err != nil {
		if err.Error() == "conference not found" {
			utils.SendResponse(c, http.StatusNotFound, false, nil, "Conference not found")
		} else {
			utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		}
		return
	}

	// Проверить что конференция активна
	if conference.Status != "active" {
		utils.SendResponse(c, http.StatusBadRequest, false, nil, "Conference is not active yet")
		return
	}

	// Присоединиться к конференции
	participant, err := services.JoinConference(conference.ID.String(), userID)
	if err != nil {
		utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		return
	}

	utils.SendResponse(c, http.StatusOK, true, gin.H{
		"conference":  conference,
		"participant": participant,
	}, "Joined conference successfully")
}

// LeaveConferenceHandler - покинуть конференцию (POST /conferences/:id/leave)
func LeaveConferenceHandler(c *gin.Context) {
	userID := c.GetString("user_id")
	conferenceID := c.Param("id")

	err := services.LeaveConference(conferenceID, userID)
	if err != nil {
		if err.Error() == "conference not found" || err.Error() == "participant not found" {
			utils.SendResponse(c, http.StatusNotFound, false, nil, err.Error())
		} else {
			utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		}
		return
	}

	utils.SendResponse(c, http.StatusOK, true, nil, "Left conference successfully")
}
