package db

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"sort"
	"strconv"
	"strings"

	_ "modernc.org/sqlite"
)

//go:embed migrations
var migrationsFS embed.FS

func Open(databaseURL string) (*sql.DB, error) {
	// Strip "sqlite:" prefix if present
	path := strings.TrimPrefix(databaseURL, "sqlite:")

	// Ensure parent directory exists
	if idx := strings.LastIndex(path, "/"); idx > 0 {
		dir := path[:idx]
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("create db dir: %w", err)
		}
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	// WAL mode for better concurrency
	if _, err := db.Exec("PRAGMA journal_mode=WAL;"); err != nil {
		return nil, fmt.Errorf("set WAL mode: %w", err)
	}
	if _, err := db.Exec("PRAGMA foreign_keys=ON;"); err != nil {
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}

	// Get current schema version (user_version 0 means no versioned migrations applied yet)
	var currentVersion int
	db.QueryRow("PRAGMA user_version").Scan(&currentVersion)

	// If user_version is 0 but tables already exist (old migration system),
	// assume migration 001 was applied and start from version 1.
	if currentVersion == 0 {
		var tableCount int
		db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='messages'`).Scan(&tableCount)
		if tableCount > 0 {
			// Tables exist — migration 001 was already applied by old code
			if _, err := db.Exec("PRAGMA user_version = 1"); err != nil {
				return nil, fmt.Errorf("set initial user_version: %w", err)
			}
			currentVersion = 1
		}
	}

	// Read and sort migration files
	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return nil, fmt.Errorf("read migrations dir: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		// Parse version number from filename prefix (e.g. "001_initial.sql" → 1)
		parts := strings.SplitN(entry.Name(), "_", 2)
		if len(parts) == 0 {
			continue
		}
		version, err := strconv.Atoi(parts[0])
		if err != nil {
			continue
		}
		if version <= currentVersion {
			continue // already applied
		}

		content, err := migrationsFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return nil, fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}

		// Execute each statement in the migration
		stmts := splitStatements(string(content))
		for _, stmt := range stmts {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			if _, execErr := db.Exec(stmt); execErr != nil {
				// Ignore "duplicate column" errors for ALTER TABLE ADD COLUMN
				if strings.Contains(execErr.Error(), "duplicate column name") {
					continue
				}
				return nil, fmt.Errorf("run migration %s: %w", entry.Name(), execErr)
			}
		}

		// Update user_version to track applied migration
		if _, err := db.Exec(fmt.Sprintf("PRAGMA user_version = %d", version)); err != nil {
			return nil, fmt.Errorf("update user_version after %s: %w", entry.Name(), err)
		}
	}

	// Verify essential tables exist after migrations
	var tableCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('projects','messages','webhook_dead_letters')`).Scan(&tableCount); err != nil {
		return nil, fmt.Errorf("verify schema: %w", err)
	}
	if tableCount < 3 {
		return nil, fmt.Errorf("schema verification failed: expected 3 core tables, found %d — db may be corrupted (delete /data/db.sqlite and restart)", tableCount)
	}

	// Ensure default project exists
	_, _ = db.Exec(`INSERT OR IGNORE INTO projects (id, name) VALUES (lower(hex(randomblob(16))), 'default')`)

	return db, nil
}

// splitStatements splits SQL content into individual statements by semicolon.
func splitStatements(content string) []string {
	var stmts []string
	for _, s := range strings.Split(content, ";") {
		s = strings.TrimSpace(s)
		if s != "" {
			stmts = append(stmts, s)
		}
	}
	return stmts
}
