"""The Google Routes adapter, tested against a fake HTTP transport."""

import json
import logging

import httpx2
import pytest
from pydantic import SecretStr

from app.geo.types import Point
from app.routing.errors import (
    NoRouteFound,
    RoutingError,
    RoutingNotConfigured,
    RoutingQuotaExceeded,
    RoutingRequestRejected,
    RoutingTimeout,
    RoutingUnavailable,
)
from app.routing.google import (
    COMPUTE_ROUTES_URL,
    FIELD_MASK,
    GoogleRoutesProvider,
    parse_duration,
    parse_response,
)
from app.routing.types import ComputedRoute, RouteRequest, TravelMode

SECRET = "test-secret-key-do-not-leak-123"
REQUEST = RouteRequest(origin=Point(42.3601, -71.0942), destination=Point(42.355, -71.0655))
DRIVING_REQUEST = RouteRequest(REQUEST.origin, REQUEST.destination, TravelMode.DRIVING)
GOOD_BODY = {
    "routes": [
        {
            "distanceMeters": 3120,
            "duration": "2534s",
            "polyline": {"encodedPolyline": "abc123"},
            "warnings": ["Walking directions are in beta."],
        }
    ]
}


def provider_with(handler) -> GoogleRoutesProvider:
    client = httpx2.Client(transport=httpx2.MockTransport(handler))
    return GoogleRoutesProvider(SecretStr(SECRET), client=client)


def responding(status: int, body: object) -> GoogleRoutesProvider:
    return provider_with(lambda request: httpx2.Response(status, json=body))


class TestRequest:
    def capture(self) -> tuple[GoogleRoutesProvider, list[httpx2.Request]]:
        seen: list[httpx2.Request] = []

        def handler(request: httpx2.Request) -> httpx2.Response:
            seen.append(request)
            return httpx2.Response(200, json=GOOD_BODY)

        return provider_with(handler), seen

    def test_posts_to_compute_routes(self):
        provider, seen = self.capture()

        provider.compute_route(REQUEST)

        assert seen[0].method == "POST"
        assert str(seen[0].url) == COMPUTE_ROUTES_URL

    def test_sends_coordinates_and_walking_mode(self):
        provider, seen = self.capture()

        provider.compute_route(REQUEST)

        body = json.loads(seen[0].content)
        assert body["origin"] == {
            "location": {"latLng": {"latitude": 42.3601, "longitude": -71.0942}}
        }
        assert body["destination"] == {
            "location": {"latLng": {"latitude": 42.355, "longitude": -71.0655}}
        }
        assert body["travelMode"] == "WALK"
        assert body["polylineEncoding"] == "ENCODED_POLYLINE"
        assert body["computeAlternativeRoutes"] is False

    def test_sends_driving_mode(self):
        provider, seen = self.capture()

        provider.compute_route(DRIVING_REQUEST)

        body = json.loads(seen[0].content)
        assert body["travelMode"] == "DRIVE"
        assert body["origin"] == {
            "location": {"latLng": {"latitude": 42.3601, "longitude": -71.0942}}
        }

    @pytest.mark.parametrize("mode", list(TravelMode))
    def test_never_sends_routing_preference(self, mode):
        # Google rejects it for WALK. For DRIVE, leaving it out is the cheapest option.
        provider, seen = self.capture()

        provider.compute_route(RouteRequest(REQUEST.origin, REQUEST.destination, mode))

        assert "routingPreference" not in json.loads(seen[0].content)

    @pytest.mark.parametrize("mode", list(TravelMode))
    def test_uses_the_same_field_mask_for_every_mode(self, mode):
        provider, seen = self.capture()

        provider.compute_route(RouteRequest(REQUEST.origin, REQUEST.destination, mode))

        assert seen[0].headers["X-Goog-FieldMask"] == FIELD_MASK

    def test_requests_only_the_fields_we_use(self):
        provider, seen = self.capture()

        provider.compute_route(REQUEST)

        assert seen[0].headers["X-Goog-FieldMask"] == (
            "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.warnings"
        )

    def test_sends_the_key_in_a_header_and_never_in_the_url_or_body(self):
        provider, seen = self.capture()

        provider.compute_route(REQUEST)

        assert seen[0].headers["X-Goog-Api-Key"] == SECRET
        assert SECRET not in str(seen[0].url)
        assert SECRET not in seen[0].content.decode()


