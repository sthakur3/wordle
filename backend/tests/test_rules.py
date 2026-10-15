import pytest

from app.domain.game import GuessResult
from app.domain.rules import evaluate_guess, is_playable_word


@pytest.mark.parametrize(
    ("guess", "target", "evaluation"),
    [
        ("crane", "crane", ("correct",) * 5),
        ("acner", "crane", ("present",) * 5),
        ("pudgy", "crane", ("absent",) * 5),
        ("track", "crane", ("absent", "correct", "correct", "present", "absent")),
        ("alley", "apple", ("correct", "present", "absent", "present", "absent")),
        # A repeated guess letter is only marked as many times as the target has it.
        ("llama", "hello", ("present", "present", "absent", "absent", "absent")),
        # Exact matches are consumed first: only one spare "e" is left for the earlier e.
        ("geese", "sheep", ("absent", "present", "correct", "present", "absent")),
    ],
)
def test_evaluate_guess(guess: str, target: str, evaluation: tuple[str, ...]) -> None:
    assert evaluate_guess(guess, target) == GuessResult(guess, evaluation)


def test_evaluate_guess_ignores_case() -> None:
    assert evaluate_guess("CRANE", "crane").evaluation == ("correct",) * 5


@pytest.mark.parametrize(
    ("word", "expected"),
    [("crane", True), ("cr4ne", False), ("cr ne", False), ("caf\u00e9s", False), ("", False)],
)
def test_is_playable_word(word: str, expected: bool) -> None:
    assert is_playable_word(word) is expected
