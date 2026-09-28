"""The routing endpoints, with the provider replaced by a fake."""

import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.main import app
from app.routing import dependencies
from app.routing.dependencies import get_routing_provider
from app.routing.errors import (
    NoRouteFound,
    RoutingNotConfigured,
    RoutingQuotaExceeded,
    RoutingRequestRejected,
    RoutingTimeout,
    RoutingUnavailable,
)
from app.routing.types import ComputedRoute, RouteRequest, TravelMode
from tests.polyline_helper import encode

SECRET = "test-secret-key-do-not-leak-123"
BODY = {
    "origin": {"lat": 42.3601, "lng": -71.0942},
    "destination": {"lat": 42.355, "lng": -71.0655},
    "travel_mode": "walking",
}
ROUTE = ComputedRoute(
    encoded_polyline=encode([(42.3601, -71.0942), (42.355, -71.0655)]),
    distance_meters=3120,
    duration_seconds=2534,
    warnings=["Walking directions are in beta."],
)


class FakeProvider:
    def __init__(self, result=ROUTE):
        self.result = result
        self.requests: list[RouteRequest] = []

    def compute_route(self, request: RouteRequest) -> ComputedRoute:
        self.requests.append(request)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


@pytest.fixture
def provider():
    fake = FakeProvider()
    app.dependency_overrides[get_routing_provider] = lambda: fake
    return fake


def post(client, body):
    return client.post("/api/v1/routes", json=body)


class TestComputeRoute:
    def test_returns_the_route(self, client, provider):
        response = post(client, BODY)

        assert response.status_code == 200
        assert response.json() == {
            "route": {
                "polyline": ROUTE.encoded_polyline,
                "distance_meters": 3120,
                "duration_seconds": 2534,
                "travel_mode": "walking",
                "warnings": ["Walking directions are in beta."],
            }
        }

    def test_passes_structured_coordinates_to_the_provider(self, client, provider):
        post(client, BODY)

        (request,) = provider.requests
        assert (request.origin.latitude, request.origin.longitude) == (42.3601, -71.0942)
        assert (request.destination.latitude, request.destination.longitude) == (42.355, -71.0655)
        assert request.travel_mode is TravelMode.WALKING

    def test_travel_mode_defaults_to_walking(self, client, provider):
        body = {k: v for k, v in BODY.items() if k != "travel_mode"}

        assert post(client, body).json()["route"]["travel_mode"] == "walking"

    def test_each_request_calls_the_provider_exactly_once(self, client, provider):
        post(client, BODY)

        assert len(provider.requests) == 1

    @pytest.mark.parametrize("mode", ["walking", "driving"])
    def test_walking_and_driving_are_accepted_and_passed_to_the_provider(
        self, client, provider, mode
    ):
        response = post(client, {**BODY, "travel_mode": mode})

        assert response.status_code == 200
        assert response.json()["route"]["travel_mode"] == mode
        assert [r.travel_mode for r in provider.requests] == [TravelMode(mode)]

    @pytest.mark.parametrize(
        "mode", ["transit", "bicycling", "two_wheeler", "WALKING", "DRIVE", "", None, 1]
    )
    def test_other_modes_are_rejected(self, client, provider, mode):
        response = post(client, {**BODY, "travel_mode": mode})

        assert response.status_code == 422
        assert provider.requests == []

    @pytest.mark.parametrize(
        "origin",
        [
            {"lat": 91, "lng": 0},
            {"lat": -91, "lng": 0},
            {"lat": 0, "lng": 181},
            {"lat": 0, "lng": -181},
            {"lat": "north", "lng": 0},
            {"lat": None, "lng": 0},
            {"lat": 42.36},
            {"lng": -71.09},
            {"lat": 42.36, "lng": -71.09, "name": "MIT"},
            {},
            "MIT",
            "42.36,-71.09",
            None,
        ],
    )
    def test_invalid_coordinates_are_rejected(self, client, provider, origin):
        response = post(client, {**BODY, "origin": origin})

        assert response.status_code == 422
        assert provider.requests == []

    @pytest.mark.parametrize("missing", ["origin", "destination"])
    def test_both_endpoints_are_required(self, client, provider, missing):
        body = {k: v for k, v in BODY.items() if k != missing}

        assert post(client, body).status_code == 422

    def test_unknown_fields_are_rejected(self, client, provider):
        assert post(client, {**BODY, "avoid": "bridges"}).status_code == 422

    def test_identical_endpoints_are_rejected_without_calling_the_provider(self, client, provider):
        response = post(client, {**BODY, "destination": BODY["origin"]})

        assert response.status_code == 422
        assert "must be different" in response.text
        assert provider.requests == []

    # Boston to New York is about 306 km in a straight line, Worcester about 60 km.
    NEW_YORK = {"lat": 40.7128, "lng": -74.006}
    WORCESTER = {"lat": 42.2626, "lng": -71.8023}
    PROVIDENCE = {"lat": 41.824, "lng": -71.4128}

    @pytest.mark.parametrize(
        ("mode", "destination"),
        [("walking", WORCESTER), ("walking", NEW_YORK), ("driving", NEW_YORK)],
    )
    def test_endpoints_too_far_apart_are_rejected_without_calling_the_provider(
        self, client, provider, mode, destination
    ):
        response = post(client, {**BODY, "travel_mode": mode, "destination": destination})

        assert response.status_code == 422
        assert f"too far apart for a {mode} route" in response.text
        assert provider.requests == []

    @pytest.mark.parametrize("destination", [WORCESTER, PROVIDENCE])
    def test_driving_allows_longer_routes_than_walking(self, client, provider, destination):
        response = post(client, {**BODY, "travel_mode": "driving", "destination": destination})

        assert response.status_code == 200
        assert len(provider.requests) == 1


