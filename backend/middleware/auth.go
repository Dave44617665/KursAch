package middleware

import (
	"backend/utils"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			utils.SendResponse(c, http.StatusUnauthorized, false, nil, "Authorization header required")
			c.Abort()
			return
		}

		// Bearer <token>
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			utils.SendResponse(c, http.StatusUnauthorized, false, nil, "Invalid authorization header format")
			c.Abort()
			return
		}

		token := parts[1]
		
		// ValidateToken должен вернуть claims с UserID
		claims, err := utils.ValidateToken(token)
		if err != nil {
			utils.SendResponse(c, http.StatusUnauthorized, false, nil, "Invalid or expired token")
			c.Abort()
			return
		}

		// ⚠️ ВАЖНО: Сохраняем user_id в контекст
		// Убедитесь что имя поля совпадает с тем что в ValidateToken
		c.Set("user_id", claims.UserID.String())
		c.Set("email", claims.Email)

		c.Next()
	}
}