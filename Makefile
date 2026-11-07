# TableQR — one command per task. `make help` lists them.
# Node API (NestJS + Vitest + Prisma or Drizzle) and a Vite web app. Drop the web targets for a
# backend-only repo; for Next.js or Nuxt set WEB_PORT=3000.
.DEFAULT_GOAL := help
.PHONY: help install dev up down api web migrate lint format test e2e bench ci
SHELL := /bin/bash
API := cd services/api &&
WEB := cd web &&
API_PORT ?= 3000
WEB_PORT ?= 5173
ORM ?= drizzle

help: ## Show this help
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# --- setup -------------------------------------------------------------------
install: ## Install repo tooling, API and web dependencies
	npm install
	$(API) npm install
	$(WEB) npm install

# --- run ---------------------------------------------------------------------
dev: up migrate ## Start infra, migrate, then run API and web together (Ctrl-C stops both)
	$(MAKE) -f $(firstword $(MAKEFILE_LIST)) -j 2 api web

api: ## Run the API in watch mode on :$(API_PORT)
	$(API) PORT=$(API_PORT) npm run start:dev

web: ## Run the web app in development on :$(WEB_PORT)
	$(WEB) npm run dev -- --port $(WEB_PORT) --strictPort

up: ## Start local infrastructure (docker compose)
	docker compose up -d --wait

down: ## Stop local infrastructure
	docker compose down

migrate: ## Apply database migrations (ORM=prisma or ORM=drizzle)
ifeq ($(ORM),prisma)
	$(API) npx prisma migrate deploy
else
	$(API) npx drizzle-kit migrate
endif

# --- quality -----------------------------------------------------------------
lint: ## Format check, lint and typecheck everything
	$(API) npm run lint && npx tsc --noEmit
	$(WEB) npm run lint && npm run typecheck
	npx prettier --check .

format: ## Format everything
	npx prettier --write .

test: ## Unit and API/component tests with coverage (Vitest)
	$(API) npm run test:cov
	$(WEB) npm test

e2e: ## API e2e specs and browser journeys (Playwright) against the built app
	$(API) npm run test:e2e
	$(WEB) npx playwright test

bench: ## Performance benchmark (k6) against a running API; see benchmarks/plan.md
	k6 run --env BASE_URL=http://127.0.0.1:$(API_PORT) bench/api.js

ci: lint test ## Everything CI runs
