package server

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"kwality/internal/config"
	"kwality/internal/orchestrator"
	"kwality/pkg/logger"
)

// Server represents the HTTP server
type Server struct {
	logger       logger.Logger
	orchestrator *orchestrator.Orchestrator
	router       *gin.Engine
	config       *config.Config
}

// Config holds server configuration
type Config struct {
	Logger       logger.Logger
	Orchestrator *orchestrator.Orchestrator
	Router       *gin.Engine
	Config       *config.Config
}

// New creates a new server instance
func New(config Config) (*Server, error) {
	return &Server{
		logger:       config.Logger,
		orchestrator: config.Orchestrator,
		router:       config.Router,
		config:       config.Config,
	}, nil
}

// SetupRoutes configures all HTTP routes
func (s *Server) SetupRoutes() {
	// Add middleware
	s.router.Use(s.loggingMiddleware())
	s.router.Use(s.corsMiddleware())
	s.router.Use(s.rateLimitMiddleware())

	// API routes
	api := s.router.Group("/api/v1")
	{
		// Health check
		api.GET("/health", s.handleHealth)
		api.GET("/ready", s.handleReady)

		// Validation endpoints
		validation := api.Group("/validate")
		{
			validation.POST("/codebase", s.handleValidateCodebase)
			validation.GET("/:id", s.handleGetValidationResult)
			validation.GET("/:id/status", s.handleGetValidationStatus)
			validation.DELETE("/:id", s.handleCancelValidation)
		}

		// Tasks endpoints
		tasks := api.Group("/tasks")
		{
			tasks.GET("", s.handleListTasks)
			tasks.GET("/:id", s.handleGetTask)
		}

		// Metrics endpoints
		metrics := api.Group("/metrics")
		{
			metrics.GET("/dashboard", s.handleMetricsDashboard)
			metrics.GET("/engines", s.handleEngineMetrics)
		}

		// Administration endpoints
		admin := api.Group("/admin")
		{
			admin.GET("/status", s.handleAdminStatus)
			admin.POST("/engines/reload", s.handleReloadEngines)
			admin.GET("/config", s.handleGetConfig)
		}
	}

	// Documentation
	s.router.GET("/docs", s.handleDocs)
	s.router.Static("/static", "./web/static")
}

// Middleware functions

func (s *Server) loggingMiddleware() gin.HandlerFunc {
	return gin.LoggerWithConfig(gin.LoggerConfig{
		Formatter: func(param gin.LogFormatterParams) string {
			s.logger.Info("HTTP request",
				"method", param.Method,
				"path", param.Path,
				"status", param.StatusCode,
				"latency", param.Latency,
				"ip", param.ClientIP,
				"user_agent", param.Request.UserAgent(),
			)
			return ""
		},
	})
}

func (s *Server) corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func (s *Server) rateLimitMiddleware() gin.HandlerFunc {
	// Simple rate limiting middleware
	// In production, use a more sophisticated rate limiter
	return func(c *gin.Context) {
		// Placeholder for rate limiting logic
		c.Next()
	}
}

// Health check handlers

func (s *Server) handleHealth(c *gin.Context) {
	status := map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now(),
		"version":   "1.0.0",
		"uptime":    time.Since(time.Now()), // Placeholder
	}

	c.JSON(http.StatusOK, status)
}

func (s *Server) handleReady(c *gin.Context) {
	// Check if orchestrator is ready
	orchestratorStatus := s.orchestrator.GetHealthStatus()
	
	if orchestratorStatus["status"] == "healthy" {
		c.JSON(http.StatusOK, map[string]string{
			"status": "ready",
		})
	} else {
		c.JSON(http.StatusServiceUnavailable, map[string]string{
			"status": "not ready",
			"reason": "orchestrator not healthy",
		})
	}
}

// Validation handlers

func (s *Server) handleValidateCodebase(c *gin.Context) {
	// This is a placeholder implementation
	// In a real implementation, you would:
	// 1. Parse the request body to extract codebase information
	// 2. Create a codebase model
	// 3. Submit to orchestrator
	// 4. Return task ID

	c.JSON(http.StatusAccepted, gin.H{
		"task_id": "placeholder-task-id",
		"status":  "queued",
		"message": "Validation task submitted successfully",
	})
}

