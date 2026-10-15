import pytest
from pydantic import ValidationError

from app.schemas.game import GuessRequest


def test_guess_request_accepts_letters() -> None:
    request = GuessRequest(guess="crane")

    assert request.guess == "crane"


@pytest.mark.parametrize("guess", ["crane1", "cr@ne", "crane "])
def test_guess_request_leaves_character_rules_to_the_service(guess: str) -> None:
    # Character rules live in GameService so every invalid guess gets the same
    # 400 error shape; the schema only bounds payload size.
    assert GuessRequest(guess=guess).guess == guess


def test_guess_request_rejects_oversized_payload() -> None:
    with pytest.raises(ValidationError):
        GuessRequest(guess="a" * 65)
