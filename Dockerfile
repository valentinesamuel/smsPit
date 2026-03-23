# Stage 1: Build React frontend (always on amd64 — output is platform-agnostic JS/CSS)
FROM --platform=linux/amd64 node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Stage 2: Build Go binary
FROM golang:1.25-alpine AS go-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Copy built frontend into embed location (vite outputs to cmd/smspit/web)
COPY --from=frontend-builder /app/cmd/smspit/web ./cmd/smspit/web
# Build binary (CGO disabled, pure Go SQLite)
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /smspit ./cmd/smspit

# Stage 3: Runtime
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=go-builder /smspit /app/smspit
RUN mkdir -p /data
EXPOSE 4300 4301
ENV PORT=4300 \
    UI_PORT=4301 \
    DATABASE_URL=sqlite:/data/db.sqlite \
    NODE_ENV=production
ENTRYPOINT ["/app/smspit"]
