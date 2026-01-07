package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// User модель пользователя
type User struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:uuid_generate_v4()"` // UUID как primary key
	Email     string    `gorm:"unique;not null;index"`                            // Уникальный email с индексом
	Nickname  string    `gorm:"unique;not null;index"`                            // Уникальный никнейм с индексом
	Password  string    `gorm:"not null"`                                         // Хэш пароля
	AvatarURL string    // URL аватара (опционально)
	CreatedAt time.Time // Время создания
	UpdatedAt time.Time // Время обновления
}

// BeforeCreate хук для генерации UUID (GORM вызовет автоматически)
func (u *User) BeforeCreate(tx *gorm.DB) (err error) {
	u.ID = uuid.New()
	return nil
}