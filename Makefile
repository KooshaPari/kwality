# Kwality Platform Makefile
# Provides common development, testing, and deployment commands

# Configuration
PROJECT_NAME := kwality
GO_VERSION := 1.21
RUST_VERSION := 1.75
DOCKER_REGISTRY := ghcr.io
DOCKER_NAMESPACE := kooshapari
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")

# Docker image names
ORCHESTRATOR_IMAGE := $(DOCKER_REGISTRY)/$(DOCKER_NAMESPACE)/$(PROJECT_NAME)/orchestrator
RUNTIME_VALIDATOR_IMAGE := $(DOCKER_REGISTRY)/$(DOCKER_NAMESPACE)/$(PROJECT_NAME)/runtime-validator

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

# Default target
.PHONY: help
help: ## Show this help message
	@echo "$(BLUE)Kwality Platform Development Commands$(NC)"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Development setup
.PHONY: setup
setup: ## Set up development environment
	@echo "$(BLUE)Setting up development environment...$(NC)"
	@which go > /dev/null || (echo "$(RED)Go $(GO_VERSION) is required$(NC)" && exit 1)
	@which cargo > /dev/null || (echo "$(RED)Rust $(RUST_VERSION) is required$(NC)" && exit 1)
	@which docker > /dev/null || (echo "$(RED)Docker is required$(NC)" && exit 1)
	@which docker-compose > /dev/null || (echo "$(RED)Docker Compose is required$(NC)" && exit 1)
	@echo "$(GREEN)Installing Go dependencies...$(NC)"
	go mod download
	@echo "$(GREEN)Installing Rust dependencies...$(NC)"
	cd engines/runtime-validator && cargo build
	@echo "$(GREEN)Development environment ready!$(NC)"

.PHONY: deps
deps: ## Download and update dependencies
	@echo "$(BLUE)Updating dependencies...$(NC)"
	go mod download
	go mod tidy
	cd engines/runtime-validator && cargo update

# Building
.PHONY: build
build: build-go build-rust ## Build all components

.PHONY: build-go
build-go: ## Build Go applications
	@echo "$(BLUE)Building Go applications...$(NC)"
	CGO_ENABLED=0 go build -ldflags="-w -s -X main.version=$(VERSION)" -o bin/kwality ./cmd/kwality
	CGO_ENABLED=0 go build -ldflags="-w -s -X main.version=$(VERSION)" -o bin/kwality-cli ./cmd/kwality-cli

.PHONY: build-rust
build-rust: ## Build Rust runtime validator
	@echo "$(BLUE)Building Rust runtime validator...$(NC)"
	cd engines/runtime-validator && cargo build --release

.PHONY: build-all
build-all: clean build ## Clean and build all components

# Testing
.PHONY: test
test: test-go test-rust ## Run all tests

.PHONY: test-go
test-go: ## Run Go tests
	@echo "$(BLUE)Running Go tests...$(NC)"
	go test -v -race -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

.PHONY: test-rust
test-rust: ## Run Rust tests
	@echo "$(BLUE)Running Rust tests...$(NC)"
	cd engines/runtime-validator && cargo test --verbose

.PHONY: test-integration
test-integration: ## Run integration tests
	@echo "$(BLUE)Running integration tests...$(NC)"
	go test -v -tags=integration ./tests/integration/...

.PHONY: test-e2e
test-e2e: ## Run end-to-end tests
	@echo "$(BLUE)Running end-to-end tests...$(NC)"
	@echo "$(YELLOW)Starting test environment...$(NC)"
	docker-compose -f docker-compose.kwality.yml up -d postgres redis
	@sleep 10
	@echo "$(YELLOW)Running tests...$(NC)"
	go test -v -tags=e2e ./tests/e2e/...
	@echo "$(YELLOW)Stopping test environment...$(NC)"
	docker-compose -f docker-compose.kwality.yml down

.PHONY: test-watch
test-watch: ## Run tests in watch mode
	@echo "$(BLUE)Running tests in watch mode...$(NC)"
	which inotifywait > /dev/null || (echo "$(RED)inotify-tools required for watch mode$(NC)" && exit 1)
	@while true; do \
		$(MAKE) test; \
		echo "$(YELLOW)Watching for changes...$(NC)"; \
		inotifywait -qre modify --include='\.go$$|\.rs$$' .; \
	done

# Code quality
.PHONY: lint
lint: lint-go lint-rust ## Run all linters

.PHONY: lint-go
lint-go: ## Run Go linter
	@echo "$(BLUE)Running Go linter...$(NC)"
	golangci-lint run --timeout=5m

