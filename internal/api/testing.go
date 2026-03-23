package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/valentinesamuel/smspit/internal/models"
)

func (s *Server) testingGetOTP(c *gin.Context) {
	to := c.Query("to")
	project := c.Query("project")

	query := `SELECT detected_otps FROM messages WHERE deleted_at IS NULL AND type_tag = 'otp'`
	args := []any{}
	if to != "" {
		query += ` AND "to" = ?`
		args = append(args, to)
	}
	if project != "" {
		query += ` AND project = ?`
		args = append(args, project)
	}
	query += ` ORDER BY created_at DESC LIMIT 1`

	row := s.db.QueryRow(query, args...)
	var dotps sql.NullString
	if err := row.Scan(&dotps); err == sql.ErrNoRows || !dotps.Valid {
		c.JSON(http.StatusNotFound, gin.H{"error": "no OTP found"})
		return
	}

	var otps []string
	json.Unmarshal([]byte(dotps.String), &otps)
	if len(otps) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no OTP found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"otp": otps[0]})
}

func (s *Server) testingDeleteMessages(c *gin.Context) {
	project := c.Query("project")
	if project != "" {
		s.db.Exec(`DELETE FROM messages WHERE project = ?`, project)
	} else {
		s.db.Exec(`DELETE FROM messages`)
	}
	c.JSON(http.StatusOK, gin.H{"status": "cleared"})
}

func (s *Server) testingWait(c *gin.Context) {
	to := c.Query("to")
	project := c.Query("project")
	timeoutStr := c.DefaultQuery("timeout", "30s")
	timeout, err := time.ParseDuration(timeoutStr)
	if err != nil {
		timeout = 30 * time.Second
	}

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		query := `SELECT id, project, "to", "from", message, metadata, type_tag, detected_otps, deleted_at, created_at
                  FROM messages WHERE deleted_at IS NULL`
		args := []any{}
		if to != "" {
			query += ` AND "to" = ?`
			args = append(args, to)
		}
		if project != "" {
			query += ` AND project = ?`
			args = append(args, project)
		}
		query += ` ORDER BY created_at DESC LIMIT 1`

		row := s.db.QueryRow(query, args...)
		msg := &models.Message{}
		var from, metadata, tt, dotps sql.NullString
		var deletedAt sql.NullTime
		err := row.Scan(&msg.ID, &msg.Project, &msg.To, &from, &msg.Message, &metadata, &tt, &dotps, &deletedAt, &msg.CreatedAt)
		if err == nil {
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
			c.JSON(http.StatusOK, msg)
			return
		}
		time.Sleep(500 * time.Millisecond)
	}
	c.JSON(http.StatusRequestTimeout, gin.H{"error": "timeout waiting for message"})
}

func (s *Server) testingSeed(c *gin.Context) {
	project := c.DefaultQuery("project", "default")
	count := 5

	phones := []string{"+2348012345678", "+2348098765432", "+14155552671"}
	messages := []string{
		"Your OTP is %04d. Valid for 5 minutes.",
		"Welcome! Your verification code is %04d.",
		"Use code %04d to complete your login.",
		"Hello! Your OTP: %04d",
		"Transaction alert: OTP %04d expires in 2 mins.",
	}

	seeded := []string{}
	for range count {
		phone := phones[rand.Intn(len(phones))]
		otp := rand.Intn(9000) + 1000
		msg := fmt.Sprintf(messages[rand.Intn(len(messages))], otp)
		row := s.db.QueryRow(
			`INSERT INTO messages (project, "to", "from", message, type_tag, detected_otps)
             VALUES (?, ?, ?, ?, 'otp', ?) RETURNING id`,
			project, phone, "SeedApp", msg, fmt.Sprintf(`["%04d"]`, otp),
		)
		var id string
		row.Scan(&id)
		seeded = append(seeded, id)
	}
	c.JSON(http.StatusCreated, gin.H{"seeded": seeded, "count": len(seeded)})
}
