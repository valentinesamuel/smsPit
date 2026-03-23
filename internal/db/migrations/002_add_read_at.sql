ALTER TABLE messages ADD COLUMN read_at DATETIME;
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at);
