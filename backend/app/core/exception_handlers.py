# app/core/exception_handlers.py

import logging

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.core.exceptions import WordleException

logger = logging.getLogger(__name__)

LOCK_NOT_AVAILABLE = "55P03"
QUERY_CANCELED = "57014"


def _error_response(
    status_code: int, error_code: str, detail: str, **extra: object
) -> JSONResponse:
    """Every error response shares this shape."""
    return JSONResponse(
        status_code=status_code,
        content={
            "detail": detail,
            "error_code": error_code,
            "status_code": status_code,
            **extra,
        },
    )


def _sqlstate(exc: SQLAlchemyError) -> str | None:
    orig = getattr(exc, "orig", None)
    for candidate in (orig, getattr(orig, "__cause__", None)):
        code = getattr(candidate, "sqlstate", None) or getattr(candidate, "pgcode", None)
        if code:
            return code
    return None


async def wordle_domain_exception_handler(request: Request, exc: WordleException) -> JSONResponse:
    """Handles game-rule errors using the status and code on the exception."""
    return _error_response(exc.status_code, exc.code, exc.message)


async def request_validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Reports malformed requests in the standard error shape (HTTP 422)."""
    return _error_response(
        422,
        "request_validation_error",
        "Request validation failed.",
        errors=jsonable_encoder(exc.errors()),
    )


async def storage_infrastructure_exception_handler(
    request: Request, exc: SQLAlchemyError
) -> JSONResponse:
    """Maps lock timeouts to 409; statement timeouts and other storage failures to 503."""
    sqlstate = _sqlstate(exc)
    if sqlstate == LOCK_NOT_AVAILABLE:
        logger.warning("Database lock timeout (%s)", sqlstate)
        return _error_response(
            status.HTTP_409_CONFLICT,
            "game_busy",
            "The game is busy with another request. Please retry.",
        )

    if sqlstate == QUERY_CANCELED:
        logger.error("Database statement timeout (%s)", sqlstate)
    else:
        logger.error("Storage error: %s", exc, exc_info=exc)
    return _error_response(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "storage_unavailable",
        "Storage service is temporarily unavailable. Please try again shortly.",
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Registers all custom exception handlers to the FastAPI application instance."""
    app.add_exception_handler(WordleException, wordle_domain_exception_handler)
    app.add_exception_handler(RequestValidationError, request_validation_exception_handler)
    app.add_exception_handler(SQLAlchemyError, storage_infrastructure_exception_handler)
