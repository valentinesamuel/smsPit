package api

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/valentinesamuel/smspit/internal/models"
)

// parseSQLiteTime parses an ISO 8601 string and reformats it to SQLite's
// expected text format ("2006-01-02 15:04:05") for lexicographic comparison.
func parseSQLiteTime(s string) string {
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		t, err = time.Parse(time.RFC3339, s)
	}
	if err != nil {
		return s
	}
	return t.UTC().Format("2006-01-02 15:04:05")
}

// scanMessage scans a row into a Message, expecting columns:
// id, project, to, from, message, metadata, type_tag, detected_otps, deleted_at, read_at, created_at
func scanMessage(row interface {
	Scan(...any) error
}, msg *models.Message) error {
	var from, metadata, tt, dotps sql.NullString
	var deletedAt, readAt sql.NullTime
	err := row.Scan(&msg.ID, &msg.Project, &msg.To, &from, &msg.Message, &metadata, &tt, &dotps, &deletedAt, &readAt, &msg.CreatedAt)
	if err != nil {
		return err
	}
	if from.Valid {
		msg.From = from.String
	}
	if metadata.Valid {
		msg.Metadata = &metadata.String
	}
	if tt.Valid {
		msg.TypeTag = &tt.String
	}
	if dotps.Valid {
		msg.DetectedOTPs = &dotps.String
	}
	if deletedAt.Valid {
		msg.DeletedAt = &deletedAt.Time
	}
	if readAt.Valid {
		msg.ReadAt = &readAt.Time
	}
	return nil
}

const messageSelectCols = `id, project, "to", "from", message, metadata, type_tag, detected_otps, deleted_at, read_at, created_at`

func (s *Server) createMessage(c *gin.Context) {
	var req models.CreateMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Project == "" {
		req.Project = "default"
	}

	var metadataStr *string
	var typeTag *string
	if req.Metadata != nil {
		b, _ := json.Marshal(req.Metadata)
		s := string(b)
		metadataStr = &s
		if t, ok := req.Metadata["type"].(string); ok && t != "" {
			typeTag = &t
		}
	}

	var detectedOTPsStr *string
	if s.cfg.OTPDetection {
		otps := s.otpDetector.Detect(req.Message)
		if len(otps) > 0 {
			b, _ := json.Marshal(otps)
			str := string(b)
			detectedOTPsStr = &str
			if s.cfg.AutoTag && typeTag == nil {
				tag := "otp"
				typeTag = &tag
			}
		}
	}

	row := s.db.QueryRow(
		`INSERT INTO messages (project, "to", "from", message, metadata, type_tag, detected_otps)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING `+messageSelectCols,
		req.Project, req.To, req.From, req.Message, metadataStr, typeTag, detectedOTPsStr,
	)

	msg := &models.Message{}
	if err := scanMessage(row, msg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	s.purger.EnforceMaxMessages(req.Project)
	s.broker.Broadcast("message:new", msg, req.Project)

	webhookURL := s.dispatcher.ResolveWebhookURL(req.Project)
	s.dispatcher.Dispatch(msg, webhookURL)

	c.JSON(http.StatusCreated, gin.H{
		"id":         msg.ID,
		"status":     "received",
		"created_at": msg.CreatedAt,
		"message":    msg,
	})
}

func (s *Server) listMessages(c *gin.Context) {
	project := c.Query("project")
	phoneNumber := c.Query("phoneNumber")
	sender := c.Query("sender")
	search := c.Query("search")
	metadataType := c.Query("metadata[type]")
	otpFilter := c.Query("otp")
	typeFilter := c.Query("type")
	unread := c.Query("unread")
	dateFrom := c.Query("date_from")
	dateTo := c.Query("date_to")
	limitStr := c.DefaultQuery("limit", "50")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)
	if limit <= 0 || limit > 500 {
		limit = 50
	}

	query := `SELECT ` + messageSelectCols + ` FROM messages WHERE deleted_at IS NULL`
	args := []any{}

	if project != "" {
		query += ` AND project = ?`
		args = append(args, project)
	}
	if phoneNumber != "" {
		query += ` AND "to" = ?`
		args = append(args, phoneNumber)
	}
	if sender != "" {
		query += ` AND "from" = ?`
		args = append(args, sender)
	}
	if search != "" {
		query += ` AND (message LIKE ? OR "to" LIKE ?)`
		args = append(args, "%"+search+"%", "%"+search+"%")
	}
	if metadataType != "" {
		query += ` AND type_tag = ?`
		args = append(args, metadataType)
	}
	if typeFilter != "" {
		query += ` AND type_tag = ?`
		args = append(args, typeFilter)
	}
	if otpFilter == "true" {
		query += ` AND type_tag = 'otp'`
	}
	if unread == "true" {
		query += ` AND read_at IS NULL`
	}
	if dateFrom != "" {
		query += ` AND created_at >= ?`
		args = append(args, parseSQLiteTime(dateFrom))
	}
	if dateTo != "" {
		query += ` AND created_at <= ?`
		args = append(args, parseSQLiteTime(dateTo))
	}

	query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	messages := []models.Message{}
	for rows.Next() {
		msg := models.Message{}
		if err := scanMessage(rows, &msg); err != nil {
			continue
		}
		messages = append(messages, msg)
	}

	c.JSON(http.StatusOK, gin.H{"messages": messages, "count": len(messages)})
}

