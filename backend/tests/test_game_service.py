import asyncio
import copy
from unittest.mock import MagicMock

import pytest

from app.core.exceptions import (
    GameAlreadyFinishedException,
    GameNotFoundException,
    InvalidGuessException,
    InvalidWordLengthException,
    NoTargetWordsException,
    WordNotInDictionaryException,
)
from app.domain.game_store import GameStore
from app.domain.game import GameState, GameStatus, GuessResult
from app.services.dictionary_service import DictionaryService
from app.services.game_service import GameService


class InMemoryGameStore(GameStore):
    """In-memory stand-in for PostgresGameStore."""

    def __init__(self) -> None:
        self.games: dict[str, GameState] = {}
        self.commits = 0
        self.rollbacks = 0
        self.locked_loads = 0

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1

    async def create(self, game: GameState) -> None:
        self.games[game.game_id] = copy.deepcopy(game)

    async def update(self, game: GameState) -> None:
        if game.game_id not in self.games:
            raise GameNotFoundException
        self.games[game.game_id] = copy.deepcopy(game)

    async def load(self, game_id: str, *, lock: bool = False) -> GameState | None:
        game = self.games.get(game_id)
        if game is None:
            return None
        if lock:
            self.locked_loads += 1
        return copy.deepcopy(game)


@pytest.fixture
def dictionary() -> MagicMock:
    mock = MagicMock(spec=DictionaryService)
    mock.target_words_of_length.return_value = {"crane"}
    return mock


@pytest.fixture
def store() -> InMemoryGameStore:
    return InMemoryGameStore()


@pytest.fixture
def service(store: InMemoryGameStore, dictionary: MagicMock) -> GameService:
    return GameService(store, dictionary, min_word_length=5, max_word_length=8)


def in_progress_game(target_word: str, game_id: str = "abc") -> GameState:
    return GameState.new(game_id=game_id, target_word=target_word)


@pytest.mark.asyncio
async def test_create_game_success(
    service: GameService,
    dictionary: MagicMock,
    store: InMemoryGameStore,
) -> None:
    game = await service.create_game(5)

    assert isinstance(game, GameState)
    assert game.status is GameStatus.IN_PROGRESS
    assert game.word_length == 5
    assert game.max_turns == 6
    assert game.remaining_turns == 6
    assert game.guesses == []

    dictionary.target_words_of_length.assert_called_once_with(5)
    stored = store.games[game.game_id]
    assert stored.target_word == "crane"
    assert stored.max_turns == 6
    assert stored.remaining_turns == 6
    assert stored.status is GameStatus.IN_PROGRESS
    assert stored.guesses == []


@pytest.mark.asyncio
@pytest.mark.parametrize("word_length", [4, 9])
async def test_create_game_rejects_word_length_out_of_bounds(
    service: GameService,
    dictionary: MagicMock,
    store: InMemoryGameStore,
    word_length: int,
) -> None:
    with pytest.raises(InvalidWordLengthException) as exc_info:
        await service.create_game(word_length)

    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "invalid_word_length"
    assert exc_info.value.message == "Word length must be between 5 and 8."
    assert store.games == {}
    dictionary.target_words_of_length.assert_not_called()


@pytest.mark.asyncio
async def test_create_game_rejects_when_no_target_words(
    service: GameService,
    dictionary: MagicMock,
    store: InMemoryGameStore,
) -> None:
    dictionary.target_words_of_length.return_value = set()

    with pytest.raises(NoTargetWordsException) as exc_info:
        await service.create_game(5)

    assert exc_info.value.status_code == 500
    assert exc_info.value.code == "no_target_words"
    assert "5" in exc_info.value.message
    assert store.games == {}


@pytest.mark.asyncio
async def test_get_game_raises_when_game_does_not_exist(
    service: GameService,
) -> None:
    with pytest.raises(GameNotFoundException) as exc_info:
        await service.get_game("missing-id")

    assert exc_info.value.code == "game_not_found"


@pytest.mark.asyncio
async def test_get_game_returns_stored_state(
    service: GameService,
    store: InMemoryGameStore,
) -> None:
    stored = in_progress_game("crane")
    stored.remaining_turns = 4
    stored.guesses = [
        GuessResult(
            word="plane",
            evaluation=("absent", "present", "absent", "correct", "absent"),
        )
    ]
    store.games["abc"] = stored

    assert await service.get_game("abc") == stored


@pytest.mark.asyncio
async def test_submit_guess_raises_when_game_does_not_exist(
    service: GameService,
    store: InMemoryGameStore,
) -> None:
    with pytest.raises(GameNotFoundException) as exc_info:
        await service.submit_guess("missing-id", "crane")

    assert exc_info.value.status_code == 404
    assert exc_info.value.code == "game_not_found"
    assert store.games == {}


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [GameStatus.WON, GameStatus.LOST])
async def test_submit_guess_rejects_finished_game(
    service: GameService,
    dictionary: MagicMock,
    store: InMemoryGameStore,
    status: GameStatus,
) -> None:
    finished = in_progress_game("crane")
    finished.status = status
    store.games["abc"] = finished
    dictionary.is_valid_word.return_value = True

    with pytest.raises(GameAlreadyFinishedException):
        await service.submit_guess("abc", "plane")

    assert store.games["abc"].guesses == []


