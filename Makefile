COMPOSE := docker compose

# Docker Desktop(WSL)で compose の bake 連携が buildx を呼べず失敗することがあるため無効化する
export COMPOSE_BAKE := false

.PHONY: env up down logs generate test lint build-prod migrate-up migrate-down

env: ## .env を .env.example から作成する(既に中身があれば何もしない)
	@test -s .env || cp .env.example .env

up: env ## 開発環境を起動する
	$(COMPOSE) up --build

down: ## 停止する(データは残す)
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

generate: env ## OpenAPI / SQL からコードを生成する
	$(COMPOSE) run --rm sqlc generate
	$(COMPOSE) run --rm --no-deps backend go tool oapi-codegen -config oapi-codegen.yaml ../api/openapi.yaml
	$(COMPOSE) run --rm --no-deps frontend npm run generate:api

test: env ## Backend / Frontend のテスト
	$(COMPOSE) run --rm backend go test ./...
	$(COMPOSE) run --rm --no-deps frontend npm test

lint: env ## vet / golangci-lint(depguard を含む) / eslint / 型チェック
	$(COMPOSE) run --rm --no-deps backend go vet ./...
	$(COMPOSE) run --rm --no-deps backend golangci-lint run
	$(COMPOSE) run --rm --no-deps frontend npm run lint
	$(COMPOSE) run --rm --no-deps frontend npm run typecheck

build-prod: ## prod イメージをビルドする
	docker build --target prod -t taskapp-backend:prod ./backend
	docker build --target prod -t taskapp-frontend:prod ./frontend

migrate-up: env
	$(COMPOSE) run --rm migrate up

migrate-down: env ## 1 つ戻す
	$(COMPOSE) run --rm migrate down 1
