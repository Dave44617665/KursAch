// routes/routes.go обновленный
package routes

import (
	"backend/handlers"
	"backend/middleware"
	"github.com/gin-gonic/gin"
)

// SetupRoutes настраивает все роуты
func SetupRoutes(r *gin.Engine) {
	// Публичные роуты
	r.POST("/register", handlers.RegisterHandler)
	r.POST("/login", handlers.LoginHandler)
	r.POST("/refresh", handlers.RefreshHandler) // Новый роут для refresh

	// Защищенные роуты (добавьте здесь роуты для конференций, чата и т.д. позже)
	protected := r.Group("/")
	protected.Use(middleware.AuthMiddleware())
	// Пример: protected.GET("/profile", handlers.GetProfileHandler) // Добавьте handler позже
}