package models

import "time"

type Project struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	WebhookURL *string   `json:"webhook_url,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type CreateProjectRequest struct {
	Name       string  `json:"name" binding:"required"`
	WebhookURL *string `json:"webhook_url"`
}

type UpdateProjectRequest struct {
	WebhookURL *string `json:"webhook_url"`
}
