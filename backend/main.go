// main.go обновленный
package main

import (
	"log"

	"backend/config"
	"backend/models"
	"backend/routes"
	"backend/services"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Инициализация DB
func initDB() {
	cfg := config.LoadConfig()
	var err error
	services.DB, err = gorm.Open(postgres.Open(cfg.DBDSN), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Создание расширения для UUID (если не существует)
	if err := services.DB.Exec("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";").Error; err != nil {
		log.Fatalf("Failed to create uuid-ossp extension: %v", err)
	}

	// Автомиграции (убрана Chat - будет через WebSocket)
	if err := services.DB.AutoMigrate(
		&models.User{},
		&models.Conference{},
		&models.Participant{},
	); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}

	log.Println("Database connected and migrated successfully")
}

func main() {
	// Загрузка .env файла
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	initDB()

	r := gin.Default()

	// CORS - разрешаем запросы с вашего локального frontend
	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{
			"http://localhost:3000",
			"http://127.0.0.1:3000",
			"http://81.30.105.33:3000",
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept"},
		AllowCredentials: true,
		AllowWebSockets:  true,
		MaxAge:           12 * 3600,
	}))

	routes.SetupRoutes(r)

	// Добавьте /ping роут ПОСЛЕ SetupRoutes
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "pong"})
	})

	log.Println("🚀 Server starting on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}