class TestProviderErrors:
    @pytest.mark.parametrize(
        ("error", "status", "code"),
        [
            (RoutingNotConfigured(), 503, "routing_not_configured"),
            (RoutingRequestRejected(), 422, "route_request_rejected"),
            (NoRouteFound(), 422, "no_route"),
            (RoutingQuotaExceeded(), 503, "routing_quota_exceeded"),
            (RoutingTimeout(), 504, "routing_timeout"),
            (RoutingUnavailable(), 502, "routing_unavailable"),
        ],
    )
    def test_errors_become_controlled_responses(self, client, error, status, code):
        app.dependency_overrides[get_routing_provider] = lambda: FakeProvider(error)

        response = post(client, BODY)

        assert response.status_code == status
        assert response.json() == {"detail": error.message, "code": code}

    def test_no_route_explains_itself(self, client):
        app.dependency_overrides[get_routing_provider] = lambda: FakeProvider(NoRouteFound())

        assert post(client, BODY).json()["detail"] == (
            "No route was found between these places for this travel mode."
        )


class TestMissingServerKey:
    @pytest.fixture
    def without_key(self, monkeypatch):
        settings = Settings(_env_file=None, google_maps_server_key=None)
        monkeypatch.setattr(dependencies, "get_settings", lambda: settings)
        dependencies._google_provider.cache_clear()
        app.dependency_overrides.pop(get_routing_provider, None)
        yield
        dependencies._google_provider.cache_clear()

    def test_route_request_gets_a_controlled_error(self, client, without_key):
        response = post(client, BODY)

        assert response.status_code == 503
        assert response.json() == {
            "detail": "Routing is not configured on this server.",
            "code": "routing_not_configured",
        }

    def test_the_rest_of_the_api_keeps_working(self, client, without_key):
        assert client.get("/api/v1/health").status_code == 200

    @pytest.mark.integration
    def test_catalog_and_corridor_search_keep_working(self, seeded_client, without_key):
        line = encode([(42.36, -71.10), (42.36, -71.05)])

        assert seeded_client.get("/api/v1/places").status_code == 200
        assert (
            seeded_client.post("/api/v1/routes/nearby-places", json={"polyline": line}).status_code
            == 200
        )

    @pytest.mark.parametrize("value", ["", "   ", None])
    def test_a_blank_key_counts_as_missing(self, value):
        assert Settings(_env_file=None, google_maps_server_key=value).google_maps_server_key is None


class TestServerKeyStaysSecret:
    def test_settings_never_show_the_key(self):
        settings = Settings(_env_file=None, google_maps_server_key=SECRET)

        assert SECRET not in repr(settings)
        assert SECRET not in str(settings)
        assert SECRET not in settings.model_dump_json()
        assert settings.google_maps_server_key.get_secret_value() == SECRET

    def test_key_is_absent_from_every_routing_response(self, client, monkeypatch):
        settings = Settings(_env_file=None, google_maps_server_key=SecretStr(SECRET))
        monkeypatch.setattr(dependencies, "get_settings", lambda: settings)
        responses = []
        for result in (ROUTE, NoRouteFound(), RoutingNotConfigured(), RoutingUnavailable()):
            app.dependency_overrides[get_routing_provider] = lambda result=result: FakeProvider(
                result
            )
            responses.append(post(client, BODY))
        responses.append(post(client, {**BODY, "travel_mode": "driving"}))

        for response in responses:
            assert SECRET not in response.text
            assert SECRET not in str(response.headers)

    def test_openapi_schema_does_not_mention_the_key(self, client):
        schema = client.get("/openapi.json").text

        assert "GOOGLE_MAPS_SERVER_KEY" not in schema.upper().replace("-", "_")


def test_the_safety_guard_blocks_the_real_provider(client):
    """Without an explicit fake, a test can never reach Google."""
    with pytest.raises(AssertionError, match="never call the real routing provider"):
        post(client, BODY)
