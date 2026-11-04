.PHONY: up down reset tidy test run issue
COMPOSE=docker compose -f deploy/docker-compose.yml

up:    ; $(COMPOSE) up -d
down:  ; $(COMPOSE) down
reset: ; $(COMPOSE) down -v && $(COMPOSE) up -d   # hapus database, mulai dari nol
tidy:  ; go mod tidy
test:  ; go test ./...
run:   ; go run ./cmd/web
issue: ; go run ./cmd/issue-vouchers -open -print
