package api

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/valentinesamuel/smspit/internal/models"
	"github.com/valentinesamuel/smspit/internal/webhook"
)

func (s *Server) listDeadLetters(c *gin.Context) {
	project := c.Query("project")
	search := c.Query("search")
	dateFrom := c.Query("date_from")
	dateTo := c.Query("date_to")

	query := `SELECT id, message_id, project, webhook_url, payload, error, attempts, last_attempt_at, created_at
              FROM webhook_dead_letters WHERE 1=1`
	args := []any{}

	if project != "" {
		query += ` AND project = ?`
		args = append(args, project)
	}
	if search != "" {
		query += ` AND (webhook_url LIKE ? OR error LIKE ? OR message_id = ?)`
		args = append(args, "%"+search+"%", "%"+search+"%", search)
	}
	if dateFrom != "" {
		query += ` AND created_at >= ?`
		args = append(args, parseSQLiteTime(dateFrom))
	}
	if dateTo != "" {
		query += ` AND created_at <= ?`
		args = append(args, parseSQLiteTime(dateTo))
	}
	query += ` ORDER BY created_at DESC`

	rows, err := s.db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	letters := []models.WebhookDeadLetter{}
	for rows.Next() {
		dl := models.WebhookDeadLetter{}
		var errStr sql.NullString
		var lastAttempt sql.NullTime
		if err := rows.Scan(&dl.ID, &dl.MessageID, &dl.Project, &dl.WebhookURL, &dl.Payload, &errStr, &dl.Attempts, &lastAttempt, &dl.CreatedAt); err != nil {
			continue
		}
		if errStr.Valid {
			dl.Error = &errStr.String
		}
		if lastAttempt.Valid {
			dl.LastAttemptAt = &lastAttempt.Time
		}
		letters = append(letters, dl)
	}
	c.JSON(http.StatusOK, gin.H{"dead_letters": letters})
}

func (s *Server) retryDeadLetter(c *gin.Context) {
	id := c.Param("id")
	row := s.db.QueryRow(`SELECT id, message_id, project, webhook_url, payload FROM webhook_dead_letters WHERE id = ?`, id)
	var dlID, msgID, project, webhookURL, payload string
	if err := row.Scan(&dlID, &msgID, &project, &webhookURL, &payload); err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "dead letter not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := webhook.Deliver(context.Background(), webhookURL, []byte(payload), s.cfg.WebhookMaxRetries, s.cfg.WebhookRetryBackoff)
	now := time.Now()
	if result.Success {
		s.db.Exec(`DELETE FROM webhook_dead_letters WHERE id = ?`, dlID)
		s.broker.Broadcast("deadletter:resolved", gin.H{"id": dlID, "project": project}, project)
		c.JSON(http.StatusOK, gin.H{"status": "delivered"})
	} else {
		s.db.Exec(`UPDATE webhook_dead_letters SET error = ?, attempts = attempts + 1, last_attempt_at = ? WHERE id = ?`,
			result.Error, now, dlID)
		c.JSON(http.StatusBadGateway, gin.H{"status": "failed", "error": result.Error})
	}
}

func (s *Server) bulkRetryDeadLetters(c *gin.Context) {
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	type RetryResult struct {
		ID      string `json:"id"`
		Success bool   `json:"success"`
		Error   string `json:"error,omitempty"`
	}

	results := []RetryResult{}
	now := time.Now()

	for _, id := range body.IDs {
		row := s.db.QueryRow(`SELECT id, project, webhook_url, payload FROM webhook_dead_letters WHERE id = ?`, id)
		var dlID, dlProject, webhookURL, payload string
		if err := row.Scan(&dlID, &dlProject, &webhookURL, &payload); err != nil {
			results = append(results, RetryResult{ID: id, Success: false, Error: "not found"})
			continue
		}
		result := webhook.Deliver(context.Background(), webhookURL, []byte(payload), s.cfg.WebhookMaxRetries, s.cfg.WebhookRetryBackoff)
		if result.Success {
			s.db.Exec(`DELETE FROM webhook_dead_letters WHERE id = ?`, dlID)
			s.broker.Broadcast("deadletter:resolved", gin.H{"id": dlID, "project": dlProject}, dlProject)
			results = append(results, RetryResult{ID: id, Success: true})
		} else {
			s.db.Exec(`UPDATE webhook_dead_letters SET error = ?, attempts = attempts + 1, last_attempt_at = ? WHERE id = ?`,
				result.Error, now, dlID)
			results = append(results, RetryResult{ID: id, Success: false, Error: result.Error})
		}
	}

	c.JSON(http.StatusOK, gin.H{"results": results})
}

func (s *Server) bulkDeleteDeadLetters(c *gin.Context) {
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(body.IDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"deleted": 0})
		return
	}
	placeholders := make([]string, len(body.IDs))
	args := []any{}
	for i, id := range body.IDs {
		placeholders[i] = "?"
		args = append(args, id)
	}
	query := `DELETE FROM webhook_dead_letters WHERE id IN (` + strings.Join(placeholders, ",") + `)`
	result, err := s.db.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := result.RowsAffected()
	c.JSON(http.StatusOK, gin.H{"deleted": n})
}

func (s *Server) listDeadLetterIDs(c *gin.Context) {
	project := c.Query("project")
	search := c.Query("search")
	dateFrom := c.Query("date_from")
	dateTo := c.Query("date_to")

	base := ` FROM webhook_dead_letters WHERE 1=1`
	args := []any{}

	if project != "" {
		base += ` AND project = ?`
		args = append(args, project)
	}
	if search != "" {
		base += ` AND (webhook_url LIKE ? OR error LIKE ? OR message_id = ?)`
		args = append(args, "%"+search+"%", "%"+search+"%", search)
	}
	if dateFrom != "" {
		base += ` AND created_at >= ?`
		args = append(args, parseSQLiteTime(dateFrom))
	}
	if dateTo != "" {
		base += ` AND created_at <= ?`
		args = append(args, parseSQLiteTime(dateTo))
	}

	var total int
	s.db.QueryRow(`SELECT COUNT(*)`+base, args...).Scan(&total)

	rows, err := s.db.Query(`SELECT id`+base+` ORDER BY created_at DESC LIMIT 500`, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	c.JSON(http.StatusOK, gin.H{"ids": ids, "total": total})
}
