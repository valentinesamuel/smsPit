package models

import "time"

type WebhookDeadLetter struct {
	ID            string     `json:"id"`
	MessageID     string     `json:"message_id"`
	Project       string     `json:"project"`
	WebhookURL    string     `json:"webhook_url"`
	Payload       string     `json:"payload"`
	Error         *string    `json:"error,omitempty"`
	Attempts      int        `json:"attempts"`
	LastAttemptAt *time.Time `json:"last_attempt_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}
