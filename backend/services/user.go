package services

import (
	"errors"

	"backend/models"
	"backend/utils"
	"gorm.io/gorm"
)

// GetUserByID получает пользователя по ID
func GetUserByID(userID string) (*models.User, error) {
	var user models.User
	if err := DB.First(&user, "id = ?", userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("user not found")
		}
		return nil, err
	}
	return &user, nil
}

// UpdateUserProfile обновляет профиль пользователя
func UpdateUserProfile(userID, nickname, email string) (*models.User, error) {
	user, err := GetUserByID(userID)
	if err != nil {
		return nil, err
	}

	// Обновление полей
	if nickname != "" {
		user.Nickname = nickname
	}

	if email != "" {
		// Проверка что email не занят другим пользователем
		var existing models.User
		if err := DB.Where("email = ? AND id != ?", email, userID).First(&existing).Error; err == nil {
			return nil, errors.New("email already in use")
		}
		user.Email = email
	}

	if err := DB.Save(user).Error; err != nil {
		return nil, err
	}

	return user, nil
}

// ChangeUserPassword изменяет пароль пользователя
func ChangeUserPassword(userID, oldPassword, newPassword string) error {
	user, err := GetUserByID(userID)
	if err != nil {
		return err
	}

	// Проверка старого пароля
	if !utils.CheckPassword(user.Password, oldPassword) {
		return errors.New("old password is incorrect")
	}

	// Хеширование нового пароля
	hashedPassword, err := utils.HashPassword(newPassword)
	if err != nil {
		return err
	}

	user.Password = hashedPassword
	if err := DB.Save(user).Error; err != nil {
		return err
	}

	return nil
}

// UpdateUserAvatar обновляет аватар пользователя
func UpdateUserAvatar(userID, avatarURL string) (*models.User, error) {
	user, err := GetUserByID(userID)
	if err != nil {
		return nil, err
	}

	user.AvatarURL = avatarURL
	if err := DB.Save(user).Error; err != nil {
		return nil, err
	}

	return user, nil
}

// DeleteUserAccount удаляет аккаунт пользователя
func DeleteUserAccount(userID, password string) error {
	user, err := GetUserByID(userID)
	if err != nil {
		return err
	}

	// Подтверждение пароля
	if !utils.CheckPassword(user.Password, password) {
		return errors.New("incorrect password")
	}

	if err := DB.Delete(user).Error; err != nil {
		return err
	}

	return nil
}