# TableQR — one command per task. `make help` lists them.
# Node API (NestJS + Vitest + Drizzle) in services/api and a Vite + Vue web app in web/.
.DEFAULT_GOAL := help
.PHONY: help install dev up down api web migrate lint format test e2e bench ci
SHELL := /bin/bash
API := cd services/api &&
WEB := cd web &&
API_PORT ?= 3310
WEB_PORT ?= 5310

# Settings: .env.example gives safe local defaults, .env (never committed) overrides them.
-include .env.example
-include .env
export

help: ## Show this help
	@grep -E '^[a-z0-9-]+:.*## ' $(firstword $(MAKEFILE_LIST)) | awk 'BEGIN {FS = ":.*## "} {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# --- setup -------------------------------------------------------------------
install: ## Install repo tooling, API and web dependencies (and Playwright browsers)
	npm install
	$(API) npm install
	$(WEB) npm install && npx playwright install chromium webkit

# --- run ---------------------------------------------------------------------
dev: up migrate ## Start Postgres, migrate, then run API and web together (Ctrl-C stops both)
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) -j 2 api web

api: ## Run the API in watch mode on :$(API_PORT)
	$(API) PORT=$(API_PORT) npm run start:dev

web: ## Run the web app in development on :$(WEB_PORT)
	$(WEB) npm run dev -- --port $(WEB_PORT) --strictPort

up: ## Start local infrastructure (docker compose)
	docker compose up -d --wait

down: ## Stop local infrastructure
	docker compose down

migrate: ## Apply database migrations (Drizzle)
	$(API) npm run db:migrate

# --- quality -----------------------------------------------------------------
lint: ## Format check, lint and typecheck everything
	$(API) npm run lint && npm run typecheck
	$(WEB) npm run lint && npm run typecheck
	npx prettier --check .

format: ## Format everything
	npx prettier --write .

test: ## Unit and component tests with coverage (Vitest)
	$(API) npm run test:cov
	$(WEB) npm test

e2e: ## API e2e on a real Postgres (Testcontainers) and browser journeys (Playwright, iPhone + iPad)
	$(API) npm run test:e2e
	$(WEB) npm run test:e2e

bench: ## Performance benchmark (k6) against a running API; see benchmarks/plan.md
	mkdir -p benchmarks/results
	k6 run --env BASE_URL=http://127.0.0.1:$(API_PORT) bench/api.js

ci: lint test e2e ## Everything CI runs
