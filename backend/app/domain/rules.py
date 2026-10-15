from app.domain.game import GuessResult, LetterResult


def is_playable_word(word: str) -> bool:
    return word.isascii() and word.isalpha()


def evaluate_guess(guess: str, target_word: str) -> GuessResult:
    """Mark each letter correct, present, or absent.

    Correct matches are consumed first so extra copies of a letter are not
    marked present when the target does not contain that many.
    """
    guess_letters = list(guess.lower())
    target_letters = list(target_word.lower())
    evaluation: list[LetterResult] = ["absent"] * len(guess_letters)
    remaining: dict[str, int] = {}

    for index, (guess_letter, target_letter) in enumerate(
        zip(guess_letters, target_letters)
    ):
        if guess_letter == target_letter:
            evaluation[index] = "correct"
        else:
            remaining[target_letter] = remaining.get(target_letter, 0) + 1

    for index, guess_letter in enumerate(guess_letters):
        if evaluation[index] == "correct":
            continue
        if remaining.get(guess_letter, 0) > 0:
            evaluation[index] = "present"
            remaining[guess_letter] -= 1

    return GuessResult(word=guess, evaluation=tuple(evaluation))
