package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"kwality/internal/config"
	"kwality/internal/orchestrator"
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

	log.Info("Starting Kwality - AI Codebase Validation Platform",
		"version", appVersion,
		"build_time", time.Now().Format(time.RFC3339))

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatal("Failed to load configuration", "error", err)
	}

	log.Info("Configuration loaded",
		"environment", cfg.Environment,
		"port", cfg.Server.Port,
		"log_level", cfg.Logging.Level)

	// Initialize orchestrator
	orch, err := orchestrator.New(orchestrator.Config{
		Logger:        log,
		MaxWorkers:    cfg.Orchestrator.MaxWorkers,
		QueueSize:     cfg.Orchestrator.QueueSize,
		ResultStorage: cfg.Orchestrator.ResultStorage,
	})
	if err != nil {
		log.Fatal("Failed to initialize orchestrator", "error", err)
	}

	// Start orchestrator
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := orch.Start(ctx); err != nil {
		log.Fatal("Failed to start orchestrator", "error", err)
	}
	log.Info("Orchestrator started successfully")

	// Initialize HTTP server
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())

	// Initialize server with all components
	srv, err := server.New(server.Config{
		Logger:       log,
		Orchestrator: orch,
		Router:       router,
		Config:       cfg,
	})
	if err != nil {
		log.Fatal("Failed to initialize server", "error", err)
	}

	// Setup routes
	srv.SetupRoutes()

	// Create HTTP server
	httpServer := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	// Start server in goroutine
	go func() {
		log.Info("Starting HTTP server", "port", cfg.Server.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("HTTP server failed", "error", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("Shutting down Kwality...")

	// Graceful shutdown with timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// Shutdown HTTP server
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Error("HTTP server forced to shutdown", "error", err)
	}

	// Shutdown orchestrator
	cancel() // Cancel the orchestrator context
	if err := orch.Stop(shutdownCtx); err != nil {
		log.Error("Orchestrator forced to shutdown", "error", err)
	}

	log.Info("Kwality shutdown completed")
}