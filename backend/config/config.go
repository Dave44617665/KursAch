// config/config.go обновленный
package config

import (
	"os"
	"time"
)

// Config содержит глобальные конфигурации
type Config struct {
	DBDSN                string        // DSN для PostgreSQL
	JWTSecret            string        // Секрет для JWT
	JWTExpiresIn         time.Duration // Время жизни access token
	RefreshTokenExpiresIn time.Duration // Время жизни refresh token
}

// LoadConfig загружает конфигурацию из env
func LoadConfig() *Config {
	jwtExpires, err := time.ParseDuration(getEnv("JWT_EXPIRES_IN", "24h"))
	if err != nil {
		panic("Invalid JWT_EXPIRES_IN: " + err.Error())
	}

	refreshExpires, err := time.ParseDuration(getEnv("REFRESH_TOKEN_EXPIRES_IN", "168h"))
	if err != nil {
		panic("Invalid REFRESH_TOKEN_EXPIRES_IN: " + err.Error())
	}

	return &Config{
		DBDSN:                getEnv("DB_DSN", ""), // Предполагаем, что DB_DSN в .env
		JWTSecret:            getEnv("JWT_SECRET", ""),
		JWTExpiresIn:         jwtExpires,
		RefreshTokenExpiresIn: refreshExpires,
	}
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}