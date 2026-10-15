import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.main import app
from app.schemas.game import GuessRequest


def test_cors_allows_only_configured_origins() -> None:
    assert "*" not in settings.CORS_ORIGINS
    cors = next(m for m in app.user_middleware if m.cls.__name__ == "CORSMiddleware")
    assert cors.kwargs["allow_origins"] == settings.CORS_ORIGINS


def test_guess_request_leaves_length_rules_to_the_service() -> None:
    assert GuessRequest(guess="abcd").guess == "abcd"
    assert GuessRequest(guess="abcdefghi").guess == "abcdefghi"


def test_guess_request_bounds_payload_size() -> None:
    with pytest.raises(ValidationError):
        GuessRequest(guess="a" * 65)
