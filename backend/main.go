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
	"github.com/joho/godotenv" // Добавлено для загрузки .env
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

	// Автомиграции (удалена Chat)
	if err := services.DB.AutoMigrate(&models.User{}, &models.Conference{}); err != nil {
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

	// Настройка CORS (для frontend на localhost:3000)
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = []string{"http://localhost:3000", "http://127.0.0.1:3000"}
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	corsConfig.AllowHeaders = []string{"Origin", "Content-Type", "Authorization"}
	r.Use(cors.New(corsConfig))

	// Настройка роутов
	routes.SetupRoutes(r)

	// Запуск сервера на порту 8080
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}