package services

import (
	"errors"
	"time"

	"backend/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// GetParticipants получает всех активных участников конференции
func GetParticipants(conferenceID string) ([]models.Participant, error) {
	var participants []models.Participant
	if err := DB.Preload("User").
		Where("conference_id = ? AND left_at IS NULL", conferenceID).
		Order("joined_at ASC").
		Find(&participants).Error; err != nil {
		return nil, err
	}
	return participants, nil
}

// JoinConference добавляет пользователя как участника конференции
func JoinConference(conferenceID, userID string) (*models.Participant, error) {
	// Проверка что конференция существует и активна
	conference, err := GetConferenceByID(conferenceID)
	if err != nil {
		return nil, err
	}

	if conference.Status != "active" {
		return nil, errors.New("conference is not active")
	}

	// Проверка что пользователь еще не участник
	var existing models.Participant
	if err := DB.Where("conference_id = ? AND user_id = ? AND left_at IS NULL",
		conferenceID, userID).First(&existing).Error; err == nil {
		// Уже участник - вернуть существующего
		DB.Preload("User").First(&existing, existing.ID)
		return &existing, nil
	}

	confUUID, err := uuid.Parse(conferenceID)
	if err != nil {
		return nil, errors.New("invalid conference ID")
	}

	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, errors.New("invalid user ID")
	}

	// Создать нового участника
	participant := &models.Participant{
		ID:            uuid.New(),
		ConferenceID:  confUUID,
		UserID:        userUUID,
		Role:          "participant",
		IsMuted:       false,
		IsVideoOn:     true,
		ScreenSharing: false,
	}

	if err := DB.Create(participant).Error; err != nil {
		return nil, err
	}

	DB.Preload("User").First(participant, participant.ID)

	return participant, nil
}

// AddParticipant добавляет участника вручную (хост/админ)
func AddParticipant(conferenceID, requestUserID, targetUserID, role string) (*models.Participant, error) {
	// Проверка прав
	if !IsHostOrAdmin(requestUserID, conferenceID) {
		return nil, errors.New("only host or admin can add participants")
	}

	// Проверка существования целевого пользователя
	if _, err := GetUserByID(targetUserID); err != nil {
		return nil, errors.New("user not found")
	}

	// Проверка что пользователь уже не участник
	var existing models.Participant
	if err := DB.Where("conference_id = ? AND user_id = ? AND left_at IS NULL",
		conferenceID, targetUserID).First(&existing).Error; err == nil {
		return nil, errors.New("user is already a participant")
	}

	// Валидация роли
	if role == "" {
		role = "participant"
	}
	if role != "admin" && role != "participant" {
		return nil, errors.New("invalid role")
	}

	confUUID, err := uuid.Parse(conferenceID)
	if err != nil {
		return nil, errors.New("invalid conference ID")
	}

	targetUUID, err := uuid.Parse(targetUserID)
	if err != nil {
		return nil, errors.New("invalid user ID")
	}

	participant := &models.Participant{
		ID:            uuid.New(),
		ConferenceID:  confUUID,
		UserID:        targetUUID,
		Role:          role,
		IsMuted:       false,
		IsVideoOn:     true,
		ScreenSharing: false,
	}

	if err := DB.Create(participant).Error; err != nil {
		return nil, err
	}

	DB.Preload("User").First(participant, participant.ID)

	return participant, nil
}

// UpdateParticipant обновляет состояние участника
func UpdateParticipant(conferenceID, participantID, userID string, isMuted, isVideoOn, screenSharing *bool) (*models.Participant, error) {
	var participant models.Participant
	if err := DB.Where("id = ? AND conference_id = ?", participantID, conferenceID).
		First(&participant).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("participant not found")
		}
		return nil, err
	}

	// Пользователь может обновлять только свое состояние или админ/хост любое
	if participant.UserID.String() != userID && !IsHostOrAdmin(userID, conferenceID) {
		return nil, errors.New("cannot update other participant's state")
	}

	// Обновление полей
	if isMuted != nil {
		participant.IsMuted = *isMuted
	}
	if isVideoOn != nil {
		participant.IsVideoOn = *isVideoOn
	}
	if screenSharing != nil {
		participant.ScreenSharing = *screenSharing
	}

	if err := DB.Save(&participant).Error; err != nil {
		return nil, err
	}

	DB.Preload("User").First(&participant, participant.ID)

	return &participant, nil
}

// RemoveParticipant удаляет участника из конференции
func RemoveParticipant(conferenceID, participantID, userID string) error {
	// Проверка прав
	if !IsHostOrAdmin(userID, conferenceID) {
		return errors.New("only host or admin can remove participants")
	}

	var participant models.Participant
	if err := DB.Where("id = ? AND conference_id = ?", participantID, conferenceID).
		First(&participant).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("participant not found")
		}
		return err
	}

	// Нельзя удалить хоста
	if participant.Role == "host" {
		return errors.New("cannot remove host")
	}

	// Пометить как покинувшего
	now := time.Now()
	participant.LeftAt = &now
	if err := DB.Save(&participant).Error; err != nil {
		return err
	}

	return nil
}

// LeaveConference участник покидает конференцию
func LeaveConference(conferenceID, userID string) error {
	var participant models.Participant
	if err := DB.Where("conference_id = ? AND user_id = ? AND left_at IS NULL",
		conferenceID, userID).First(&participant).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("you are not in this conference")
		}
		return err
	}

	// Хост не может просто так покинуть
	if participant.Role == "host" {
		return errors.New("host must end the conference or transfer host role")
	}

	now := time.Now()
	participant.LeftAt = &now
	if err := DB.Save(&participant).Error; err != nil {
		return err
	}

	return nil
}

// IsHostOrAdmin проверяет является ли пользователь хостом или админом
func IsHostOrAdmin(userID, conferenceID string) bool {
	// Проверка хоста
	var conference models.Conference
	if err := DB.First(&conference, "id = ?", conferenceID).Error; err != nil {
		return false
	}
	if conference.HostID.String() == userID {
		return true
	}

	// Проверка админа
	var participant models.Participant
	if err := DB.Where("conference_id = ? AND user_id = ? AND role = ? AND left_at IS NULL",
		conferenceID, userID, "admin").First(&participant).Error; err == nil {
		return true
	}

	return false
}