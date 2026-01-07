package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Conference модель конференции
type Conference struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:uuid_generate_v4()"` // UUID как primary key
	HostID    uuid.UUID `gorm:"type:uuid;not null;index"`                         // FK на User.ID с индексом
	Title     string    `gorm:"not null"`                                         // Название конференции
	Status    string    `gorm:"default:scheduled"`                                // Status: scheduled/active/ended
	StartTime time.Time // Время начала
	EndTime   time.Time // Время окончания
	CreatedAt time.Time // Время создания
	UpdatedAt time.Time // Время обновления
}

// BeforeCreate хук для генерации UUID
func (c *Conference) BeforeCreate(tx *gorm.DB) (err error) {
	c.ID = uuid.New()
	return nil
}