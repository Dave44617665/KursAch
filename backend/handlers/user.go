package handlers

import (
	"backend/services"
	"backend/utils"
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetMeHandler - получить информацию о текущем пользователе
func GetMeHandler(c *gin.Context) {
	userID := c.GetString("user_id")

	user, err := services.GetUserByID(userID)
	if err != nil {
		utils.SendResponse(c, http.StatusNotFound, false, nil, err.Error())
		return
	}

	utils.SendResponse(c, http.StatusOK, true, user, "")
}

// GetProfileHandler - получить профиль пользователя
func GetProfileHandler(c *gin.Context) {
	userID := c.GetString("user_id")

	user, err := services.GetUserByID(userID)
	if err != nil {
		utils.SendResponse(c, http.StatusNotFound, false, nil, err.Error())
		return
	}

	utils.SendResponse(c, http.StatusOK, true, user, "")
}

// UpdateProfileHandler - обновить профиль
func UpdateProfileHandler(c *gin.Context) {
	userID := c.GetString("user_id")

	var req struct {
		Nickname string `json:"nickname"`
		Email    string `json:"email" binding:"omitempty,email"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.SendResponse(c, http.StatusBadRequest, false, nil, err.Error())
		return
	}

	user, err := services.UpdateUserProfile(userID, req.Nickname, req.Email)
	if err != nil {
		if err.Error() == "email already in use" {
			utils.SendResponse(c, http.StatusConflict, false, nil, err.Error())
		} else {
			utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		}
		return
	}

	utils.SendResponse(c, http.StatusOK, true, user, "")
}

// ChangePasswordHandler - изменить пароль
func ChangePasswordHandler(c *gin.Context) {
	userID := c.GetString("user_id")

	var req struct {
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required,min=6"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.SendResponse(c, http.StatusBadRequest, false, nil, err.Error())
		return
	}

	err := services.ChangeUserPassword(userID, req.OldPassword, req.NewPassword)
	if err != nil {
		if err.Error() == "old password is incorrect" {
			utils.SendResponse(c, http.StatusUnauthorized, false, nil, err.Error())
		} else {
			utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		}
		return
	}

	utils.SendResponse(c, http.StatusOK, true, gin.H{"message": "Password changed successfully"}, "")
}

// UpdateAvatarHandler - обновить аватар
func UpdateAvatarHandler(c *gin.Context) {
	userID := c.GetString("user_id")

	var req struct {
		AvatarURL string `json:"avatar_url" binding:"required,url"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.SendResponse(c, http.StatusBadRequest, false, nil, err.Error())
		return
	}

	user, err := services.UpdateUserAvatar(userID, req.AvatarURL)
	if err != nil {
		utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		return
	}

	utils.SendResponse(c, http.StatusOK, true, user, "")
}

// DeleteAccountHandler - удалить аккаунт
func DeleteAccountHandler(c *gin.Context) {
	userID := c.GetString("user_id")

	var req struct {
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.SendResponse(c, http.StatusBadRequest, false, nil, err.Error())
		return
	}

	err := services.DeleteUserAccount(userID, req.Password)
	if err != nil {
		if err.Error() == "incorrect password" {
			utils.SendResponse(c, http.StatusUnauthorized, false, nil, err.Error())
		} else {
			utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		}
		return
	}

	utils.SendResponse(c, http.StatusOK, true, gin.H{"message": "Account deleted successfully"}, "")
}