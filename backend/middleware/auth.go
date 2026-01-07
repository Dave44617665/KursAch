// middleware/auth.go обновленный (проверяет тип access)
package middleware

import (
	"net/http"
	"strings"

	"backend/utils"
	"github.com/gin-gonic/gin"
)

// AuthMiddleware middleware для проверки JWT (только access токен)
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			utils.SendResponse(c, http.StatusUnauthorized, false, nil, "Authorization header required")
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			utils.SendResponse(c, http.StatusUnauthorized, false, nil, "Invalid authorization header")
			c.Abort()
			return
		}

		claims, err := utils.ValidateToken(parts[1])
		if err != nil {
			utils.SendResponse(c, http.StatusUnauthorized, false, nil, "Invalid token: "+err.Error())
			c.Abort()
			return
		}

		if claims.Type != utils.AccessToken {
			utils.SendResponse(c, http.StatusUnauthorized, false, nil, "Invalid token type")
			c.Abort()
			return
		}

		// Сохраняем userID в контексте для дальнейшего использования
		c.Set("userID", claims.UserID)
		c.Next()
	}
}