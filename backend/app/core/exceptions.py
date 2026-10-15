class WordleException(Exception):
    """Base error for game rules. API handlers turn this into a response."""

    code: str = "wordle_error"
    status_code: int = 500
    default_message: str = "Something went wrong. Please try again."

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)


class GameNotFoundException(WordleException):
    code = "game_not_found"
    status_code = 404
    default_message = "Game not found."


class GameAlreadyFinishedException(WordleException):
    code = "game_already_finished"
    status_code = 409
    default_message = "This game is already finished."


class InvalidWordLengthException(WordleException):
    code = "invalid_word_length"
    status_code = 400
    default_message = "Invalid word length."


class InvalidGuessException(WordleException):
    code = "invalid_guess"
    status_code = 400
    default_message = "Guess must contain only letters A-Z."


class NoTargetWordsException(WordleException):
    code = "no_target_words"
    status_code = 500
    default_message = "No target words are available for this word length."


class WordNotInDictionaryException(WordleException):
    code = "word_not_in_dictionary"
    status_code = 400
    default_message = "Not in word dictionary."
