.PHONY: help install env db-up db-down migrate seed seed-check api web test lint check

help:
	@echo "make install   Install backend and frontend dependencies, create env files"
	@echo "make db-up     Start local PostgreSQL + PostGIS"
	@echo "make db-down   Stop the local database (data is kept)"
	@echo "make migrate   Apply database migrations"
	@echo "make seed      Validate seed data and load it into the database"
	@echo "make seed-check Validate seed data without touching the database"
	@echo "make api       Run FastAPI on http://localhost:8000"
	@echo "make web       Run Next.js on http://localhost:3000"
	@echo "make test      Run backend and frontend tests"
	@echo "make lint      Lint and typecheck backend and frontend"
	@echo "make check     Everything CI runs: lint, tests, frontend build"

install: env
	cd apps/api && uv sync
	cd apps/web && npm ci

# Creates local env files from the examples. Never overwrites existing files.
env:
	@test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
	@test -f apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local

db-up:
	docker compose up -d --wait

db-down:
	docker compose down

migrate:
	cd apps/api && uv run alembic upgrade head

seed:
	cd apps/api && uv run python ../../data/scripts/seed.py

seed-check:
	cd apps/api && uv run python ../../data/scripts/seed.py --check

api:
	cd apps/api && uv run uvicorn app.main:app --reload --port 8000

web:
	cd apps/web && npm run dev

test:
	cd apps/api && uv run pytest
	cd apps/web && npm test

lint:
	cd apps/api && uv run ruff check . ../../data/scripts && uv run ruff format --check . ../../data/scripts
	cd apps/web && npm run lint && npm run typecheck

check: lint test
	cd apps/web && npm run build
