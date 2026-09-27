"""FastAPI application entry point."""

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.health.router import router as health_router


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
    app.include_router(api_v1)

    return app


app = create_app()
