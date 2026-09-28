"""Builds the routing provider from settings. Tests override get_routing_provider."""

from functools import lru_cache

from app.core.config import get_settings
from app.routing.errors import RoutingNotConfigured
from app.routing.google import GoogleRoutesProvider
from app.routing.provider import RoutingProvider


@lru_cache
def _google_provider() -> GoogleRoutesProvider | None:
    settings = get_settings()
    if settings.google_maps_server_key is None:
        return None
    return GoogleRoutesProvider(
        settings.google_maps_server_key, timeout_seconds=settings.routes_timeout_seconds
    )


def get_routing_provider() -> RoutingProvider:
    """The configured provider. A missing key fails the request, never startup."""
    provider = _google_provider()
    if provider is None:
        raise RoutingNotConfigured()
    return provider
