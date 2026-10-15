import pytest

from app.services.game_rules import evaluate_guess


@pytest.mark.parametrize(
    ("guess", "target_word", "evaluation"),
    [
        pytest.param(
            "crane",
            "crane",
            ["correct", "correct", "correct", "correct", "correct"],
            id="green-when-letter-and-position-match",
        ),
        pytest.param(
            "acner",
            "crane",
            ["present", "present", "present", "present", "present"],
            id="yellow-when-letter-matches-but-position-does-not",
        ),
        pytest.param(
            "pudgy",
            "crane",
            ["absent", "absent", "absent", "absent", "absent"],
            id="gray-when-letter-is-not-in-target",
        ),
        pytest.param(
            "track",
            "crane",
            ["absent", "correct", "correct", "present", "absent"],
            id="green-yellow-and-gray-in-one-guess",
        ),
        pytest.param(
            "alley",
            "apple",
            ["correct", "present", "absent", "present", "absent"],
            id="duplicate-letters-use-remaining-count",
        ),
    ],
)
def test_evaluate_guess(guess: str, target_word: str, evaluation: list[str]) -> None:
    assert evaluate_guess(guess, target_word) == evaluation
