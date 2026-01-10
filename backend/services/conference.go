package services

import (
	"errors"
	"time"

	"backend/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CreateConference создает новую конференцию
func CreateConference(hostID, title string, startTime time.Time) (*models.Conference, error) {
	// Проверка что время не в прошлом
	if startTime.Before(time.Now()) {
		return nil, errors.New("start time cannot be in the past")
	}

	tx := DB.Begin()

	hostUUID, err := uuid.Parse(hostID)
	if err != nil {
		return nil, errors.New("invalid host ID")
	}

	// Генерируем уникальный ReadableID
	var readableID string
	for {
		readableID = utils.GenerateReadableID()
		
		// Проверяем уникальность
		var existing models.Conference
		if err := tx.Where("readable_id = ?", readableID).First(&existing).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				// ID уникален, можно использовать
				break
			}
			tx.Rollback()
			return nil, err
		}
		// Если нашли дубликат - генерируем новый
	}

	conference := &models.Conference{
		ID:         uuid.New(),
		ReadableID: readableID, // ← НОВОЕ!
		HostID:     hostUUID,
		Title:      title,
		Status:     "scheduled",
		StartTime:  startTime,
	}

	if err := tx.Create(conference).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	// Автоматически добавить хоста как участника
	participant := &models.Participant{
		ID:            uuid.New(),
		ConferenceID:  conference.ID,
		UserID:        hostUUID,
		Role:          "host",
		IsMuted:       false,
		IsVideoOn:     true,
		ScreenSharing: false,
	}

	if err := tx.Create(participant).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	tx.Commit()

	// Загрузить связанные данные
	DB.Preload("Host").Preload("Participants.User").First(conference, conference.ID)

	return conference, nil
}

// GetConferenceByReadableID получает конференцию по ReadableID
func GetConferenceByReadableID(readableID string) (*models.Conference, error) {
	var conference models.Conference
	if err := DB.Preload("Host").Preload("Participants.User").
		Where("readable_id = ?", readableID).First(&conference).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("conference not found")
		}
		return nil, err
	}
	return &conference, nil
}

// GetConferenceByID получает конференцию по ID
func GetConferenceByID(conferenceID string) (*models.Conference, error) {
	var conference models.Conference
	if err := DB.Preload("Host").Preload("Participants.User").First(&conference, "id = ?", conferenceID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("conference not found")
		}
		return nil, err
	}
	return &conference, nil
}

// UpdateConference обновляет конференцию
func UpdateConference(conferenceID, userID, title, status string, startTime *time.Time) (*models.Conference, error) {
	conference, err := GetConferenceByID(conferenceID)
	if err != nil {
		return nil, err
	}

	// Проверка что пользователь - хост
	if conference.HostID.String() != userID {
		return nil, errors.New("only host can update conference")
	}

	// Обновление полей
	if title != "" {
		conference.Title = title
	}
	if status != "" {
		if status != "scheduled" && status != "active" && status != "ended" {
			return nil, errors.New("invalid status")
		}
		conference.Status = status

		// Если завершаем - ставим время окончания
		if status == "ended" && conference.EndTime == nil {
			now := time.Now()
			conference.EndTime = &now  // ← ИСПРАВЛЕНО: присваиваем указатель
		}
	}
	if startTime != nil {
		conference.StartTime = *startTime
	}

	if err := DB.Save(conference).Error; err != nil {
		return nil, err
	}

	DB.Preload("Host").Preload("Participants.User").First(conference, conference.ID)

	return conference, nil
}

// DeleteConference удаляет конференцию
func DeleteConference(conferenceID, userID string) error {
	conference, err := GetConferenceByID(conferenceID)
	if err != nil {
		return err
	}

	// Проверка что пользователь - хост
	if conference.HostID.String() != userID {
		return errors.New("only host can delete conference")
	}

	if err := DB.Delete(conference).Error; err != nil {
		return err
	}

	return nil
}

// StartConference начинает конференцию
func StartConference(conferenceID, userID string) (*models.Conference, error) {
	conference, err := GetConferenceByID(conferenceID)
	if err != nil {
		return nil, err
	}

	if conference.HostID.String() != userID {
		return nil, errors.New("only host can start conference")
	}

	conference.Status = "active"
	if err := DB.Save(conference).Error; err != nil {
		return nil, err
	}

	DB.Preload("Host").Preload("Participants.User").First(conference, conference.ID)

	return conference, nil
}

// EndConference завершает конференцию
func EndConference(conferenceID, userID string) (*models.Conference, error) {
	conference, err := GetConferenceByID(conferenceID)
	if err != nil {
		return nil, err
	}

	if conference.HostID.String() != userID {
		return nil, errors.New("only host can end conference")
	}

	now := time.Now()
	conference.Status = "ended"
	conference.EndTime = &now  // ← ИСПРАВЛЕНО: присваиваем указатель

	if err := DB.Save(conference).Error; err != nil {
		return nil, err
	}

	DB.Preload("Host").Preload("Participants.User").First(conference, conference.ID)

	return conference, nil
}