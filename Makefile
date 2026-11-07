# TableQR — one command per task. `make help` lists them.
# Node API (NestJS + Vitest + Drizzle) in services/api and a Vite + Vue web app in web/.
.DEFAULT_GOAL := help
.PHONY: help install dev up down api web migrate lint format test e2e bench budget lighthouse baseline test-scripts ci
SHELL := /bin/bash
API := cd services/api &&
WEB := cd web &&
API_PORT ?= 3310
WEB_PORT ?= 5310
E2E_DATABASE_URL ?= postgresql://tableqr:tableqr@127.0.0.1:55432/tableqr_e2e

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

e2e: up ## API e2e on Testcontainers; browser journeys (iPhone + iPad) on a fresh e2e database
	$(API) npm run test:e2e
	docker compose exec -T db psql -q -U tableqr -d postgres -c 'drop database if exists tableqr_e2e with (force)' -c 'create database tableqr_e2e'
	$(API) TQR_DATABASE_URL=$(E2E_DATABASE_URL) npm run db:migrate
	$(WEB) TQR_DATABASE_URL=$(E2E_DATABASE_URL) npm run test:e2e

bench: ## Performance benchmark (k6) against a running API; see benchmarks/plan.md
	mkdir -p benchmarks/results
	k6 run --env BASE_URL=http://127.0.0.1:$(API_PORT) bench/api.js

budget: ## Build the web app and check the initial JS budget (150 kB gzip)
	$(WEB) npm run build-only && npm run budget

lighthouse: ## Lighthouse (mobile, slow 4G) on the preview build; fails when LCP > 2.5 s
	$(WEB) npm run build-only && npm run lighthouse

baseline: ## Record benchmarks/results/*.json into benchmarks/baseline.json (run bench, budget, lighthouse first)
	node scripts/record-baseline.mjs

test-scripts: ## Unit tests of the repo scripts (node:test)
	node --test scripts/

ci: lint test test-scripts e2e budget ## Everything CI runs