class TestResponseParsing:
    def test_returns_the_route(self):
        assert responding(200, GOOD_BODY).compute_route(REQUEST) == ComputedRoute(
            encoded_polyline="abc123",
            distance_meters=3120,
            duration_seconds=2534,
            warnings=["Walking directions are in beta."],
        )

    def test_uses_the_first_route(self):
        body = {"routes": [GOOD_BODY["routes"][0], {"distanceMeters": 1, "duration": "1s"}]}

        assert parse_response(body).distance_meters == 3120

    def test_missing_warnings_mean_none(self):
        route = {k: v for k, v in GOOD_BODY["routes"][0].items() if k != "warnings"}

        assert parse_response({"routes": [route]}).warnings == []

    def test_omitted_distance_and_duration_mean_zero(self):
        body = {"routes": [{"polyline": {"encodedPolyline": "abc"}}]}

        route = parse_response(body)

        assert (route.distance_meters, route.duration_seconds) == (0, 0)

    @pytest.mark.parametrize(
        ("value", "expected"), [("0s", 0), ("2534s", 2534), ("12.4s", 12), ("12.6s", 13)]
    )
    def test_parses_durations(self, value, expected):
        assert parse_duration(value) == expected

    @pytest.mark.parametrize("value", ["", "2534", "42 minutes", "-5s", None, 2534, "1e9s"])
    def test_rejects_unexpected_durations(self, value):
        with pytest.raises(RoutingUnavailable):
            parse_duration(value)

    @pytest.mark.parametrize("body", [{}, {"routes": []}, {"routes": None}])
    def test_no_routes_means_no_route_found(self, body):
        with pytest.raises(NoRouteFound):
            responding(200, body).compute_route(REQUEST)

    @pytest.mark.parametrize(
        "body",
        [
            [],
            "text",
            {"routes": ["not an object"]},
            {"routes": [{"distanceMeters": 5, "duration": "5s"}]},
            {"routes": [{"polyline": {"encodedPolyline": ""}, "duration": "5s"}]},
            {"routes": [{"polyline": {"encodedPolyline": "abc"}, "distanceMeters": "far"}]},
            {"routes": [{"polyline": {"encodedPolyline": "abc"}, "distanceMeters": -1}]},
            {"routes": [{"polyline": {"encodedPolyline": "abc"}, "duration": "soon"}]},
        ],
    )
    def test_malformed_response_is_a_provider_failure(self, body):
        with pytest.raises(RoutingUnavailable):
            responding(200, body).compute_route(REQUEST)

    def test_body_that_is_not_json_is_a_provider_failure(self):
        provider = provider_with(lambda request: httpx2.Response(200, text="<html>oops</html>"))

        with pytest.raises(RoutingUnavailable):
            provider.compute_route(REQUEST)


class TestFailures:
    @pytest.mark.parametrize(
        ("status", "error"),
        [
            (400, RoutingRequestRejected),
            (404, RoutingRequestRejected),
            (401, RoutingNotConfigured),
            (403, RoutingNotConfigured),
            (429, RoutingQuotaExceeded),
            (500, RoutingUnavailable),
            (503, RoutingUnavailable),
        ],
    )
    def test_http_errors_map_to_controlled_errors(self, status, error):
        body = {"error": {"message": f"API key {SECRET} is invalid", "status": "WHATEVER"}}

        with pytest.raises(error) as raised:
            responding(status, body).compute_route(REQUEST)

        # Nothing from Google's error body reaches our error.
        assert "invalid" not in raised.value.message
        assert SECRET not in str(raised.value)

    def test_timeout(self):
        def handler(request):
            raise httpx2.ReadTimeout("took too long", request=request)

        with pytest.raises(RoutingTimeout):
            provider_with(handler).compute_route(REQUEST)

    def test_connection_failure(self):
        def handler(request):
            raise httpx2.ConnectError("no network", request=request)

        with pytest.raises(RoutingUnavailable):
            provider_with(handler).compute_route(REQUEST)

    def test_uses_an_explicit_timeout(self):
        provider = GoogleRoutesProvider(SecretStr(SECRET), timeout_seconds=7.5)

        assert provider._client.timeout == httpx2.Timeout(7.5)


class TestKeyNeverLeaks:
    FAILURES = [
        lambda request: httpx2.Response(403, json={"error": {"message": "bad key"}}),
        lambda request: httpx2.Response(500, text="boom"),
        lambda request: httpx2.Response(200, json={"routes": []}),
        lambda request: (_ for _ in ()).throw(httpx2.ReadTimeout("slow", request=request)),
        lambda request: (_ for _ in ()).throw(httpx2.ConnectError("down", request=request)),
    ]

    @pytest.mark.parametrize("handler", FAILURES)
    def test_not_in_exceptions_or_their_causes(self, handler):
        with pytest.raises(RoutingError) as raised:
            provider_with(handler).compute_route(REQUEST)

        error: BaseException | None = raised.value
        while error is not None:
            assert SECRET not in str(error)
            assert SECRET not in repr(error)
            assert SECRET not in repr(getattr(error, "request", ""))
            error = error.__cause__
        # The original httpx error, which holds the request headers, is dropped.
        assert raised.value.__cause__ is None
        assert raised.value.__context__ is None or raised.value.__suppress_context__

    @pytest.mark.parametrize("handler", FAILURES)
    def test_not_in_logs(self, handler, caplog):
        caplog.set_level(logging.DEBUG)

        with pytest.raises(RoutingError):
            provider_with(handler).compute_route(REQUEST)

        assert SECRET not in caplog.text

    def test_not_in_the_provider_repr(self):
        provider = GoogleRoutesProvider(SecretStr(SECRET))

        assert SECRET not in repr(provider)
        assert SECRET not in str(provider.__dict__)


def test_every_travel_mode_is_supported_by_the_adapter():
    from app.routing.google import _TRAVEL_MODES

    assert set(_TRAVEL_MODES) == set(TravelMode)
    assert _TRAVEL_MODES == {TravelMode.WALKING: "WALK", TravelMode.DRIVING: "DRIVE"}


def test_driving_route_is_parsed_like_a_walking_route():
    route = responding(200, GOOD_BODY).compute_route(DRIVING_REQUEST)

    assert (route.distance_meters, route.duration_seconds) == (3120, 2534)
