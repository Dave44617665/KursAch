// services/auth.go обновленный
package services

import (
	"errors"

	"backend/models"
	"backend/utils"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Внешняя переменная для DB (инициализируется в main)
var DB *gorm.DB

// RegisterUser создает нового пользователя
func RegisterUser(email, nickname, password string) (*models.User, error) {
	// Проверка на существование пользователя
	var existingUser models.User
	if err := DB.Where("email = ? OR nickname = ?", email, nickname).First(&existingUser).Error; err == nil {
		return nil, errors.New("user with this email or nickname already exists")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	// Хэширование пароля
	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return nil, err
	}

	user := &models.User{
		ID:       uuid.New(), // Генерация UUID
		Email:    email,
		Nickname: nickname,
		Password: hashedPassword,
	}

	if err := DB.Create(user).Error; err != nil {
		return nil, err
	}

	return user, nil
}

// LoginUser аутентифицирует пользователя и возвращает access и refresh токены
func LoginUser(email, password string) (string, string, error) {
	var user models.User
	if err := DB.Where("email = ?", email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", "", errors.New("invalid email or password")
		}
		return "", "", err
	}

	// Проверка пароля
	if !utils.CheckPassword(user.Password, password) { // ← ИСПРАВЬТЕ ПОРЯДОК!
		return "", "", errors.New("invalid email or password")
	}

	// Генерация access токена - передаём UUID
	accessToken, err := utils.GenerateToken(user.ID, user.Email) // user.ID это uuid.UUID
	if err != nil {
		return "", "", err
	}

	// Генерация refresh токена
	refreshToken, err := utils.GenerateRefreshToken(user.ID, user.Email)
	if err != nil {
		return "", "", err
	}

	return accessToken, refreshToken, nil
}

// RefreshToken обновляет access токен с использованием refresh токена
func RefreshToken(refreshTokenString string) (string, error) {
	claims, err := utils.ValidateToken(refreshTokenString)
	if err != nil {
		return "", errors.New("invalid refresh token")
	}

	if claims.Type != utils.RefreshToken {
		return "", errors.New("token is not a refresh token")
	}

	// Генерация нового access токена
	newAccessToken, err := utils.GenerateToken(claims.UserID, claims.Email)
	if err != nil {
		return "", err
	}

	return newAccessToken, nil
}