func (s *Server) handleGetValidationResult(c *gin.Context) {
	taskID := c.Param("id")
	
	result, err := s.orchestrator.GetValidationResult(taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Validation result not found",
		})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (s *Server) handleGetValidationStatus(c *gin.Context) {
	taskID := c.Param("id")
	
	result, err := s.orchestrator.GetValidationResult(taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Validation task not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"task_id": taskID,
		"status":  result.Status,
		"progress": map[string]interface{}{
			"started_at":   result.StartedAt,
			"completed_at": result.CompletedAt,
			"duration":     result.Duration,
		},
	})
}

func (s *Server) handleCancelValidation(c *gin.Context) {
	taskID := c.Param("id")
	
	// Placeholder for cancellation logic
	s.logger.Info("Cancellation requested", "task_id", taskID)
	
	c.JSON(http.StatusOK, gin.H{
		"task_id": taskID,
		"status":  "cancelled",
	})
}

// Task handlers

func (s *Server) handleListTasks(c *gin.Context) {
	status := c.Query("status")
	limit := 50 // Default limit

	tasks, err := s.orchestrator.ListTasks(orchestrator.ValidationTaskStatus(status), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve tasks",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"tasks": tasks,
		"total": len(tasks),
	})
}

func (s *Server) handleGetTask(c *gin.Context) {
	taskID := c.Param("id")
	
	result, err := s.orchestrator.GetValidationResult(taskID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Task not found",
		})
		return
	}

	c.JSON(http.StatusOK, result)
}

// Metrics handlers

func (s *Server) handleMetricsDashboard(c *gin.Context) {
	// Placeholder for metrics dashboard
	c.JSON(http.StatusOK, gin.H{
		"message": "Metrics dashboard endpoint",
		"note":    "Dashboard implementation pending",
	})
}

func (s *Server) handleEngineMetrics(c *gin.Context) {
	// Placeholder for engine metrics
	c.JSON(http.StatusOK, gin.H{
		"engines": []string{"static_analysis", "runtime_validation", "security_scanning"},
		"status":  "operational",
	})
}

// Admin handlers

func (s *Server) handleAdminStatus(c *gin.Context) {
	orchestratorStatus := s.orchestrator.GetHealthStatus()
	
	status := map[string]interface{}{
		"server": map[string]interface{}{
			"status":  "running",
			"version": "1.0.0",
			"uptime":  time.Since(time.Now()), // Placeholder
		},
		"orchestrator": orchestratorStatus,
		"configuration": map[string]interface{}{
			"environment":   s.config.Environment,
			"max_workers":   s.config.Orchestrator.MaxWorkers,
			"queue_size":    s.config.Orchestrator.QueueSize,
		},
	}

	c.JSON(http.StatusOK, status)
}

func (s *Server) handleReloadEngines(c *gin.Context) {
	// Placeholder for engine reloading
	s.logger.Info("Engine reload requested")
	
	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "Engines reloaded successfully",
	})
}

func (s *Server) handleGetConfig(c *gin.Context) {
	// Return safe configuration (without secrets)
	safeConfig := map[string]interface{}{
		"environment":   s.config.Environment,
		"server": map[string]interface{}{
			"port": s.config.Server.Port,
			"host": s.config.Server.Host,
		},
		"orchestrator": map[string]interface{}{
			"max_workers": s.config.Orchestrator.MaxWorkers,
			"queue_size":  s.config.Orchestrator.QueueSize,
		},
		"validation": s.config.Validation,
	}

	c.JSON(http.StatusOK, safeConfig)
}

// Documentation handler

func (s *Server) handleDocs(c *gin.Context) {
	// Placeholder for API documentation
	c.JSON(http.StatusOK, gin.H{
		"api_version": "v1",
		"documentation": "API documentation will be available here",
		"endpoints": map[string]interface{}{
			"health":     "GET /api/v1/health",
			"validation": "POST /api/v1/validate/codebase",
			"results":    "GET /api/v1/validate/:id",
			"tasks":      "GET /api/v1/tasks",
			"metrics":    "GET /api/v1/metrics/dashboard",
		},
	})
}