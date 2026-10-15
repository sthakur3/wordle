import json
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from app.core.exception_handlers import (
    register_exception_handlers,
    request_validation_exception_handler,
    storage_infrastructure_exception_handler,
    wordle_domain_exception_handler,
)
from app.core.exceptions import (
    GameAlreadyFinishedException,
    GameNotFoundException,
    InvalidGuessException,
    InvalidWordLengthException,
    NoTargetWordsException,
    WordNotInDictionaryException,
    WordleException,
)


@pytest.fixture
def request_mock() -> MagicMock:
    return MagicMock(spec=Request)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("exc", "status_code", "error_code", "detail"),
    [
        (
            GameNotFoundException(),
            404,
            "game_not_found",
            "Game not found.",
        ),
        (
            GameAlreadyFinishedException(),
            409,
            "game_already_finished",
            "This game is already finished.",
        ),
        (
            InvalidWordLengthException(),
            400,
            "invalid_word_length",
            "Invalid word length.",
        ),
        (
            InvalidGuessException(),
            400,
            "invalid_guess",
            "Guess must contain only letters A-Z.",
        ),
        (
            NoTargetWordsException(),
            500,
            "no_target_words",
            "No target words are available for this word length.",
        ),
        (
            WordNotInDictionaryException(),
            400,
            "word_not_in_dictionary",
            "Not in word dictionary.",
        ),
        (
            WordleException("custom"),
            500,
            "wordle_error",
            "custom",
        ),
    ],
)
async def test_wordle_domain_exception_handler(
    request_mock: MagicMock,
    exc: WordleException,
    status_code: int,
    error_code: str,
    detail: str,
) -> None:
    response = await wordle_domain_exception_handler(request_mock, exc)

    assert response.status_code == status_code
    assert json.loads(response.body) == {
        "detail": detail,
        "error_code": error_code,
        "status_code": status_code,
    }


@pytest.mark.asyncio
async def test_storage_infrastructure_exception_handler_hides_database_details(
    request_mock: MagicMock,
) -> None:
    connection_string = "postgresql://wordle:secret@db.internal:5432/wordle"
    exc = OperationalError(connection_string, {}, Exception("connection refused"))

    response = await storage_infrastructure_exception_handler(request_mock, exc)

    body = response.body.decode()
    assert response.status_code == 503
    assert json.loads(body) == {
        "detail": "Storage service is temporarily unavailable. Please try again shortly.",
        "error_code": "storage_unavailable",
        "status_code": 503,
    }
    assert connection_string not in body


def _db_error(sqlstate: str) -> OperationalError:
    orig = Exception("db error")
    orig.sqlstate = sqlstate
    return OperationalError("SELECT 1", {}, orig)


@pytest.mark.asyncio
async def test_lock_timeout_maps_to_game_busy(request_mock: MagicMock) -> None:
    response = await storage_infrastructure_exception_handler(
        request_mock, _db_error("55P03")
    )

    assert response.status_code == 409
    assert json.loads(response.body)["error_code"] == "game_busy"


@pytest.mark.asyncio
async def test_statement_timeout_maps_to_storage_unavailable(
    request_mock: MagicMock,
) -> None:
    response = await storage_infrastructure_exception_handler(
        request_mock, _db_error("57014")
    )

    assert response.status_code == 503
    assert json.loads(response.body)["error_code"] == "storage_unavailable"


def test_register_exception_handlers() -> None:
    app = FastAPI()

    register_exception_handlers(app)

    assert app.exception_handlers[WordleException] is wordle_domain_exception_handler
    assert app.exception_handlers[SQLAlchemyError] is storage_infrastructure_exception_handler


@pytest.mark.asyncio
async def test_validation_errors_use_the_standard_shape(request_mock: MagicMock) -> None:
    exc = RequestValidationError(
        [{"loc": ("body", "guess"), "msg": "Field required", "type": "missing"}]
    )

    response = await request_validation_exception_handler(request_mock, exc)

    body = json.loads(response.body)
    assert response.status_code == 422
    assert body["error_code"] == "request_validation_error"
    assert body["status_code"] == 422
    assert body["detail"] == "Request validation failed."
    assert body["errors"][0]["msg"] == "Field required"
