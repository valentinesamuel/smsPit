package api

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (s *Server) handleSSE(c *gin.Context) {
	project := c.Query("project")
	id := uuid.New().String()
	client := s.broker.Subscribe(id, project)
	defer s.broker.Unsubscribe(id)

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// Send initial connected event
	fmt.Fprintf(c.Writer, "data: {\"type\":\"connected\"}\n\n")
	c.Writer.Flush()

	notify := c.Request.Context().Done()
	for {
		select {
		case msg, ok := <-client.Ch:
			if !ok {
				return
			}
			fmt.Fprint(c.Writer, msg)
			c.Writer.(http.Flusher).Flush()
		case <-notify:
			return
		}
	}
}
