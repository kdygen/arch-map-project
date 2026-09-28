"""FastAPI application entry point."""

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.catalog.router import router as catalog_router
from app.core.config import get_settings
from app.health.router import router as health_router
from app.routing.errors import RoutingError
from app.routing.router import router as routing_router


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(title="Architecture Map API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(health_router)
    api_v1.include_router(catalog_router)
    api_v1.include_router(routing_router)
    app.include_router(api_v1)

    @app.exception_handler(RoutingError)
    def routing_error(request: Request, exc: RoutingError) -> JSONResponse:
        # A stable code and a safe message. Provider details never reach the client.
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.message, "code": exc.code}
        )

    return app


app = create_app()
