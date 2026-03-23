package db

import (
	"database/sql"
	"os"
	"testing"

	_ "modernc.org/sqlite"
)

func TestOpenFreshDB(t *testing.T) {
	tmp, _ := os.CreateTemp("", "smspit-fresh-*.sqlite")
	tmp.Close()
	os.Remove(tmp.Name())

	conn, err := Open("sqlite:" + tmp.Name())
	if err != nil {
		t.Fatalf("fresh db open failed: %v", err)
	}
	defer conn.Close()
	defer os.Remove(tmp.Name())

	var count int
	conn.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('projects','messages','webhook_dead_letters')`).Scan(&count)
	if count != 3 {
		t.Errorf("expected 3 tables, got %d", count)
	}
}

func TestOpenCorruptedDB(t *testing.T) {
	// Simulate: user_version=2 but no tables (WAL corruption scenario)
	tmp, _ := os.CreateTemp("", "smspit-corrupt-*.sqlite")
	tmp.Close()
	defer os.Remove(tmp.Name())

	raw, _ := sql.Open("sqlite", tmp.Name())
	raw.Exec("PRAGMA user_version = 2")
	raw.Close()

	_, err := Open("sqlite:" + tmp.Name())
	if err == nil {
		t.Fatal("expected error for missing tables after user_version=2, got nil")
	}
	t.Logf("got expected error: %v", err)
}
