package models

import "time"

type Message struct {
	ID           string     `json:"id"`
	Project      string     `json:"project"`
	To           string     `json:"to"`
	From         string     `json:"from,omitempty"`
	Message      string     `json:"message"`
	Metadata     *string    `json:"metadata,omitempty"`      // raw JSON string
	TypeTag      *string    `json:"type_tag,omitempty"`
	DetectedOTPs *string    `json:"detected_otps,omitempty"` // raw JSON array string
	DeletedAt    *time.Time `json:"deleted_at,omitempty"`
	ReadAt       *time.Time `json:"read_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

type CreateMessageRequest struct {
	To       string                 `json:"to" binding:"required"`
	From     string                 `json:"from"`
	Message  string                 `json:"message" binding:"required"`
	Metadata map[string]any         `json:"metadata"`
	Project  string                 `json:"project"`
}
