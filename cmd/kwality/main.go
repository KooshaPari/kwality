package main

import (
	"os"
	"strconv"

	"kwality/internal/database"
	"kwality/internal/server"
	"kwality/pkg/logger"
)

const (
	appName    = "kwality"
	appVersion = "1.0.0"
)

func main() {
	// Initialize logger
	log := logger.New(logger.Config{
		Level:  logger.InfoLevel,
		Format: logger.JSONFormat,
	})

	log.Info("Starting Kwality LLM Validation Platform",
		"version", appVersion)

	// Load configuration from environment variables
	config := loadConfigFromEnv()

	// Initialize database manager
	dbConfig := database.Config{
		PostgreSQL: database.PostgreSQLConfig{
			Host:               getEnv("DB_HOST", "localhost"),
			Port:               getEnvAsInt("DB_PORT", 5432),
			Database:           getEnv("DB_NAME", "kwality"),
			User:               getEnv("DB_USER", "postgres"),
			Password:           getEnv("DB_PASSWORD", "postgres"),
			MaxConnections:     getEnvAsInt("DB_MAX_CONNECTIONS", 20),
			MaxIdleConnections: getEnvAsInt("DB_MAX_IDLE_CONNECTIONS", 5),
			ConnMaxLifetime:    getEnv("DB_CONN_MAX_LIFETIME", "1h"),
			SSLMode:            getEnv("DB_SSL_MODE", "disable"),
		},
		Redis: database.RedisConfig{
			Host:        getEnv("REDIS_HOST", "localhost"),
			Port:        getEnvAsInt("REDIS_PORT", 6379),
			Password:    getEnv("REDIS_PASSWORD", ""),
			DB:          getEnvAsInt("REDIS_DB", 0),
			PoolSize:    getEnvAsInt("REDIS_POOL_SIZE", 10),
			IdleTimeout: getEnv("REDIS_IDLE_TIMEOUT", "5m"),
		},
		Neo4j: database.Neo4jConfig{
			URI:      getEnv("NEO4J_URI", "bolt://localhost:7687"),
			User:     getEnv("NEO4J_USER", "neo4j"),
			Password: getEnv("NEO4J_PASSWORD", "password"),
			Database: getEnv("NEO4J_DATABASE", "neo4j"),
		},
	}

	dbManager, err := database.NewManager(log, dbConfig)
	if err != nil {
		log.Error("Failed to initialize database manager", "error", err)
		os.Exit(1)
	}
	defer func() {
		if err := dbManager.Close(); err != nil {
			log.Error("Failed to close database connections", "error", err)
		}
	}()

	// Initialize and start server
	srv, err := server.NewServer(log, dbManager, config)
	if err != nil {
		log.Error("Failed to create server", "error", err)
		os.Exit(1)
	}

	// Start server (blocks until shutdown)
	if err := srv.Start(); err != nil {
		log.Error("Server failed to start", "error", err)
		os.Exit(1)
	}
}

// loadConfigFromEnv loads server configuration from environment variables
func loadConfigFromEnv() *server.Config {
	return &server.Config{
		Port:               getEnvAsInt("PORT", 3000),
		Environment:        getEnv("ENVIRONMENT", "development"),
		AllowedOrigins:     []string{getEnv("ALLOWED_ORIGINS", "*")},
		JWTSecret:          getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
		RateLimitRPS:       getEnvAsInt("RATE_LIMIT_RPS", 100),
		RateLimitBurst:     getEnvAsInt("RATE_LIMIT_BURST", 200),
		AuthRateLimitRPS:   getEnvAsInt("AUTH_RATE_LIMIT_RPS", 5),
		AuthRateLimitBurst: getEnvAsInt("AUTH_RATE_LIMIT_BURST", 10),
		ReadTimeout:        getEnvAsInt("READ_TIMEOUT", 30),
		WriteTimeout:       getEnvAsInt("WRITE_TIMEOUT", 30),
		IdleTimeout:        getEnvAsInt("IDLE_TIMEOUT", 120),
	}
}

// getEnv gets environment variable with default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvAsInt gets environment variable as integer with default value
func getEnvAsInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}