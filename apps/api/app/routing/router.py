"""HTTP endpoints for routing and architecture near a route."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.catalog import schemas as catalog_schemas
from app.catalog import service as catalog_service
from app.core.db import get_session
from app.routing import polyline
from app.routing.dependencies import get_routing_provider
from app.routing.provider import RoutingProvider
from app.routing.schemas import NearbyPlacesBody, RouteOut, RouteRequestBody, RouteResponse
from app.routing.types import RouteRequest

router = APIRouter(prefix="/routes", tags=["routing"])


@router.post("")
def compute_route(
    body: RouteRequestBody,
    provider: Annotated[RoutingProvider, Depends(get_routing_provider)],
) -> RouteResponse:
    """The baseline route between two points for the chosen travel mode.

    Each call is one paid provider request.

    The result is not stored anywhere.
    """
    route = provider.compute_route(
        RouteRequest(
            origin=body.origin.to_point(),
            destination=body.destination.to_point(),
            travel_mode=body.travel_mode,
        )
    )
    return RouteResponse(
        route=RouteOut(
            polyline=route.encoded_polyline,
            distance_meters=route.distance_meters,
            duration_seconds=route.duration_seconds,
            travel_mode=body.travel_mode,
            warnings=route.warnings,
        )
    )


@router.post("/nearby-places")
def nearby_places(
    body: NearbyPlacesBody,
    session: Annotated[Session, Depends(get_session)],
) -> catalog_schemas.RoutePlacesResponse:
    """Published places near a route line, in order along the route.

    Uses only our database. It never calls the routing provider, so changing
    filters or the corridor costs nothing.
    """
    line = polyline.validated_route_line(body.polyline)
    return catalog_service.list_places_near_route(
        session,
        body.filters.to_filters(),
        route_wkt=polyline.to_wkt(line),
        corridor_meters=body.corridor_meters,
        limit=body.limit,
    )
