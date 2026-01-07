package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Conference struct {
	ID        string     `gorm:"type:uuid;primaryKey" json:"id"`
	HostID    string     `gorm:"type:uuid;not null" json:"host_id"`
	Host      User       `gorm:"foreignKey:HostID" json:"host,omitempty"`
	Title     string     `gorm:"size:200" json:"title"`
	Status    string     `gorm:"size:20;default:'scheduled'" json:"status"` // scheduled, active, ended
	StartTime time.Time  `json:"start_time"`
	EndTime   *time.Time `json:"end_time,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

func (c *Conference) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return nil
}
