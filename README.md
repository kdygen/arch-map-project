# Architecture Map

Explore architecture through place and route.

A discovery platform for architecturally significant places, built around an
interactive map and a time-budget trip planner. See
[docs/architecture.md](docs/architecture.md) for the design and roadmap.

**Current state:** Phase 1, project foundation. The site shows a landing page
that reports the live status of the API.

## Stack

| Part | Technology | Location |
|---|---|---|
| Frontend | Next.js, React, TypeScript | `apps/web` |
| Backend | FastAPI, SQLAlchemy, Alembic | `apps/api` |
| Database | PostgreSQL 17 + PostGIS | Docker locally, Supabase in production |

## Prerequisites

- [Node.js](https://nodejs.org) 22 or newer
- [uv](https://docs.astral.sh/uv/), which installs Python 3.13 automatically
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), running
- `make`, preinstalled on macOS and Linux

No Google, Supabase, or Anthropic credentials are needed yet.

## First-time setup

Run from the repository root:

```bash
make install   # install dependencies, create apps/api/.env and apps/web/.env.local
make db-up     # start PostgreSQL + PostGIS in Docker
make migrate   # apply database migrations
```

## Run the app

Use two terminals:

```bash
make api       # http://localhost:8000  (API docs at /docs)
```

```bash
make web       # http://localhost:3000
```

Open http://localhost:3000. The page should show **API status: Healthy**.

## Test and lint

```bash
make test      # backend tests
make lint      # ruff, eslint, TypeScript
make check     # everything CI runs, including the frontend build
```

Two backend tests need the database. They are skipped locally if it is not
running, and they fail in CI if it is missing.

## Commands without make

```bash
# install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
(cd apps/api && uv sync)
(cd apps/web && npm ci)

# database
docker compose up -d --wait
(cd apps/api && uv run alembic upgrade head)

# run
(cd apps/api && uv run uvicorn app.main:app --reload --port 8000)
(cd apps/web && npm run dev)

# verify
(cd apps/api && uv run pytest && uv run ruff check . && uv run ruff format --check .)
(cd apps/web && npm run lint && npm run typecheck && npm run build)
```

## API endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/health` | Liveness. Returns `{"status": "healthy"}` |
| `GET /api/v1/health/ready` | Readiness. Checks the database, returns 503 if unreachable |

## Configuration

All configuration comes from environment variables. The `.env.example` files
list every variable with placeholder values.

| File | Used by | Committed |
|---|---|---|
| `apps/api/.env.example` | template | yes |
| `apps/api/.env` | FastAPI and Alembic | no |
| `apps/web/.env.example` | template | yes |
| `apps/web/.env.local` | Next.js | no |

Variables prefixed with `NEXT_PUBLIC_` are sent to the browser. Never put a
secret in one.

`DATABASE_URL` accepts `postgres://`, `postgresql://`, and
`postgresql+psycopg://` forms, so a Supabase connection string works as given.

## Database migrations

```bash
cd apps/api
uv run alembic revision -m "describe the change"   # create a migration
uv run alembic upgrade head                        # apply
uv run alembic downgrade -1                        # roll back one step
```

The first migration enables PostGIS. Its downgrade is deliberately a no-op,
because dropping PostGIS would destroy spatial data.

## Troubleshooting

- **Port 5432 is already in use:** start the database with
  `POSTGRES_PORT=5433 make db-up`, then change the port in `apps/api/.env`.
- **API status shows Unreachable:** confirm `make api` is running and that
  `CORS_ALLOWED_ORIGINS` in `apps/api/.env` contains the frontend origin.
- **Apple Silicon:** the PostGIS image runs under emulation. This is expected.
- **Reset the local database:** `docker compose down -v` deletes all local data.
