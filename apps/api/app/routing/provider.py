"""The boundary between our app and any routing service.

Endpoint handlers and, in Phase 6, the planner depend only on this protocol.
A different provider, or a fake one in tests, can be swapped in without
touching them.
"""

from typing import Protocol

from app.routing.types import ComputedRoute, RouteRequest


class RoutingProvider(Protocol):
    def compute_route(self, request: RouteRequest) -> ComputedRoute:
        """Return one route, or raise a RoutingError subclass."""
        ...
