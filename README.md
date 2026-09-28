# Architecture Map

Explore architecture through place and route.

A discovery platform for architecturally significant places, built around an
interactive map and a time-budget trip planner. See
[docs/architecture.md](docs/architecture.md) for the design and roadmap.

**Current state:** Phase 5, routes. Choose a start, an end, and walking or
driving, see the route, and discover architecture near it. Also included from Phase 4:
search and filters. The site shows a Google Map with
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

Two Google keys are used: a browser key for the map and location search, and a
server key for routes. See [Google Maps setup](#google-maps-setup).
Tests and CI need no keys and never call Google.

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

The app uses two separate keys. Never commit either one.

| Key | Where it lives | Google APIs | Restriction |
|---|---|---|---|
| Browser key | `apps/web/.env.local` as `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Maps JavaScript API, Places API (New) | HTTP referrers, for example `http://localhost:3000/*` |
| Server key | `apps/api/.env` as `GOOGLE_MAPS_SERVER_KEY` | Routes API | Routes API only. Add an IP restriction in production |

1. In Google Cloud, enable the three APIs in the table.
2. Create the two keys with the restrictions shown.
3. Put each key in its file.
4. Restart `make api` and `make web`. Environment changes are only read at startup.

The browser key is visible to every visitor by design, and its restrictions are
what protect it. The server key never leaves the backend. There must never be a
`NEXT_PUBLIC_` variable holding the server key.

**Without the server key** everything works except routes. A route request then
returns a clear error and the rest of the app is unaffected.

**Map ID.** The markers use Google's Advanced Markers, which need a Map ID.
Without configuration the app uses Google's `DEMO_MAP_ID`, which Google provides
for development. Before production, create a Map ID in Google Cloud under
Map Management, with type JavaScript and Vector, and set `NEXT_PUBLIC_GOOGLE_MAP_ID`.

If the browser key is missing or rejected, the page explains what to fix instead of the map.

### What costs money

| Action | Google request |
|---|---|
| Opening the page, moving the map | Map loads only |
| Typing in From or To | Places autocomplete, after a 250 ms pause and at least 2 characters |
| Choosing a suggestion | One Places lookup for its location, which ends the autocomplete session |
| **Pressing Find route** | **One Routes API request** |
| Changing an architecture filter or search | None. Only our own database is asked |
| Switching between Explore and Route | None. The route is kept |
| Changing Walking or Driving | None. The shown route is removed until Find route is pressed |
| Pressing Find route again for the route already shown | None |
| Swapping From and To | None, until Find route is pressed |

Routes are never requested while typing, on page load, or in the background.
Google results are not stored in the database.

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
| `POST /api/v1/routes` | A walking or driving route between two coordinates. One paid provider request |
| `POST /api/v1/routes/nearby-places` | Published places near a route line, in route order. Database only |

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

## Routes

```bash
curl -X POST http://localhost:8000/api/v1/routes \
  -H "Content-Type: application/json" \
  -d '{"origin": {"lat": 42.3601, "lng": -71.0942},
       "destination": {"lat": 42.3550, "lng": -71.0655},
       "travel_mode": "walking"}'
```

The response holds an encoded polyline, the distance in meters, the duration in
seconds, and any warnings from the provider. `travel_mode` is `walking`, the
default, or `driving`. Endpoints more than 50 km apart in a straight line are
refused for walking, and more than 300 km for driving, before any paid request.
Driving routes are requested without live traffic.

```bash
curl -X POST http://localhost:8000/api/v1/routes/nearby-places \
  -H "Content-Type: application/json" \
  -d '{"polyline": "<polyline from the route>", "corridor_meters": 500,
       "filters": {"style": ["modernism"]}}'
```

- **Corridor.** Places within `corridor_meters` of the route line, 500 by
  default for every travel mode, allowed from 25 to 1000. This is a straight-line distance measured
  by PostGIS. It is not a detour time: a place 150 m away can need a longer
  trip because of the street layout.
- **Order.** Places are listed by how far along the route their nearest point
  is, then by distance from the route, then by name.
- **Filters.** `filters` takes the same search and filters as the place list.
- **Errors.** Routing errors carry a stable `code`, such as `no_route`,
  `routing_not_configured`, `routing_quota_exceeded`, `routing_timeout`, or
  `routing_unavailable`. Provider error details are never passed on.

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