func (s *Server) getMessage(c *gin.Context) {
	id := c.Param("id")
	row := s.db.QueryRow(
		`SELECT `+messageSelectCols+` FROM messages WHERE id = ? AND deleted_at IS NULL`, id,
	)
	msg := &models.Message{}
	err := scanMessage(row, msg)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, msg)
}

func (s *Server) markMessageRead(c *gin.Context) {
	id := c.Param("id")
	_, err := s.db.Exec(`UPDATE messages SET read_at = ? WHERE id = ? AND read_at IS NULL AND deleted_at IS NULL`, time.Now(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s *Server) deleteMessage(c *gin.Context) {
	id := c.Param("id")
	result, err := s.db.Exec(`UPDATE messages SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`, time.Now(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
		return
	}
	s.broker.Broadcast("message:deleted", gin.H{"id": id}, "")
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (s *Server) clearMessages(c *gin.Context) {
	project := c.Query("project")
	var err error
	if project != "" {
		_, err = s.db.Exec(`UPDATE messages SET deleted_at = ? WHERE project = ? AND deleted_at IS NULL`, time.Now(), project)
	} else {
		_, err = s.db.Exec(`UPDATE messages SET deleted_at = ? WHERE deleted_at IS NULL`, time.Now())
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.broker.Broadcast("message:deleted", gin.H{"all": true, "project": project}, project)
	c.JSON(http.StatusOK, gin.H{"status": "cleared"})
}

func (s *Server) latestMessage(c *gin.Context) {
	to := c.Query("to")
	msgType := c.Query("type")
	project := c.Query("project")

	query := `SELECT ` + messageSelectCols + ` FROM messages WHERE deleted_at IS NULL`
	args := []any{}

	if to != "" {
		query += ` AND "to" = ?`
		args = append(args, to)
	}
	if msgType != "" {
		query += ` AND type_tag = ?`
		args = append(args, msgType)
	}
	if project != "" {
		query += ` AND project = ?`
		args = append(args, project)
	}
	query += ` ORDER BY created_at DESC LIMIT 1`

	row := s.db.QueryRow(query, args...)
	msg := &models.Message{}
	err := scanMessage(row, msg)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "no message found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, msg)
}

func (s *Server) bulkMarkMessagesRead(c *gin.Context) {
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(body.IDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"updated": 0})
		return
	}
	placeholders := make([]string, len(body.IDs))
	args := []any{time.Now()}
	for i, id := range body.IDs {
		placeholders[i] = "?"
		args = append(args, id)
	}
	query := `UPDATE messages SET read_at = ? WHERE id IN (` + strings.Join(placeholders, ",") + `) AND read_at IS NULL AND deleted_at IS NULL`
	result, err := s.db.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := result.RowsAffected()
	s.broker.Broadcast("message:read", gin.H{"ids": body.IDs}, "")
	c.JSON(http.StatusOK, gin.H{"updated": n})
}

func (s *Server) bulkDeleteMessages(c *gin.Context) {
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
	args := []any{time.Now()}
	for i, id := range body.IDs {
		placeholders[i] = "?"
		args = append(args, id)
	}
	query := `UPDATE messages SET deleted_at = ? WHERE id IN (` + strings.Join(placeholders, ",") + `) AND deleted_at IS NULL`
	result, err := s.db.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := result.RowsAffected()
	s.broker.Broadcast("message:deleted", gin.H{"ids": body.IDs}, "")
	c.JSON(http.StatusOK, gin.H{"deleted": n})
}

func (s *Server) listMessageIDs(c *gin.Context) {
	project := c.Query("project")
	search := c.Query("search")
	typeFilter := c.Query("type")
	unread := c.Query("unread")
	dateFrom := c.Query("date_from")
	dateTo := c.Query("date_to")

	base := ` FROM messages WHERE deleted_at IS NULL`
	args := []any{}

	if project != "" {
		base += ` AND project = ?`
		args = append(args, project)
	}
	if search != "" {
		base += ` AND (message LIKE ? OR "to" LIKE ?)`
		args = append(args, "%"+search+"%", "%"+search+"%")
	}
	if typeFilter != "" {
		base += ` AND type_tag = ?`
		args = append(args, typeFilter)
	}
	if unread == "true" {
		base += ` AND read_at IS NULL`
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

func (s *Server) exportMessages(c *gin.Context) {
	project := c.Query("project")
	format := c.DefaultQuery("format", "json")
	search := c.Query("search")
	typeFilter := c.Query("type")
	dateFrom := c.Query("date_from")
	dateTo := c.Query("date_to")

	query := `SELECT ` + messageSelectCols + ` FROM messages WHERE deleted_at IS NULL`
	args := []any{}

	if project != "" {
		query += ` AND project = ?`
		args = append(args, project)
	}
	if search != "" {
		query += ` AND (message LIKE ? OR "to" LIKE ?)`
		args = append(args, "%"+search+"%", "%"+search+"%")
	}
	if typeFilter != "" {
		query += ` AND type_tag = ?`
		args = append(args, typeFilter)
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

	messages := []models.Message{}
	for rows.Next() {
		msg := models.Message{}
		if err := scanMessage(rows, &msg); err != nil {
			continue
		}
		messages = append(messages, msg)
	}

	if format == "csv" {
		c.Header("Content-Disposition", "attachment; filename=messages.csv")
		c.Header("Content-Type", "text/csv")
		w := csv.NewWriter(c.Writer)
		w.Write([]string{"id", "project", "to", "from", "message", "type_tag", "detected_otps", "created_at", "read_at"})
		for _, msg := range messages {
			typeTag := ""
			if msg.TypeTag != nil {
				typeTag = *msg.TypeTag
			}
			otps := ""
			if msg.DetectedOTPs != nil {
				otps = *msg.DetectedOTPs
			}
			readAt := ""
			if msg.ReadAt != nil {
				readAt = msg.ReadAt.Format(time.RFC3339)
			}
			w.Write([]string{
				msg.ID, msg.Project, msg.To, msg.From, msg.Message,
				typeTag, otps, msg.CreatedAt.Format(time.RFC3339), readAt,
			})
		}
		w.Flush()
		return
	}

	c.Header("Content-Disposition", "attachment; filename=messages.json")
	c.JSON(http.StatusOK, messages)
}
