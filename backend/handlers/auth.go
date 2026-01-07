// handlers/auth.go обновленный
package handlers

import (
	"net/http"

	"backend/services"
	"backend/utils"
	"github.com/gin-gonic/gin"
)

// RegisterHandler обработчик регистрации
func RegisterHandler(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Nickname string `json:"nickname" binding:"required"`
		Password string `json:"password" binding:"required,min=6"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.SendResponse(c, http.StatusBadRequest, false, nil, "Invalid request: "+err.Error())
		return
	}

	user, err := services.RegisterUser(req.Email, req.Nickname, req.Password)
	if err != nil {
		utils.SendResponse(c, http.StatusInternalServerError, false, nil, err.Error())
		return
	}

	utils.SendResponse(c, http.StatusCreated, true, user, "")
}

// LoginHandler обработчик логина (возвращает access и refresh)
func LoginHandler(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.SendResponse(c, http.StatusBadRequest, false, nil, "Invalid request: "+err.Error())
		return
	}

	accessToken, refreshToken, err := services.LoginUser(req.Email, req.Password)
	if err != nil {
		utils.SendResponse(c, http.StatusUnauthorized, false, nil, err.Error())
		return
	}

	utils.SendResponse(c, http.StatusOK, true, map[string]string{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
	}, "")
}

// RefreshHandler обработчик обновления токена
func RefreshHandler(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.SendResponse(c, http.StatusBadRequest, false, nil, "Invalid request: "+err.Error())
		return
	}

	newAccessToken, err := services.RefreshToken(req.RefreshToken)
	if err != nil {
		utils.SendResponse(c, http.StatusUnauthorized, false, nil, err.Error())
		return
	}

	utils.SendResponse(c, http.StatusOK, true, map[string]string{"access_token": newAccessToken}, "")
}