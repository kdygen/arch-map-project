"""Google Routes API adapter. All Google-specific details live here."""

import logging
import re

import httpx2
from pydantic import SecretStr

from app.routing.errors import (
    NoRouteFound,
    RoutingError,
    RoutingNotConfigured,
    RoutingQuotaExceeded,
    RoutingRequestRejected,
    RoutingTimeout,
    RoutingUnavailable,
)
from app.routing.types import ComputedRoute, RouteRequest, TravelMode

logger = logging.getLogger(__name__)

COMPUTE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"

# Only the fields we use. Google bills by the fields requested.
FIELD_MASK = ",".join(
    [
        "routes.distanceMeters",
        "routes.duration",
        "routes.polyline.encodedPolyline",
        "routes.warnings",
    ]
)

_TRAVEL_MODES = {TravelMode.WALKING: "WALK", TravelMode.DRIVING: "DRIVE"}
_DURATION = re.compile(r"^(\d+(?:\.\d+)?)s$")


def _lat_lng(point) -> dict:
    return {"location": {"latLng": {"latitude": point.latitude, "longitude": point.longitude}}}


def build_request_body(request: RouteRequest) -> dict:
    # routingPreference is left out on purpose. Google rejects it for WALK, and
    # for DRIVE leaving it out means TRAFFIC_UNAWARE, the cheapest option.
    return {
        "origin": _lat_lng(request.origin),
        "destination": _lat_lng(request.destination),
        "travelMode": _TRAVEL_MODES[request.travel_mode],
        "polylineEncoding": "ENCODED_POLYLINE",
        "computeAlternativeRoutes": False,
        "languageCode": "en-US",
        "units": "METRIC",
    }


def parse_duration(value: object) -> int:
    """Google returns durations as strings such as "3421s"."""
    if not isinstance(value, str) or not (match := _DURATION.match(value)):
        raise RoutingUnavailable("The route service sent an unexpected response.")
    return round(float(match.group(1)))


def parse_response(body: object) -> ComputedRoute:
    if not isinstance(body, dict):
        raise RoutingUnavailable("The route service sent an unexpected response.")
    routes = body.get("routes") or []
    if not routes:
        # Google documents an empty routes list as "no route could be found".
        raise NoRouteFound()
    route = routes[0]
    if not isinstance(route, dict):
        raise RoutingUnavailable("The route service sent an unexpected response.")

    polyline = (route.get("polyline") or {}).get("encodedPolyline")
    if not isinstance(polyline, str) or not polyline:
        raise RoutingUnavailable("The route service sent an unexpected response.")

    # Google omits zero-valued fields.
    distance = route.get("distanceMeters", 0)
    if not isinstance(distance, int) or distance < 0:
        raise RoutingUnavailable("The route service sent an unexpected response.")

    warnings = route.get("warnings") or []
    return ComputedRoute(
        encoded_polyline=polyline,
        distance_meters=distance,
        duration_seconds=parse_duration(route.get("duration", "0s")),
        warnings=[w for w in warnings if isinstance(w, str)],
    )


def _error_for_status(status: int) -> RoutingError:
    if status in (401, 403):
        # A wrong, restricted, or disabled key. The client cannot fix this.
        return RoutingNotConfigured("Routing is not configured correctly on this server.")
    if status == 429:
        return RoutingQuotaExceeded()
    if status in (400, 404):
        return RoutingRequestRejected()
    return RoutingUnavailable()


class GoogleRoutesProvider:
    """Computes routes with the Google Routes API, Compute Routes method."""

    def __init__(
        self,
        api_key: SecretStr,
        timeout_seconds: float = 10.0,
        client: httpx2.Client | None = None,
    ) -> None:
        self._api_key = api_key
        self._client = client or httpx2.Client(timeout=httpx2.Timeout(timeout_seconds))

    def __repr__(self) -> str:
        return "GoogleRoutesProvider()"

    def compute_route(self, request: RouteRequest) -> ComputedRoute:
        try:
            response = self._client.post(
                COMPUTE_ROUTES_URL,
                json=build_request_body(request),
                headers={
                    "X-Goog-Api-Key": self._api_key.get_secret_value(),
                    "X-Goog-FieldMask": FIELD_MASK,
                },
            )
        except httpx2.TimeoutException:
            logger.warning("Google Routes request timed out")
            raise RoutingTimeout() from None
        except httpx2.HTTPError as exc:
            # Only the exception type is logged. It never contains the key.
            logger.warning("Google Routes request failed: %s", type(exc).__name__)
            raise RoutingUnavailable() from None

        if response.status_code != 200:
            logger.warning("Google Routes returned HTTP %s", response.status_code)
            raise _error_for_status(response.status_code)

        try:
            body = response.json()
        except ValueError:
            raise RoutingUnavailable("The route service sent an unexpected response.") from None
        return parse_response(body)
