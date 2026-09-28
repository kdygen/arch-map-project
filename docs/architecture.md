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
- `app/routing`: the RoutingProvider boundary, the Google Routes adapter, and the route endpoints

Planned, not yet created:

- `app/planner`: scoring, strategies, solver. Pure Python with no I/O.
- `app/ai`: conversational layer, after the MVP

## Accepted decisions

- Walking was the only V1 mode. Driving was added in Phase 5 through the same `travel_mode` field. Transit is not supported.
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

## Routing

```
Browser
  Maps JavaScript API      map, markers, route line
  Places API (New)         choosing From and To only
      |
      |  coordinates only
      v
FastAPI
  POST /routes                 RoutingProvider -> Google Routes API, server key
                               walking (default) or driving
  POST /routes/nearby-places   PostGIS corridor search, no provider call
      |
      v
Architecture database
```

**Who decides what**

- Google decides routes, distances, and travel times.
- Our database decides architecture facts.
- PostGIS decides which architecture is near a route.
- Google Places only finds points on the map. It is never a source of
  architecture facts and never populates the catalog.

**RoutingProvider boundary.** `app/routing/provider.py` defines one method,
`compute_route(RouteRequest) -> ComputedRoute`. Endpoint handlers depend only
on it. `GoogleRoutesProvider` in `app/routing/google.py` is the only code that
knows Google's URL, headers, field mask, request body, and response shape. It
maps every failure to a `RoutingError` subclass with a stable code. The Phase 6
planner will use the same boundary.

**Route request flow**

1. The user chooses From and To from Places suggestions. Each becomes a
   structured endpoint with coordinates. Typed text alone can never be routed.
2. The user presses Find route. The browser posts the two coordinates and the
   travel mode to `POST /routes`. This is the only action that causes a paid
   Routes request. Changing the travel mode removes the shown route and waits
   for Find route again.
3. The backend asks the provider for one route in that mode, requesting only
   the distance, duration, polyline, and warnings. Walking maps to Google's
   `WALK` and driving to `DRIVE`, without live traffic.
4. The browser draws the polyline and posts it to `POST /routes/nearby-places`
   together with the active search and filters.
5. PostGIS returns the published places near the line, in route order.
6. When a filter changes, only step 4 and 5 repeat.

**Why two endpoints.** The original plan listed both, and keeping them apart is
what makes filter changes free. A single endpoint that routed and searched
together would call Google again on every filter change, or would need the
route cached on the server, which the plan rules out for V1.

**Trusting the client's route line.** The line comes back from the browser. It
only shapes a database query, so a forged line can not change any fact or
reveal drafts. The backend still bounds it: at most 10,000 points, 500 km in
length, valid coordinates, and a corridor of 25 to 1000 m.

**Corridor search.** `app/geo/corridor.py` uses `ST_DWithin` on geography, so
the corridor is in real meters, and it uses the existing GiST index on
`places.location`. The default is 500 m for every travel mode, about a
six-minute walk each way. Mode-specific corridors may come later.

**Corridor distance is not detour time.** A place 150 m from the route in a
straight line can need a much longer trip because of rivers, highways, and
street layout. Phase 5 results mean "architecture near your route". They never
mean "an X-minute detour". The API field names, the code comments, and the UI
wording all say so.

**Route progress order.** `ST_LineLocatePoint` gives each place a value from 0
at the origin to 1 at the destination, for the point of the route nearest to
it. Results are ordered by that value, then by distance from the route, then
by name and id, so the order is always the same for the same input.

**Key separation.** The browser key is public by design and is restricted by
HTTP referrer. The server key is held as a `SecretStr`, sent to Google only in
a request header, and never appears in logs, exceptions, responses, or the
frontend bundle. The frontend never calls the Routes API.

**No storage.** Route results are not written to the database or cached
between requests.

**Deviation from the original plan.** The plan allowed a route to be passed by
Google place ID, which avoids a Places lookup. Phase 5 sends coordinates
instead, because the brief asks for structured coordinates and the map needs
them for the endpoint markers. The lookup requests only the location field.

**What Phase 6 adds.** A time budget, real walking times between stops through
a route matrix on the same provider boundary, visit durations, and the choice
of which places to visit. None of that exists yet.

## Frontend structure

- `components/map`: the only code that imports Google Maps. It takes plain
  places and reports plain bounds.
- `components/place`: preview and details. No map or Google code.
- `components/explorer.tsx`: connects search, filters, map, data, and selection.
- `components/filters`: search box, filter panel, active filter chips.
- `lib/filters`: the single filter state, its reducer, and address sync.
- `hooks`: viewport loading with debounce, and detail loading.
- `lib/api`: the typed API client. Every response is validated with zod.
- `lib/geo`: bounds math and polyline decoding with no Google types.
- `components/route`: endpoint inputs, route summary, places near the route.
- `lib/routing`: endpoint and planner state, and a location search interface with no Google types. The Google implementation is in `components/map/google-autocomplete.tsx`.
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
4. Search and filters (done)
5. Routing and places near a route (done)
6. Time-budget planner
7. Hardening and deployment
8. Post-MVP: opening hours, then conversational planner
