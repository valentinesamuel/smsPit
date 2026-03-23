package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/valentinesamuel/smspit/internal/api"
	"github.com/valentinesamuel/smspit/internal/config"
	"github.com/valentinesamuel/smspit/internal/db"
	"github.com/valentinesamuel/smspit/internal/otp"
	"github.com/valentinesamuel/smspit/internal/purge"
	"github.com/valentinesamuel/smspit/internal/sse"
	"github.com/valentinesamuel/smspit/internal/webhook"
)

//go:embed all:web
var webFS embed.FS

func main() {
	_ = godotenv.Load()

	cfg := config.Load()

	database, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer database.Close()

	broker := sse.NewBroker()
	dispatcher := webhook.NewDispatcher(database, cfg, broker)
	purger := purge.NewPurger(database, cfg)
	detector := otp.NewDetector(cfg.OTPMinLength, cfg.OTPMaxLength, cfg.OTPExtractMode)

	purger.Start()

	server := api.NewServer(database, cfg, broker, dispatcher, purger, detector)
	apiRouter := server.SetupRouter()

	// Start API server
	go func() {
		log.Printf("API server running on :%s", cfg.Port)
		if err := http.ListenAndServe(":"+cfg.Port, apiRouter); err != nil {
			log.Fatalf("API server error: %v", err)
		}
	}()

	// UI server
	uiRouter := gin.Default()

	// Proxy /api/* to the API server — mirrors the Vite dev proxy for production
	apiTarget, _ := url.Parse(fmt.Sprintf("http://localhost:%s", cfg.Port))
	proxy := httputil.NewSingleHostReverseProxy(apiTarget)
	uiRouter.Any("/api/*path", func(c *gin.Context) {
		proxy.ServeHTTP(c.Writer, c.Request)
	})

	if cfg.NodeEnv == "production" {
		// Serve embedded React build
		subFS, err := fs.Sub(webFS, "web")
		if err != nil {
			log.Fatalf("failed to create sub FS: %v", err)
		}
		uiRouter.NoRoute(func(c *gin.Context) {
			// Try to serve static file, fall back to index.html for SPA
			path := c.Request.URL.Path
			if path == "/" || path == "" {
				data, _ := fs.ReadFile(subFS, "index.html")
				c.Data(http.StatusOK, "text/html; charset=utf-8", data)
				return
			}
			// Try to serve the file
			f, err := subFS.Open(path[1:]) // strip leading /
			if err != nil {
				// Fall back to index.html for SPA routing
				data, _ := fs.ReadFile(subFS, "index.html")
				c.Data(http.StatusOK, "text/html; charset=utf-8", data)
				return
			}
			f.Close()
			c.FileFromFS(path[1:], http.FS(subFS))
		})
	} else {
		uiRouter.GET("/", func(c *gin.Context) {
			c.String(http.StatusOK, "Dev mode: run frontend separately on port 4301")
		})
	}

	log.Printf("UI server running on :%s", cfg.UIPort)
	if err := http.ListenAndServe(":"+cfg.UIPort, uiRouter); err != nil {
		log.Fatalf("UI server error: %v", err)
	}
}
