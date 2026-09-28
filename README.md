# Architecture Map

Explore architecture through place and route.

A discovery platform for architecturally significant places, built around an
interactive map and a time-budget trip planner. See
[docs/architecture.md](docs/architecture.md) for the design and roadmap.

**Current state:** Phase 4, search and filters. The site shows a Google Map with
our places as markers, loaded from our own API for the visible area. Places can
be searched and filtered, and the markers follow. Selecting a place shows a
preview and full details with sources.

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

A Google Maps browser key is needed to see the map. See
[Google Maps setup](#google-maps-setup). Tests and CI need no key.

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

Open http://localhost:3000. The map opens on Boston and Cambridge with a marker
for each seeded place.

You can also query the catalog directly:

```bash
curl "http://localhost:8000/api/v1/places"
curl "http://localhost:8000/api/v1/places/mit-chapel"
curl "http://localhost:8000/api/v1/places?style=modernism&bbox=-71.12,42.34,-71.05,42.37"
curl "http://localhost:8000/api/v1/places?q=richardson"
curl "http://localhost:8000/api/v1/filters"
```

## Test and lint

```bash
make test      # backend and frontend tests
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

## Google Maps setup

1. In Google Cloud, enable the **Maps JavaScript API**. No other Google API is used yet.
2. Create an API key and restrict it:
   - Application restriction: HTTP referrers, for example `http://localhost:3000/*`
   - API restriction: Maps JavaScript API only
3. Put the key in `apps/web/.env.local`:

   ```
   NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=your-key
   ```

4. Restart `make web`. Environment changes are only read at startup.

A browser key is visible to every visitor by design. The restrictions are what
protect it. Never commit `.env.local`.

**Map ID.** The markers use Google's Advanced Markers, which need a Map ID.
Without configuration the app uses Google's `DEMO_MAP_ID`, which Google provides
for development. Before production, create a Map ID in Google Cloud under
Map Management, with type JavaScript and Vector, and set `NEXT_PUBLIC_GOOGLE_MAP_ID`.

If the key is missing or rejected, the page explains what to fix instead of the map.

## How the map loads places

1. The map reports its visible bounds whenever it moves.
2. The app waits until the map has been still for 350 ms.
3. Typed search text and year fields are applied after a 300 ms pause.
   Checkbox filters apply at once.
4. It requests `GET /api/v1/places` with the bounding box, the search, and the
   filters together, for example
   `?bbox=-71.12,42.34,-71.05,42.37&q=richardson&style=modernism`.
5. PostgreSQL and PostGIS return only matching places in that rectangle, and
   each becomes a marker and a row in the result list.

When you zoom in on an area already fully loaded with the same filters, no
request is sent. A request still running for a previous view or filter is
cancelled. The browser never decides which places match.

The applied search and filters are kept in the page address, for example
`/?q=richardson&public_access=public`, so a filtered view survives a refresh
and can be shared. The map position is not kept in the address.

## API endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/health` | Liveness. Returns `{"status": "healthy"}` |
| `GET /api/v1/health/ready` | Readiness. Checks the database, returns 503 if unreachable |
| `GET /api/v1/places` | Published places as lightweight items for markers and lists, with search and filters |
| `GET /api/v1/places/{slug}` | Full details of one place, including provenance |
| `GET /api/v1/filters` | Available filter options with counts |

Interactive documentation is at http://localhost:8000/docs.

### Filtering places

| Parameter | Meaning |
|---|---|
| `bbox` | Viewport as `west,south,east,north` in decimal degrees |
| `q` | Text search. See below |
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

**Search.** `q` is case-insensitive, and surrounding or repeated whitespace is
ignored. A blank `q` means no search. Every word must match the start of a word
in the place name, an architect, a style, a tag, or the building type, so
`richard` finds Henry Hobson Richardson but `mit` does not find "Dormitory".
Searching a style also finds its sub-styles. Search is limited to 100 characters
and 8 words. It uses plain PostgreSQL matching, and full-text or trigram search
can replace it later in `app/catalog/search.py` without changing the API.

**Year range.** A building matches when any part of its construction span
overlaps the range. A building built 1872 to 1877 matches `year_from=1875`.
Buildings with no known construction year never match a year filter.

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
