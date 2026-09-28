# Architecture overview

Approved direction, recorded at the end of Phase 1.

## System

- **Frontend:** Next.js on Vercel. It calls the FastAPI backend for all data and never talks to the database directly.
- **Backend:** one FastAPI modular monolith on Render.
- **Database:** PostgreSQL with PostGIS. Docker locally, Supabase in production. Alembic owns the schema.
- **External providers:** wrapped behind service interfaces so they can be replaced.

## Backend modules

Present today:

- `app/core`: configuration and database access
- `app/health`: liveness and readiness endpoints
- `app/catalog`: models, response schemas, place search, filters
- `app/geo`: all PostGIS expressions. Viewport and radius today, route corridor in Phase 5.
- `app/seeding`: validation and idempotent import of `data/seed`

Planned, not yet created:

- `app/routing`: routing provider interface and Google adapter
- `app/planner`: scoring, strategies, solver. Pure Python with no I/O.
- `app/ai`: conversational layer, after the MVP

## Accepted decisions

- Walking only in V1. `travel_mode` stays in API and domain models.
- The planner uses exterior visit duration by default. Both exterior and interior durations are stored.
- `significance_score` is a curated value from 1 to 5.
- The time budget is a hard ceiling. The planner targets at most 95% of it.
- No persistent caching of Google route durations in V1.
- Rate limiting is required before paid Google-backed endpoints are public.
- Image license, source, and credit metadata are required for production data.
- The candidate shortlist for the route matrix must not rank on raw score alone.
  It should weigh interest relevance, curated significance, proximity to the
  baseline route, progress along the route, and a cheap detour estimate.
  The travel-time matrix is the authority once the shortlist exists.
  The exact heuristic is refined in the planner phase.
- An LLM never supplies routes, travel times, opening hours, or building facts.

## Frontend structure

- `components/map`: the only code that imports Google Maps. It takes plain
  places and reports plain bounds.
- `components/place`: preview and details. No map or Google code.
- `components/explorer.tsx`: connects map, data, and selection.
- `hooks`: viewport loading with debounce, and detail loading.
- `lib/api`: the typed API client. Every response is validated with zod.
- `lib/geo`: bounds math with no Google types.
- Marker clustering, when needed, goes into `components/map/place-markers.tsx`.

## Catalog schema notes

Deviations from the originally approved schema, all additive:

- Constrained text columns use CHECK constraints instead of native PostgreSQL
  enums, so adding a value is an ordinary migration.
- `cities` and `periods` have a `slug`, which the seed import matches on.
- `places` has `created_at` and `updated_at`.
- `opening_hours`, `opening_hours_exceptions`, and `place_images` have a
  surrogate `id` primary key.
- `sources.url` is unique. One source can support many places.
- `place_field_sources` uses the primary key (place, field, source), so one
  field can cite several sources.
- `places` has two spatial indexes. The geography index serves distance
  queries in meters. The geometry expression index serves rectangular viewports.
- A published place must have a significance score and an exterior visit duration.
- Provenance is rejected for curated fields by a database constraint.

## Phases

1. Project foundation (done)
2. Schema and curated seed data (done)
3. Map and place details (done)
4. Filters
5. Routing and places near a route
6. Time-budget planner
7. Hardening and deployment
8. Post-MVP: opening hours, then conversational planner