@pytest.mark.asyncio
async def test_submit_guess_rejects_word_not_in_dictionary(
    service: GameService,
    dictionary: MagicMock,
    store: InMemoryGameStore,
) -> None:
    store.games["abc"] = in_progress_game("crane")
    dictionary.is_valid_word.return_value = False

    with pytest.raises(WordNotInDictionaryException) as exc_info:
        await service.submit_guess("abc", "zzzzz")

    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "word_not_in_dictionary"
    dictionary.is_valid_word.assert_called_once_with("zzzzz")
    assert store.games["abc"].guesses == []
    assert store.games["abc"].remaining_turns == 6


@pytest.mark.asyncio
@pytest.mark.parametrize("guess", ["", "cran", "cranes", "  cran  "])
async def test_submit_guess_rejects_wrong_length(
    service: GameService,
    dictionary: MagicMock,
    store: InMemoryGameStore,
    guess: str,
) -> None:
    store.games["abc"] = in_progress_game("crane")

    with pytest.raises(InvalidWordLengthException) as exc_info:
        await service.submit_guess("abc", guess)

    assert exc_info.value.status_code == 400
    assert exc_info.value.message == "Guess must be 5 letters."
    dictionary.is_valid_word.assert_not_called()
    assert store.games["abc"].guesses == []
    assert store.games["abc"].remaining_turns == 6


@pytest.mark.asyncio
@pytest.mark.parametrize("guess", ["cr4ne", "cr ne", "cr-ne", "cr\u00e9ne"])
async def test_submit_guess_rejects_non_letters(
    service: GameService,
    dictionary: MagicMock,
    store: InMemoryGameStore,
    guess: str,
) -> None:
    store.games["abc"] = in_progress_game("crane")

    with pytest.raises(InvalidGuessException) as exc_info:
        await service.submit_guess("abc", guess)

    assert exc_info.value.code == "invalid_guess"
    dictionary.is_valid_word.assert_not_called()
    assert store.games["abc"].guesses == []
    assert store.games["abc"].remaining_turns == 6


@pytest.mark.asyncio
async def test_submit_guess_normalizes_whitespace_and_case(
    service: GameService,
    dictionary: MagicMock,
    store: InMemoryGameStore,
) -> None:
    store.games["abc"] = in_progress_game("crane")
    dictionary.is_valid_word.return_value = True

    game = await service.submit_guess("abc", "  CRANE ")

    assert game.status is GameStatus.WON
    assert game.guesses == [
        GuessResult(word="crane", evaluation=("correct",) * 5)
    ]
    dictionary.is_valid_word.assert_called_once_with("crane")


# Evaluation marks: correct = green, present = yellow, absent = gray.
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("guess", "evaluation"),
    [
        pytest.param(
            "crane",
            ("correct", "correct", "correct", "correct", "correct"),
            id="green-when-letter-and-position-match",
        ),
        pytest.param(
            "acner",
            ("present", "present", "present", "present", "present"),
            id="yellow-when-letter-matches-but-position-does-not",
        ),
        pytest.param(
            "pudgy",
            ("absent", "absent", "absent", "absent", "absent"),
            id="gray-when-letter-is-not-in-target",
        ),
        pytest.param(
            "track",
            ("absent", "correct", "correct", "present", "absent"),
            id="green-yellow-and-gray-in-one-guess",
        ),
    ],
)
async def test_submit_guess_marks_letters_green_yellow_and_gray(
    service: GameService,
    dictionary: MagicMock,
    store: InMemoryGameStore,
    guess: str,
    evaluation: tuple[str, ...],
) -> None:
    store.games["abc"] = in_progress_game("crane")
    dictionary.is_valid_word.return_value = True

    game = await service.submit_guess("abc", guess)

    assert game.guesses == [GuessResult(word=guess, evaluation=evaluation)]
    assert store.games["abc"].guesses == game.guesses
    dictionary.is_valid_word.assert_called_once_with(guess)


@pytest.mark.asyncio
async def test_submit_guess_keeps_game_in_progress(
    service: GameService,
    dictionary: MagicMock,
    store: InMemoryGameStore,
) -> None:
    store.games["abc"] = in_progress_game("crane")
    dictionary.is_valid_word.return_value = True

    game = await service.submit_guess("abc", "plane")

    assert game.status is GameStatus.IN_PROGRESS
    assert game.remaining_turns == 5


@pytest.mark.asyncio
async def test_submit_guess_wins_on_exact_match(
    service: GameService,
    dictionary: MagicMock,
    store: InMemoryGameStore,
) -> None:
    store.games["abc"] = in_progress_game("crane")
    dictionary.is_valid_word.return_value = True

    game = await service.submit_guess("abc", "crane")

    assert game.status is GameStatus.WON
    assert game.remaining_turns == 5
    assert store.games["abc"].status is GameStatus.WON


