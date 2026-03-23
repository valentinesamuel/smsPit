.PHONY: dev build test lint vet ci docker-build clean

BINARY=smspit
IMAGE=valentinesamuel/smspit

# Run Go API + Vite dev server concurrently
dev:
	@echo "Starting SMSpit dev servers..."
	@if ! command -v air > /dev/null; then \
		echo "Installing air..."; \
		go install github.com/air-verse/air@latest; \
	fi
	@(cd frontend && npm run dev) &
	air -c .air.toml

# Build React frontend, then compile Go binary with embedded assets
build:
	@echo "Building frontend..."
	cd frontend && npm run build
	@echo "Building Go binary..."
	CGO_ENABLED=0 go build -o bin/$(BINARY) ./cmd/smspit
	@echo "Build complete: bin/$(BINARY)"

# Run Go tests
test:
	go test ./... -v

# Run linters
lint:
	@if command -v golangci-lint > /dev/null; then \
		golangci-lint run; \
	else \
		echo "golangci-lint not found, running go vet instead"; \
		go vet ./...; \
	fi
	@cd frontend && npm run lint 2>/dev/null || true

# Run go vet
vet:
	go vet ./...

# Run all CI checks locally (mirrors .github/workflows/ci.yml)
ci: vet
	cd frontend && npm ci && npm run build
	@cd frontend && npm run lint 2>/dev/null || true

# Build multi-arch Docker image and push to registry
docker-build:
	docker buildx inspect multiarch-builder > /dev/null 2>&1 || \
		docker buildx create --name multiarch-builder --driver docker-container --use
	docker buildx use multiarch-builder
	docker buildx build \
		--platform linux/amd64,linux/arm64,linux/arm/v7 \
		-t $(IMAGE):latest \
		--push \
		.

# Remove build artifacts
clean:
	rm -rf bin/ cmd/smspit/web/assets cmd/smspit/web/index.html
	@cd frontend && rm -rf dist node_modules/.cache 2>/dev/null || true
