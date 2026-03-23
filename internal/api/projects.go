package api

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/valentinesamuel/smspit/internal/models"
)

func (s *Server) listProjects(c *gin.Context) {
	rows, err := s.db.Query(`SELECT id, name, webhook_url, created_at FROM projects ORDER BY created_at ASC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	projects := []models.Project{}
	for rows.Next() {
		p := models.Project{}
		var webhookURL sql.NullString
		if err := rows.Scan(&p.ID, &p.Name, &webhookURL, &p.CreatedAt); err != nil {
			continue
		}
		if webhookURL.Valid {
			p.WebhookURL = &webhookURL.String
		}
		projects = append(projects, p)
	}
	c.JSON(http.StatusOK, gin.H{"projects": projects})
}

func (s *Server) createProject(c *gin.Context) {
	var req models.CreateProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	row := s.db.QueryRow(
		`INSERT INTO projects (name, webhook_url) VALUES (?, ?) RETURNING id, name, webhook_url, created_at`,
		req.Name, req.WebhookURL,
	)
	p := &models.Project{}
	var webhookURL sql.NullString
	err := row.Scan(&p.ID, &p.Name, &webhookURL, &p.CreatedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if webhookURL.Valid {
		p.WebhookURL = &webhookURL.String
	}
	c.JSON(http.StatusCreated, p)
}

func (s *Server) getProject(c *gin.Context) {
	name := c.Param("name")
	row := s.db.QueryRow(`SELECT id, name, webhook_url, created_at FROM projects WHERE name = ?`, name)
	p := &models.Project{}
	var webhookURL sql.NullString
	err := row.Scan(&p.ID, &p.Name, &webhookURL, &p.CreatedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if webhookURL.Valid {
		p.WebhookURL = &webhookURL.String
	}
	c.JSON(http.StatusOK, p)
}

func (s *Server) updateProject(c *gin.Context) {
	name := c.Param("name")
	var req models.UpdateProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := s.db.Exec(`UPDATE projects SET webhook_url = ? WHERE name = ?`, req.WebhookURL, name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	row := s.db.QueryRow(`SELECT id, name, webhook_url, created_at FROM projects WHERE name = ?`, name)
	p := &models.Project{}
	var webhookURL sql.NullString
	err = row.Scan(&p.ID, &p.Name, &webhookURL, &p.CreatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	if webhookURL.Valid {
		p.WebhookURL = &webhookURL.String
	}
	c.JSON(http.StatusOK, p)
}

func (s *Server) deleteProject(c *gin.Context) {
	name := c.Param("name")
	if name == "default" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete default project"})
		return
	}
	_, err := s.db.Exec(`DELETE FROM projects WHERE name = ?`, name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
