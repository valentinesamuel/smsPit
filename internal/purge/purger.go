package purge

import (
	"database/sql"
	"log"
	"time"

	"github.com/valentinesamuel/smspit/internal/config"
)

type Purger struct {
	db  *sql.DB
	cfg *config.Config
}

func NewPurger(db *sql.DB, cfg *config.Config) *Purger {
	return &Purger{db: db, cfg: cfg}
}

func (p *Purger) Start() {
	ticker := time.NewTicker(p.cfg.PurgeInterval)
	go func() {
		for range ticker.C {
			p.run()
		}
	}()
}

func (p *Purger) run() {
	cutoff := time.Now().Add(-p.cfg.AutoDeleteAfter)
	result, err := p.db.Exec(
		`DELETE FROM messages WHERE deleted_at IS NOT NULL AND deleted_at < ?`, cutoff,
	)
	if err != nil {
		log.Printf("purge error: %v", err)
		return
	}
	n, _ := result.RowsAffected()
	if n > 0 {
		log.Printf("purged %d messages", n)
	}
}

func (p *Purger) EnforceMaxMessages(project string) {
	if p.cfg.MaxMessages <= 0 {
		return
	}

	threshold98 := int(float64(p.cfg.MaxMessages) * 0.98)
	target60 := int(float64(p.cfg.MaxMessages) * 0.60)

	var count int
	p.db.QueryRow(`SELECT COUNT(*) FROM messages WHERE project = ? AND deleted_at IS NULL`, project).Scan(&count)
	if count < threshold98 {
		return
	}

	excess := count - target60
	if excess <= 0 {
		return
	}
	_, err := p.db.Exec(`DELETE FROM messages WHERE id IN (
		SELECT id FROM messages WHERE project = ? AND deleted_at IS NULL
		ORDER BY created_at ASC LIMIT ?
	)`, project, excess)
	if err != nil {
		log.Printf("auto-purge error: %v", err)
		return
	}
	log.Printf("auto-purged %d messages from project %s (was at %d/%d)", excess, project, count, p.cfg.MaxMessages)
}
