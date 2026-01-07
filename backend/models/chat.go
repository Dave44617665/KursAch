package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Chat struct {
	ID           string    `gorm:"type:uuid;primaryKey" json:"id"`
	ConferenceID string    `gorm:"type:uuid;not null" json:"conference_id"`
	UserID       string    `gorm:"type:uuid;not null" json:"user_id"`
	User         User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Text         string    `gorm:"type:text;not null" json:"text"`
	SendTime     time.Time `json:"send_time"`
}

func (c *Chat) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	if c.SendTime.IsZero() {
		c.SendTime = time.Now()
	}
	return nil
}
