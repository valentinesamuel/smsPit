CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT UNIQUE NOT NULL,
    webhook_url TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project       TEXT NOT NULL DEFAULT 'default',
    "to"          TEXT NOT NULL,
    "from"        TEXT,
    message       TEXT NOT NULL,
    metadata      TEXT,
    type_tag      TEXT,
    detected_otps TEXT,
    deleted_at    DATETIME,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_project    ON messages(project);
CREATE INDEX IF NOT EXISTS idx_messages_to         ON messages("to");
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON messages(deleted_at);
CREATE INDEX IF NOT EXISTS idx_messages_type_tag   ON messages(type_tag);

CREATE TABLE IF NOT EXISTS webhook_dead_letters (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    message_id      TEXT NOT NULL,
    project         TEXT NOT NULL,
    webhook_url     TEXT NOT NULL,
    payload         TEXT NOT NULL,
    error           TEXT,
    attempts        INTEGER DEFAULT 0,
    last_attempt_at DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
