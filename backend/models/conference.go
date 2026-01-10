package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Conference struct {
	ID           uuid.UUID     `gorm:"type:uuid;primaryKey" json:"id"`
	ReadableID   string        `gorm:"type:varchar(10);uniqueIndex;not null" json:"readable_id"`
	HostID       uuid.UUID     `gorm:"type:uuid;not null" json:"host_id"`
	Host         User          `gorm:"foreignKey:HostID" json:"host,omitempty"`
	Title        string        `gorm:"size:200" json:"title"`
	Status       string        `gorm:"size:20;default:'scheduled'" json:"status"`
	StartTime    time.Time     `json:"start_time"`
	EndTime      *time.Time    `json:"end_time,omitempty"`
	Participants []Participant `gorm:"foreignKey:ConferenceID" json:"participants,omitempty"`
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
}

func (c *Conference) BeforeCreate(tx *gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}