.PHONY: lint-rust
lint-rust: ## Run Rust linter
	@echo "$(BLUE)Running Rust linter...$(NC)"
	cd engines/runtime-validator && cargo clippy --all-targets --all-features -- -D warnings

.PHONY: fmt
fmt: fmt-go fmt-rust ## Format all code

.PHONY: fmt-go
fmt-go: ## Format Go code
	@echo "$(BLUE)Formatting Go code...$(NC)"
	go fmt ./...
	goimports -w .

.PHONY: fmt-rust
fmt-rust: ## Format Rust code
	@echo "$(BLUE)Formatting Rust code...$(NC)"
	cd engines/runtime-validator && cargo fmt

.PHONY: check
check: lint test ## Run linters and tests

# Security
.PHONY: security
security: security-go security-rust ## Run security checks

.PHONY: security-go
security-go: ## Run Go security checks
	@echo "$(BLUE)Running Go security checks...$(NC)"
	gosec ./...

.PHONY: security-rust
security-rust: ## Run Rust security checks
	@echo "$(BLUE)Running Rust security checks...$(NC)"
	cd engines/runtime-validator && cargo audit

.PHONY: vuln-check
vuln-check: ## Check for known vulnerabilities
	@echo "$(BLUE)Checking for vulnerabilities...$(NC)"
	go list -json -deps ./... | nancy sleuth
	cd engines/runtime-validator && cargo audit

# Benchmarking
.PHONY: bench
bench: bench-go bench-rust ## Run all benchmarks

.PHONY: bench-go
bench-go: ## Run Go benchmarks
	@echo "$(BLUE)Running Go benchmarks...$(NC)"
	go test -bench=. -benchmem ./...

.PHONY: bench-rust
bench-rust: ## Run Rust benchmarks
	@echo "$(BLUE)Running Rust benchmarks...$(NC)"
	cd engines/runtime-validator && cargo bench

# Docker operations
.PHONY: docker-build
docker-build: ## Build Docker images
	@echo "$(BLUE)Building Docker images...$(NC)"
	docker build -f Dockerfile.go -t $(ORCHESTRATOR_IMAGE):$(VERSION) .
	docker build -f engines/runtime-validator/Dockerfile -t $(RUNTIME_VALIDATOR_IMAGE):$(VERSION) engines/runtime-validator/

.PHONY: docker-push
docker-push: ## Push Docker images to registry
	@echo "$(BLUE)Pushing Docker images...$(NC)"
	docker push $(ORCHESTRATOR_IMAGE):$(VERSION)
	docker push $(RUNTIME_VALIDATOR_IMAGE):$(VERSION)

.PHONY: docker-tag-latest
docker-tag-latest: ## Tag images as latest
	docker tag $(ORCHESTRATOR_IMAGE):$(VERSION) $(ORCHESTRATOR_IMAGE):latest
	docker tag $(RUNTIME_VALIDATOR_IMAGE):$(VERSION) $(RUNTIME_VALIDATOR_IMAGE):latest

# Local development
.PHONY: dev
dev: ## Start development environment
	@echo "$(BLUE)Starting development environment...$(NC)"
	docker-compose -f docker-compose.kwality.yml up -d postgres redis
	@sleep 5
	@echo "$(GREEN)Development environment ready!$(NC)"
	@echo "Database: postgresql://postgres:postgres@localhost:5432/kwality"
	@echo "Redis: redis://localhost:6379"

.PHONY: dev-stop
dev-stop: ## Stop development environment
	@echo "$(BLUE)Stopping development environment...$(NC)"
	docker-compose -f docker-compose.kwality.yml down

.PHONY: dev-logs
dev-logs: ## Show development environment logs
	docker-compose -f docker-compose.kwality.yml logs -f

.PHONY: run
run: build-go ## Run the Kwality server locally
	@echo "$(BLUE)Starting Kwality server...$(NC)"
	./bin/kwality

.PHONY: run-cli
run-cli: build-go ## Run the Kwality CLI
	@echo "$(BLUE)Running Kwality CLI...$(NC)"
	./bin/kwality-cli

.PHONY: run-validator
run-validator: build-rust ## Run the runtime validator locally
	@echo "$(BLUE)Starting Kwality runtime validator...$(NC)"
	cd engines/runtime-validator && cargo run

# Database operations
.PHONY: db-migrate
db-migrate: ## Run database migrations
	@echo "$(BLUE)Running database migrations...$(NC)"
	migrate -path database/migrations -database "postgresql://postgres:postgres@localhost:5432/kwality?sslmode=disable" up

