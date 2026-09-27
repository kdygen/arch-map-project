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

Planned, not yet created:

- `app/catalog`: places, architects, styles, tags, filters
- `app/geo`: PostGIS queries such as viewport and route corridor search
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

## Phases

1. Project foundation (this phase)
2. Schema and curated seed data
3. Map and place details
4. Filters
5. Routing and places near a route
6. Time-budget planner
7. Hardening and deployment
8. Post-MVP: opening hours, then conversational planner