@pytest.mark.asyncio
async def test_submit_guess_loses_on_last_turn(
    service: GameService,
    dictionary: MagicMock,
    store: InMemoryGameStore,
) -> None:
    stored = in_progress_game("crane")
    stored.remaining_turns = 1
    store.games["abc"] = stored
    dictionary.is_valid_word.return_value = True

    game = await service.submit_guess("abc", "pudgy")

    assert game.status is GameStatus.LOST
    assert game.remaining_turns == 0
    assert store.games["abc"].status is GameStatus.LOST


@pytest.mark.asyncio
async def test_submit_guess_marks_duplicate_letters_by_remaining_count(
    service: GameService,
    dictionary: MagicMock,
    store: InMemoryGameStore,
) -> None:
    # target "apple" vs guess "alley":
    # 0 a: correct
    # 1 l: present (apple has one l, not yet matched)
    # 2 l: absent (that l is already consumed)
    # 3 e: present (apple's e is still unmatched)
    # 4 y: absent
    store.games["abc"] = in_progress_game("apple")
    dictionary.is_valid_word.return_value = True

    game = await service.submit_guess("abc", "alley")

    assert game.status is GameStatus.IN_PROGRESS
    assert game.guesses == [
        GuessResult(
            word="alley",
            evaluation=("correct", "present", "absent", "present", "absent"),
        )
    ]


@pytest.mark.asyncio
async def test_writes_commit_once_each(dictionary: MagicMock) -> None:
    store = InMemoryGameStore()
    service = GameService(store, dictionary, min_word_length=5, max_word_length=8)

    await service.create_game(5)
    assert store.commits == 1
    await service.get_game(next(iter(store.games)))
    assert store.commits == 1


@pytest.mark.asyncio
async def test_invalid_guess_never_takes_the_row_lock(dictionary: MagicMock) -> None:
    store = InMemoryGameStore()
    service = GameService(store, dictionary, min_word_length=5, max_word_length=8)
    game = await service.create_game(5)
    dictionary.is_valid_word.return_value = False

    with pytest.raises(WordNotInDictionaryException):
        await service.submit_guess(game.game_id, "zzzzz")
    with pytest.raises(InvalidWordLengthException):
        await service.submit_guess(game.game_id, "abc")

    assert store.locked_loads == 0
    assert store.rollbacks == 0


@pytest.mark.asyncio
async def test_failure_under_lock_rolls_back(dictionary: MagicMock) -> None:
    store = InMemoryGameStore()
    service = GameService(store, dictionary, min_word_length=5, max_word_length=8)
    game = await service.create_game(5)
    dictionary.is_valid_word.return_value = True

    async def boom(_game: GameState) -> None:
        raise RuntimeError("db down")

    store.update = boom  # type: ignore[method-assign]
    with pytest.raises(RuntimeError):
        await service.submit_guess(game.game_id, "plane")

    assert store.locked_loads == 1
    assert store.rollbacks == 1


@pytest.mark.asyncio
async def test_game_finished_between_read_and_lock_is_rejected(
    dictionary: MagicMock,
) -> None:
    store = InMemoryGameStore()
    service = GameService(store, dictionary, min_word_length=5, max_word_length=8)
    game = await service.create_game(5)
    dictionary.is_valid_word.return_value = True
    original_load = store.load

    async def load(game_id: str, *, lock: bool = False):
        loaded = await original_load(game_id, lock=lock)
        if lock:
            loaded.status = GameStatus.WON
        return loaded

    store.load = load  # type: ignore[method-assign]
    with pytest.raises(GameAlreadyFinishedException):
        await service.submit_guess(game.game_id, "plane")
    assert store.rollbacks == 1


@pytest.mark.asyncio
async def test_create_game_rolls_back_when_commit_fails(dictionary: MagicMock) -> None:
    store = InMemoryGameStore()
    service = GameService(store, dictionary, min_word_length=5, max_word_length=8)

    async def boom() -> None:
        raise RuntimeError("commit failed")

    store.commit = boom  # type: ignore[method-assign]
    with pytest.raises(RuntimeError):
        await service.create_game(5)

    assert store.rollbacks == 1


@pytest.mark.asyncio
async def test_cancellation_under_lock_still_rolls_back(dictionary: MagicMock) -> None:
    store = InMemoryGameStore()
    service = GameService(store, dictionary, min_word_length=5, max_word_length=8)
    game = await service.create_game(5)
    dictionary.is_valid_word.return_value = True
    started = asyncio.Event()

    async def slow_update(_game: GameState) -> None:
        started.set()
        await asyncio.sleep(10)

    store.update = slow_update  # type: ignore[method-assign]
    task = asyncio.create_task(service.submit_guess(game.game_id, "plane"))
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert store.rollbacks == 1