.PHONY: db-reset
db-reset: ## Reset database
	@echo "$(BLUE)Resetting database...$(NC)"
	docker-compose -f docker-compose.kwality.yml exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS kwality;"
	docker-compose -f docker-compose.kwality.yml exec postgres psql -U postgres -c "CREATE DATABASE kwality;"

# Deployment
.PHONY: deploy
deploy: ## Deploy to production
	@echo "$(BLUE)Deploying Kwality platform...$(NC)"
	./scripts/deploy-kwality.sh deploy

.PHONY: deploy-staging
deploy-staging: ## Deploy to staging
	@echo "$(BLUE)Deploying to staging...$(NC)"
	./scripts/deploy-kwality.sh deploy

.PHONY: deploy-k8s
deploy-k8s: ## Deploy to Kubernetes
	@echo "$(BLUE)Deploying to Kubernetes...$(NC)"
	kubectl apply -f k8s/

# Monitoring and debugging
.PHONY: logs
logs: ## Show application logs
	docker-compose -f docker-compose.kwality.yml logs -f kwality-orchestrator kwality-runtime-validator

.PHONY: ps
ps: ## Show running containers
	docker-compose -f docker-compose.kwality.yml ps

.PHONY: exec-orchestrator
exec-orchestrator: ## Exec into orchestrator container
	docker-compose -f docker-compose.kwality.yml exec kwality-orchestrator sh

.PHONY: exec-validator
exec-validator: ## Exec into runtime validator container
	docker-compose -f docker-compose.kwality.yml exec kwality-runtime-validator sh

# Utilities
.PHONY: clean
clean: ## Clean build artifacts
	@echo "$(BLUE)Cleaning build artifacts...$(NC)"
	rm -rf bin/
	rm -rf engines/runtime-validator/target/
	rm -f coverage.out coverage.html
	docker system prune -f

.PHONY: clean-all
clean-all: clean ## Clean everything including Docker volumes
	@echo "$(BLUE)Cleaning all artifacts and volumes...$(NC)"
	docker-compose -f docker-compose.kwality.yml down -v
	docker system prune -af --volumes

.PHONY: docs
docs: ## Generate documentation
	@echo "$(BLUE)Generating documentation...$(NC)"
	go doc -all ./... > docs/api.md
	cd engines/runtime-validator && cargo doc --no-deps

.PHONY: version
version: ## Show version information
	@echo "Version: $(VERSION)"
	@echo "Go version: $(shell go version)"
	@echo "Rust version: $(shell cd engines/runtime-validator && cargo version)"
	@echo "Docker version: $(shell docker --version)"

# Release
.PHONY: release
release: check docker-build docker-tag-latest ## Prepare a release
	@echo "$(BLUE)Preparing release $(VERSION)...$(NC)"
	git tag -a v$(VERSION) -m "Release version $(VERSION)"
	@echo "$(GREEN)Release $(VERSION) ready. Push with: git push origin v$(VERSION)$(NC)"

.PHONY: release-notes
release-notes: ## Generate release notes
	@echo "$(BLUE)Generating release notes...$(NC)"
	git log --pretty=format:"- %s" $(shell git describe --tags --abbrev=0)..HEAD

# Development workflow shortcuts
.PHONY: quick-test
quick-test: fmt lint test-go ## Quick development test cycle

.PHONY: full-check
full-check: clean build test security bench ## Full validation pipeline

.PHONY: pre-commit
pre-commit: fmt lint test ## Pre-commit checks

.PHONY: ci
ci: deps build lint test security ## Simulate CI pipeline locally

# Help for specific commands
.PHONY: help-dev
help-dev: ## Show development workflow help
	@echo "$(BLUE)Development Workflow:$(NC)"
	@echo "1. $(GREEN)make setup$(NC)     - Set up development environment"
	@echo "2. $(GREEN)make dev$(NC)       - Start local services (DB, Redis)"
	@echo "3. $(GREEN)make quick-test$(NC) - Run quick development cycle"
	@echo "4. $(GREEN)make run$(NC)       - Start the orchestrator"
	@echo "5. $(GREEN)make dev-stop$(NC)  - Stop local services"

.PHONY: help-ci
help-ci: ## Show CI/CD help
	@echo "$(BLUE)CI/CD Commands:$(NC)"
	@echo "1. $(GREEN)make ci$(NC)           - Simulate CI pipeline locally"
	@echo "2. $(GREEN)make full-check$(NC)   - Run complete validation"
	@echo "3. $(GREEN)make docker-build$(NC) - Build Docker images"
	@echo "4. $(GREEN)make deploy$(NC)       - Deploy to production"

# Make sure all phony targets are declared
.PHONY: all
all: setup build test