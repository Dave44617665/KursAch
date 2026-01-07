package routes

import (
	"backend/handlers"
	"backend/middleware"
	"github.com/gin-gonic/gin"
)

// SetupRoutes настраивает все роуты
func SetupRoutes(r *gin.Engine) {
	// API группа
	api := r.Group("/api")
	
	// Публичные роуты
	{
		api.POST("/register", handlers.RegisterHandler)
		api.POST("/login", handlers.LoginHandler)
		api.POST("/refresh", handlers.RefreshHandler)
	}

	// Защищенные роуты
	protected := api.Group("/")
	protected.Use(middleware.AuthMiddleware())
	{
		// Auth
		protected.GET("/auth/me", handlers.GetMeHandler)
		
		// User Profile
		protected.GET("/users/profile", handlers.GetProfileHandler)
		protected.PUT("/users/profile", handlers.UpdateProfileHandler)
		protected.PATCH("/users/password", handlers.ChangePasswordHandler)
		protected.PATCH("/users/avatar", handlers.UpdateAvatarHandler)
		protected.DELETE("/users/account", handlers.DeleteAccountHandler)
	}
}