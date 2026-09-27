# Architecture Map

Explore architecture through place and route.

A discovery platform for architecturally significant places, built around an
interactive map and a time-budget trip planner. See
[docs/architecture.md](docs/architecture.md) for the design and roadmap.

**Current state:** Phase 2, catalog database. The API serves a small set of
real, sourced places with filtering and geographic search. The site still shows
only a landing page with the live API status. There is no map yet.

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
make seed      # validate and load the places in data/seed
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

Then try the catalog:

```bash
curl "http://localhost:8000/api/v1/places"
curl "http://localhost:8000/api/v1/places/mit-chapel"
curl "http://localhost:8000/api/v1/places?style=modernism&bbox=-71.12,42.34,-71.05,42.37"
curl "http://localhost:8000/api/v1/filters"
```

## Test and lint

```bash
make test      # backend tests
make lint      # ruff, eslint, TypeScript
make check     # everything CI runs, including the frontend build
```

Database tests run against a separate `archmap_test` database that is created
and dropped automatically. They never touch your development data. They are
skipped locally if PostgreSQL is not running, and they fail in CI if it is missing.

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
(cd apps/api && uv run python ../../data/scripts/seed.py)

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
| `GET /api/v1/places` | Published places as lightweight items for markers and lists |
| `GET /api/v1/places/{slug}` | Full details of one place, including provenance |
| `GET /api/v1/filters` | Available filter options with counts |

Interactive documentation is at http://localhost:8000/docs.

### Filtering places

| Parameter | Meaning |
|---|---|
| `bbox` | Viewport as `west,south,east,north` in decimal degrees |
| `architect` | Architect slug. Repeat to match any of them |
| `style` | Style slug. Includes sub-styles. Repeat to match any of them |
| `building_type` | Building type slug. Repeat to match any of them |
| `period` | Period slug. Repeat to match any of them |
| `tag` | Tag slug. Repeat to require every tag |
| `public_access` | `public`, `exterior_only`, `by_appointment`, `private`, `unknown` |
| `admission_type` | `free`, `paid`, `donation`, `unknown` |
| `tours_available` | `true` or `false` |
| `year_from`, `year_to` | Construction year range. A span matches if any part overlaps |
| `limit`, `offset` | Paging. The default limit is 100 and the maximum is 500 |

Different parameters combine with AND. Unknown parameters return a 422 error.
Draft places are never returned.

## Seed data

Seed data is plain JSON that people can read and edit:

```
data/seed/taxonomy.json          cities, periods, building types, styles, tags, architects
data/seed/places/<slug>.json     one file per place
```

```bash
make seed-check   # validate only
make seed         # validate, then import
```

- **Validation comes first.** Every problem in every file is reported, and nothing
  is written if anything is invalid.
- **Safe to repeat.** Records are matched on slug or source URL. A second run
  reports that the database is already up to date.
- **Never deletes.** Removing a file does not remove the place from the database.

### Facts versus curated values

Each place file keeps two kinds of data apart:

- **Sourced facts** such as architect, year, style, and public access. Each one
  needs an entry in `provenance` that points to an entry in `sources`. The note
  should quote what the source says. A published place cannot be imported
  without sources for its key claims.
- **Curated values** under `curated`: `significance_score` and the visit
  durations. These are our own product judgments. They are not historical
  facts, and the pipeline and the database both reject a source for them.

Never add a fact that you have not read in a source yourself. Text produced by
an AI model is not a source.

### Adding a place

1. Add any new architect, style, or tag to `data/seed/taxonomy.json`.
2. Copy an existing file in `data/seed/places/` and name it `<slug>.json`.
3. Fill in the facts, the sources, and a provenance entry for each claim.
4. Run `make seed-check`, then `make seed`.

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

Downgrading the catalog migration drops every catalog table and its data.

## Troubleshooting

- **Port 5432 is already in use:** start the database with
  `POSTGRES_PORT=5433 make db-up`, then change the port in `apps/api/.env`.
- **API status shows Unreachable:** confirm `make api` is running and that
  `CORS_ALLOWED_ORIGINS` in `apps/api/.env` contains the frontend origin.
- **Apple Silicon:** the PostGIS image runs under emulation. This is expected.
- **Reset the local database:** `docker compose down -v` deletes all local data.
