package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (s *Server) getStats(c *gin.Context) {
	project := c.Query("project")

	baseWhere := "WHERE deleted_at IS NULL"
	args := []any{}
	if project != "" {
		baseWhere += " AND project = ?"
		args = append(args, project)
	}

	var total int
	s.db.QueryRow(`SELECT COUNT(*) FROM messages `+baseWhere, args...).Scan(&total)

	var otpCount int
	otpArgs := append(args, "otp")
	s.db.QueryRow(`SELECT COUNT(*) FROM messages `+baseWhere+` AND type_tag = ?`, otpArgs...).Scan(&otpCount)

	var notificationCount int
	notifArgs := append(args, "notification")
	s.db.QueryRow(`SELECT COUNT(*) FROM messages `+baseWhere+` AND type_tag = ?`, notifArgs...).Scan(&notificationCount)

	var unreadCount int
	s.db.QueryRow(`SELECT COUNT(*) FROM messages `+baseWhere+` AND read_at IS NULL`, args...).Scan(&unreadCount)

	// Per-number breakdown
	rows, _ := s.db.Query(`SELECT "to", COUNT(*) as cnt FROM messages `+baseWhere+` GROUP BY "to" ORDER BY cnt DESC LIMIT 20`, args...)
	type NumberStat struct {
		To    string `json:"to"`
		Count int    `json:"count"`
	}
	perNumber := []NumberStat{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var ns NumberStat
			rows.Scan(&ns.To, &ns.Count)
			perNumber = append(perNumber, ns)
		}
	}

	// Dead letter count
	var deadLetterCount int
	dlArgs := []any{}
	dlWhere := "WHERE 1=1"
	if project != "" {
		dlWhere += " AND project = ?"
		dlArgs = append(dlArgs, project)
	}
	s.db.QueryRow(`SELECT COUNT(*) FROM webhook_dead_letters `+dlWhere, dlArgs...).Scan(&deadLetterCount)

	c.JSON(http.StatusOK, gin.H{
		"total":              total,
		"otp_count":          otpCount,
		"notification_count": notificationCount,
		"unread_count":       unreadCount,
		"per_number":         perNumber,
		"dead_letter_count":  deadLetterCount,
		"max_messages":       s.cfg.MaxMessages,
	})
}
