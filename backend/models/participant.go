package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Participant struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	ConferenceID  uuid.UUID  `gorm:"type:uuid;not null;index" json:"conference_id"`
	UserID        uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	User          User       `gorm:"foreignKey:UserID" json:"user"`
	Role          string     `gorm:"size:20;default:'participant'" json:"role"`
	IsMuted       bool       `gorm:"default:false" json:"is_muted"`
	IsVideoOn     bool       `gorm:"default:true" json:"is_video_on"`
	ScreenSharing bool       `gorm:"default:false" json:"screen_sharing"`
	JoinedAt      time.Time  `gorm:"autoCreateTime" json:"joined_at"`
	LeftAt        *time.Time `json:"left_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

func (p *Participant) BeforeCreate(tx *gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	if p.JoinedAt.IsZero() {
		p.JoinedAt = time.Now()
	}
	return nil
}