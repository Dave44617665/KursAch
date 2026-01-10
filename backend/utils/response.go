package utils

import "github.com/gin-gonic/gin"

// APIResponse стандартизированная структура ответа
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// SendResponse отправляет стандартизированный ответ
func SendResponse(c *gin.Context, status int, success bool, data interface{}, errMsg string) {
	c.JSON(status, APIResponse{
		Success: success,
		Data:    data,
		Error:   errMsg,
	})
}