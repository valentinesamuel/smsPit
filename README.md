# SMSpit

**Local-first SMS testing platform — like Mailpit, but for SMS and OTP workflows.**

[![Docker](https://img.shields.io/docker/v/valentinesamuel/smspit?label=Docker&logo=docker)](https://hub.docker.com/r/valentinesamuel/smspit)
[![Go](https://img.shields.io/badge/Go-1.25-blue?logo=go)](https://go.dev)

---

## Why SMSpit

- **Real carriers are slow and expensive in tests.** Twilio/Vonage add real latency, cost money per message, and rate-limit CI pipelines.
- **OTP flows need a fake inbox.** There was no local-first equivalent of Mailpit for SMS — a tool that receives messages via API, surfaces them in a UI, and lets tests assert OTP values without any external dependency.
- **Nothing good existed.** Existing mock SMS services are SaaS products with rate limits and account requirements. SMSpit runs entirely on your machine or in your cluster with zero external calls.

---

## Quick Start

**Docker one-liner:**

```bash
docker run -p 4300:4300 -p 4301:4301 valentinesamuel/smspit:latest
```

**Docker Compose:**

```bash
curl -O https://raw.githubusercontent.com/valentinesamuel/smspit/main/docker-compose.yml
docker compose up -d
```

| Service | URL |
|---------|-----|
| API | http://localhost:4300 |
| UI  | http://localhost:4301 |

---

## Single Binary

The production build is a single Go binary with the React UI embedded via `//go:embed`. There is no Node runtime, no separate static-file server, and no external dependencies at runtime. Drop the binary anywhere, point `DATABASE_URL` at a writable path, and it runs.

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4300` | API server port |
| `UI_PORT` | `4301` | UI dev-server port (dev only) |
| `NODE_ENV` | `development` | Set to `production` to enable Gin release mode |
| `DATABASE_URL` | `sqlite:./smspit.db` | SQLite path (prefix `sqlite:`) |
| `API_KEY` | `` | Optional API key — enforces `X-API-Key` header on all `/api/*` routes |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS allowed origins |
| `MAX_MESSAGES` | `1000` | Per-project FIFO cap — oldest messages are evicted first |
| `AUTO_DELETE_AFTER` | `24h` | Soft-delete TTL (Go duration string) |
| `PURGE_INTERVAL` | `1h` | How often the purge goroutine runs |
| `WEBHOOK_URL` | `` | Global fallback webhook URL for all projects |
| `WEBHOOK_MAX_RETRIES` | `3` | Number of retry attempts before creating a dead letter |
| `WEBHOOK_RETRY_BACKOFF` | `5s` | Base backoff for exponential retry (`2^(n-1) * backoff`) |
| `OTP_DETECTION` | `true` | Auto-detect numeric OTPs in message bodies |
| `OTP_MIN_LENGTH` | `4` | Minimum digit count for OTP detection |
| `OTP_MAX_LENGTH` | `8` | Maximum digit count for OTP detection |
| `OTP_EXTRACT_MODE` | `all` | Which OTPs to store: `all`, `first`, or `longest` |
| `AUTO_TAG` | `true` | Tag messages containing OTPs with the `otp` tag |

---

## Projects

Projects provide namespace isolation — messages, webhooks, and stats are all scoped per project. Every SMSpit instance has a `default` project created automatically.

Each project can have its own `webhook_url`. When a message arrives for a project, SMSpit uses the project's URL if set, falling back to the global `WEBHOOK_URL`.

---

## API Reference

All endpoints are prefixed `/api`. When `API_KEY` is set, include `X-API-Key: <key>` on every request.

### Messages

#### Send a message
```
POST /api/messages
Content-Type: application/json

{
  "to": "+2348012345678",
  "message": "Your OTP is 482910",
  "from": "MyApp",
  "project": "default"
}
```

Response `201`:
```json
{
  "id": "abc123",
  "to": "+2348012345678",
  "from": "MyApp",
  "message": "Your OTP is 482910",
  "project": "default",
  "tags": ["otp"],
  "detected_otps": ["482910"],
  "read": false,
  "deleted_at": null,
  "created_at": "2025-01-01T00:00:00Z"
}
```

#### List messages
```
GET /api/messages
```

Query parameters:

| Param | Type | Description |
|-------|------|-------------|
| `project` | string | Filter by project name |
| `phoneNumber` | string | Filter by recipient number |
| `search` | string | Full-text search on message body |
| `otp` | string | Filter to messages containing this OTP value |
| `read` | bool | Filter by read status |
| `limit` | int | Page size (default 50) |
| `offset` | int | Page offset |

#### Get a message
```
GET /api/messages/:id
```

#### Mark as read
```
PATCH /api/messages/:id/read
```

#### Delete a message
```
DELETE /api/messages/:id
```

#### Clear all messages
```
DELETE /api/messages?project=default
```

#### Bulk mark read
```
POST /api/messages/bulk-read
Content-Type: application/json

{"ids": ["id1", "id2"]}
```

#### Bulk delete
```
POST /api/messages/bulk-delete
Content-Type: application/json

{"ids": ["id1", "id2"]}
```

#### Get latest message (for a number)
```
GET /api/messages/latest?to=+2348012345678&project=default
```

#### List message IDs only
```
GET /api/messages/ids?project=default
```

#### Export messages
```
GET /api/messages/export?project=default&format=json
```

Returns a JSON array. Useful for offline archiving.

---

### Projects

#### List projects
```
GET /api/projects
```

#### Create a project
```
POST /api/projects
Content-Type: application/json

{"name": "staging", "webhook_url": "https://example.com/hook"}
```

#### Get a project
```
GET /api/projects/:name
```

#### Update a project
```
PATCH /api/projects/:name
Content-Type: application/json

{"webhook_url": "https://new-url.example.com/hook"}
```

#### Delete a project
```
DELETE /api/projects/:name
```

---

### Real-time Events (SSE)

```
GET /api/events?project=default
```

Returns a persistent `text/event-stream`. Each event is a JSON object:

```
data: {"type":"message:new","payload":{...message...}}

data: {"type":"message:deleted","payload":{"id":"abc123"}}

data: {"type":"message:read","payload":{"id":"abc123"}}

data: {"type":"stats:updated","payload":{...stats...}}

data: {"type":"deadletter:new","payload":{...dead_letter...}}

data: {"type":"deadletter:resolved","payload":{"id":"dl123"}}
```

| Event type | When fired |
|-----------|------------|
| `message:new` | A message is received |
| `message:deleted` | A message is deleted |
| `message:read` | A message is marked read |
| `stats:updated` | Message count or project stats change |
| `deadletter:new` | A webhook delivery is exhausted and enters the dead letter queue |
| `deadletter:resolved` | A dead letter is retried successfully |

Fan-out is project-scoped: a client subscribed to `project=staging` only receives events for that project. Clients subscribed with no project (or `project=`) receive all events.

---

### Stats

```
GET /api/stats
```

Response:
```json
{
  "total": 142,
  "unread": 17,
  "projects": 3,
  "dead_letters": 2
}
```

---

### Webhooks & Dead Letters

When a message arrives and a webhook URL is configured, SMSpit dispatches the full message payload to that URL asynchronously. On failure, it retries with exponential backoff (`2^(n-1) * WEBHOOK_RETRY_BACKOFF`). After `WEBHOOK_MAX_RETRIES` exhausted attempts, the delivery is stored as a dead letter.

#### List dead letters
```
GET /api/webhooks/dead-letters?project=default
```

#### List dead letter IDs
```
GET /api/webhooks/dead-letters/ids
```

#### Retry a dead letter
```
POST /api/webhooks/dead-letters/:id/retry
```

On success the dead letter is removed and a `deadletter:resolved` SSE event is broadcast.

#### Bulk retry
```
POST /api/webhooks/dead-letters/bulk-retry
Content-Type: application/json

{"ids": ["dl1", "dl2"]}
```

#### Bulk delete
```
POST /api/webhooks/dead-letters/bulk-delete
Content-Type: application/json

{"ids": ["dl1", "dl2"]}
```

---

### Query Runner

Execute arbitrary read-only SQL against the SMSpit database. Useful for custom reporting.

#### Run a query
```
POST /api/query
Content-Type: application/json

{"sql": "SELECT project, COUNT(*) as cnt FROM messages GROUP BY project"}
```

Response:
```json
{
  "columns": ["project", "cnt"],
  "rows": [["default", 42], ["staging", 8]]
}
```

#### Get schema
```
GET /api/query/schema
```

Returns table definitions and column names for all user tables.

---

### Testing Helpers

These endpoints are designed for use inside CI pipelines and integration test suites.

#### Get latest OTP for a number
```
GET /api/testing/otp?to=+2348012345678&project=default
```

Response:
```json
{"otp": "482910"}
```

Returns `404` if no unread message with a detected OTP exists for that number.

#### Delete all messages (hard delete)
```
DELETE /api/testing/messages?project=default
```

Bypasses soft-delete and TTL. Use at the start/end of each test to ensure a clean inbox.

#### Wait for a message (long-poll)
```
GET /api/testing/wait?to=+2348012345678&timeout=30s&project=default
```

Blocks until a matching message arrives or the timeout elapses. Returns the message on arrival (`200`) or `408 Request Timeout`. Ideal for asserting async OTP delivery without polling loops.

#### Seed test messages
```
POST /api/testing/seed
Content-Type: application/json

{
  "count": 5,
  "project": "default",
  "to": "+2348012345678"
}
```

Inserts synthetic messages for fixture setup.

**CI workflow example:**

```bash
# 1. Clean the inbox before the test
curl -s -X DELETE "http://localhost:4300/api/testing/messages?project=ci"

# 2. Trigger your application to send an OTP
curl -s -X POST https://my-app/auth/otp -d '{"phone":"+2348012345678"}'

# 3. Wait up to 30s for the message to arrive
curl -s "http://localhost:4300/api/testing/wait?to=%2B2348012345678&timeout=30s&project=ci"

# 4. Assert the OTP value
OTP=$(curl -s "http://localhost:4300/api/testing/otp?to=%2B2348012345678&project=ci" | jq -r .otp)
echo "Got OTP: $OTP"
```

---

## Authentication

Set `API_KEY` to a non-empty string to require authentication. All requests to `/api/*` must include:

```
X-API-Key: your-api-key
```

Requests missing or with a wrong key receive `401 Unauthorized`. The UI automatically passes the key from its configuration.

---

## Storage & Auto-purge

SMSpit stores messages in SQLite. Two mechanisms keep storage bounded:

1. **FIFO cap (`MAX_MESSAGES`):** When a project exceeds `MAX_MESSAGES`, the oldest messages are deleted before the new one is inserted.
2. **Soft-delete TTL (`AUTO_DELETE_AFTER`):** Messages are soft-deleted (flagged with `deleted_at`) after the configured duration. A background goroutine running every `PURGE_INTERVAL` hard-deletes rows with an expired `deleted_at`.

SQLite runs in WAL mode for better read/write concurrency.

---

## Development

```bash
# Install Go and frontend deps
go mod download
cd frontend && npm install && cd ..

# Run in dev mode (API :4300, Vite dev server :4301 with HMR)
make dev

# Build production binary (embeds the React build)
make build

# Run tests
make test

# Vet
make vet

# Full CI check (vet + test + build)
make ci
```

---

## Self-hosting

**Docker Compose with persistent SQLite:**

```yaml
services:
  smspit:
    image: valentinesamuel/smspit:latest
    ports:
      - "4300:4300"
      - "4301:4301"
    volumes:
      - smspit-data:/data
    environment:
      DATABASE_URL: sqlite:/data/db.sqlite
      NODE_ENV: production
      MAX_MESSAGES: "5000"
      AUTO_DELETE_AFTER: "168h"   # 7 days
      PURGE_INTERVAL: "6h"
      API_KEY: "change-me"
      ALLOWED_ORIGINS: "https://your-internal-tool.example.com"
      WEBHOOK_URL: "https://your-app.example.com/smspit-hook"
      WEBHOOK_MAX_RETRIES: "5"
      WEBHOOK_RETRY_BACKOFF: "10s"

volumes:
  smspit-data:
```

Mount `/data` as a named volume to persist messages across container restarts. The binary writes the SQLite file to `DATABASE_URL` at startup and applies any pending schema migrations automatically.

### Blog post: https://engineeringval.hashnode.dev/i-built-mailpit-for-sms-because-nothing-else-existed
