"""Controlled routing errors.

Each error has a stable code for the frontend and a safe message. Provider
response bodies, request headers, and keys are never included.
"""

from typing import ClassVar


class RoutingError(Exception):
    code: ClassVar[str] = "routing_error"
    status_code: ClassVar[int] = 502
    default_message: ClassVar[str] = "The route could not be calculated."

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)


class RoutingNotConfigured(RoutingError):
    code = "routing_not_configured"
    status_code = 503
    default_message = "Routing is not configured on this server."


class RoutingRequestRejected(RoutingError):
    code = "route_request_rejected"
    status_code = 422
    default_message = "The route request was not accepted."


class NoRouteFound(RoutingError):
    code = "no_route"
    status_code = 422
    default_message = "No route was found between these places for this travel mode."


class RoutingQuotaExceeded(RoutingError):
    code = "routing_quota_exceeded"
    status_code = 503
    default_message = "The route service is busy. Try again in a moment."


class RoutingTimeout(RoutingError):
    code = "routing_timeout"
    status_code = 504
    default_message = "The route service took too long to answer."


class RoutingUnavailable(RoutingError):
    code = "routing_unavailable"
    status_code = 502
    default_message = "The route service is unavailable. Try again later."
