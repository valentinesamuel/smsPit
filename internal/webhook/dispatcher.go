package webhook

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"time"

	"github.com/valentinesamuel/smspit/internal/config"
	"github.com/valentinesamuel/smspit/internal/models"
	"github.com/valentinesamuel/smspit/internal/sse"
)

type Dispatcher struct {
	db     *sql.DB
	cfg    *config.Config
	broker *sse.Broker
}

func NewDispatcher(db *sql.DB, cfg *config.Config, broker *sse.Broker) *Dispatcher {
	return &Dispatcher{db: db, cfg: cfg, broker: broker}
}

func (d *Dispatcher) Dispatch(msg *models.Message, webhookURL string) {
	if webhookURL == "" {
		return
	}
	go func() {
		payload, _ := json.Marshal(msg)
		log.Printf("[webhook] dispatching to %s (message %s)", webhookURL, msg.ID)
		result := Deliver(context.Background(), webhookURL, payload, d.cfg.WebhookMaxRetries, d.cfg.WebhookRetryBackoff)
		if result.Success {
			log.Printf("[webhook] delivered successfully to %s (message %s)", webhookURL, msg.ID)
			return
		}
		log.Printf("[webhook] delivery failed to %s (message %s): %s — storing dead letter", webhookURL, msg.ID, result.Error)
		now := time.Now()
		dl := models.WebhookDeadLetter{}
		row := d.db.QueryRow(
			`INSERT INTO webhook_dead_letters (message_id, project, webhook_url, payload, error, attempts, last_attempt_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 RETURNING id, message_id, project, webhook_url, payload, error, attempts, last_attempt_at, created_at`,
			msg.ID, msg.Project, webhookURL, string(payload), result.Error, d.cfg.WebhookMaxRetries+1, now,
		)
		var errStr sql.NullString
		var lastAttempt sql.NullTime
		if err := row.Scan(&dl.ID, &dl.MessageID, &dl.Project, &dl.WebhookURL, &dl.Payload, &errStr, &dl.Attempts, &lastAttempt, &dl.CreatedAt); err == nil {
			if errStr.Valid {
				dl.Error = &errStr.String
			}
			if lastAttempt.Valid {
				dl.LastAttemptAt = &lastAttempt.Time
			}
			if d.broker != nil {
				d.broker.Broadcast("deadletter:new", dl, msg.Project)
			}
		}
	}()
}

func (d *Dispatcher) ResolveWebhookURL(project string) string {
	var url string
	row := d.db.QueryRow(`SELECT COALESCE(webhook_url, '') FROM projects WHERE name = ?`, project)
	row.Scan(&url)
	if url != "" {
		return url
	}
	return d.cfg.WebhookURL
}
