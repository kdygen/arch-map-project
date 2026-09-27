"""Liveness and readiness endpoints."""

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.core.db import check_database, get_engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["healthy"]


class ReadinessResponse(BaseModel):
    status: Literal["ready"]
    database: Literal["ok"]


@router.get("")
def health() -> HealthResponse:
    """Liveness: the process is up. Does not touch the database."""
    return HealthResponse(status="healthy")


@router.get("/ready")
def ready(engine: Annotated[Engine, Depends(get_engine)]) -> ReadinessResponse:
    """Readiness: the API can reach its database."""
    try:
        check_database(engine)
    except SQLAlchemyError as exc:
        logger.warning("Database readiness check failed: %s", exc.__class__.__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable",
        ) from exc
    return ReadinessResponse(status="ready", database="ok")
