import pytest

from app.domain.game import GameState, GameStatus, GuessResult
from app.schemas.game import GameStateResponse, GuessEvaluation


def make_game(status: GameStatus, guesses: list[GuessResult] | None = None) -> GameState:
    game = GameState.new(game_id="abc", target_word="crane")
    game.status = status
    game.guesses = guesses or []
    return game


def test_from_domain_hides_target_word_while_in_progress() -> None:
    response = GameStateResponse.from_domain(make_game(GameStatus.IN_PROGRESS))

    assert response.status == "IN_PROGRESS"
    assert response.target_word is None


@pytest.mark.parametrize("status", [GameStatus.WON, GameStatus.LOST])
def test_from_domain_reveals_target_word_when_finished(status: GameStatus) -> None:
    response = GameStateResponse.from_domain(make_game(status))

    assert response.status == status
    assert response.target_word == "crane"


def test_from_domain_converts_guesses() -> None:
    game = make_game(
        GameStatus.IN_PROGRESS,
        [GuessResult(word="plane", evaluation=("absent", "present", "absent", "correct", "absent"))],
    )

    response = GameStateResponse.from_domain(game)

    assert response.game_id == "abc"
    assert response.max_turns == 6
    assert response.remaining_turns == 6
    assert response.guesses == [
        GuessEvaluation(
            word="plane",
            evaluation=["absent", "present", "absent", "correct", "absent"],
        )
    ]
