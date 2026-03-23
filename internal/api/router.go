package api

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/valentinesamuel/smspit/internal/config"
	"github.com/valentinesamuel/smspit/internal/otp"
	"github.com/valentinesamuel/smspit/internal/purge"
	"github.com/valentinesamuel/smspit/internal/sse"
	"github.com/valentinesamuel/smspit/internal/webhook"
)

type Server struct {
	db          *sql.DB
	cfg         *config.Config
	broker      *sse.Broker
	dispatcher  *webhook.Dispatcher
	purger      *purge.Purger
	otpDetector *otp.Detector
}

func NewServer(db *sql.DB, cfg *config.Config, broker *sse.Broker, dispatcher *webhook.Dispatcher, purger *purge.Purger, detector *otp.Detector) *Server {
	return &Server{
		db:          db,
		cfg:         cfg,
		broker:      broker,
		dispatcher:  dispatcher,
		purger:      purger,
		otpDetector: detector,
	}
}

func (s *Server) SetupRouter() *gin.Engine {
	if s.cfg.NodeEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// CORS
	origins := strings.Split(s.cfg.AllowedOrigins, ",")
	r.Use(cors.New(cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "X-API-Key"},
		AllowCredentials: false,
	}))

	// API Key middleware — only guards the message ingestion endpoint (POST /api/messages)
	// so external backends require a key while the UI always works without one
	if s.cfg.APIKey != "" {
		r.Use(func(c *gin.Context) {
			if c.Request.Method == http.MethodPost && c.Request.URL.Path == "/api/messages" {
				if c.GetHeader("X-API-Key") != s.cfg.APIKey {
					c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
					return
				}
			}
			c.Next()
		})
	}

	api := r.Group("/api")
	{
		// Messages
		api.POST("/messages", s.createMessage)
		api.GET("/messages", s.listMessages)
		api.GET("/messages/latest", s.latestMessage)
		api.GET("/messages/export", s.exportMessages)
		api.GET("/messages/ids", s.listMessageIDs)
		api.POST("/messages/bulk-read", s.bulkMarkMessagesRead)
		api.POST("/messages/bulk-delete", s.bulkDeleteMessages)
		api.GET("/messages/:id", s.getMessage)
		api.PATCH("/messages/:id/read", s.markMessageRead)
		api.DELETE("/messages/:id", s.deleteMessage)
		api.DELETE("/messages", s.clearMessages)

		// SSE
		api.GET("/events", s.handleSSE)

		// Projects
		api.GET("/projects", s.listProjects)
		api.POST("/projects", s.createProject)
		api.GET("/projects/:name", s.getProject)
		api.PATCH("/projects/:name", s.updateProject)
		api.DELETE("/projects/:name", s.deleteProject)

		// Stats
		api.GET("/stats", s.getStats)

		// Webhooks
		api.GET("/webhooks/dead-letters", s.listDeadLetters)
		api.GET("/webhooks/dead-letters/ids", s.listDeadLetterIDs)
		api.POST("/webhooks/dead-letters/bulk-retry", s.bulkRetryDeadLetters)
		api.POST("/webhooks/dead-letters/bulk-delete", s.bulkDeleteDeadLetters)
		api.POST("/webhooks/dead-letters/:id/retry", s.retryDeadLetter)

		// Query runner
		api.POST("/query", s.runQuery)
		api.GET("/query/schema", s.getSchema)

		// Testing
		api.GET("/testing/otp", s.testingGetOTP)
		api.DELETE("/testing/messages", s.testingDeleteMessages)
		api.GET("/testing/wait", s.testingWait)
		api.POST("/testing/seed", s.testingSeed)
	}

	return r
}
