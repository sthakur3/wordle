import asyncio
import logging
import random
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from app.core.exceptions import (
    GameAlreadyFinishedException,
    GameNotFoundException,
    InvalidGuessException,
    InvalidWordLengthException,
    NoTargetWordsException,
    WordNotInDictionaryException,
)
from app.domain.game import GameState
from app.domain.game_store import GameStore
from app.domain.rules import evaluate_guess, is_playable_word
from app.services.dictionary_service import DictionaryService

logger = logging.getLogger(__name__)


class GameService:
    """Game engine. Persistence is delegated to GameStore."""

    def __init__(
        self,
        store: GameStore,
        dictionary: DictionaryService,
        *,
        min_word_length: int,
        max_word_length: int,
    ) -> None:
        self.store = store
        self.dictionary = dictionary
        self.min_word_length = min_word_length
        self.max_word_length = max_word_length

    async def create_game(self, word_length: int) -> GameState:
        """Create a game for the given word length and hand it to the store."""
        if not self.min_word_length <= word_length <= self.max_word_length:
            logger.info("Invalid word length: %s", word_length)
            raise InvalidWordLengthException(
                "Word length must be between "
                f"{self.min_word_length} and {self.max_word_length}."
            )

        targets = self.dictionary.target_words_of_length(word_length)
        if not targets:
            logger.error("No target words available for length %s", word_length)
            raise NoTargetWordsException(
                f"No target words available for length {word_length}"
            )

        game = GameState.new(
            game_id=str(uuid.uuid4()),
            target_word=random.choice(tuple(targets)),
        )
        async with self._transaction():
            await self.store.create(game)
        return game

    async def get_game(self, game_id: str) -> GameState:
        """Load a game from the store."""
        return await self._load_game(game_id)

    async def submit_guess(self, game_id: str, guess: str) -> GameState:
        """Score a guess, update game state, and commit.

        Validation runs on an unlocked read so invalid guesses never queue on
        the row lock. The lock is taken only to apply a valid guess, and the
        finished check is repeated under it.
        """
        game = await self._load_game(game_id)
        self._ensure_playable(game)
        guess = self._validate_guess(game, guess)

        async with self._transaction():
            game = await self._load_game(game_id, lock=True)
            self._ensure_playable(game)
            game.apply_guess(evaluate_guess(guess, game.target_word))
            await self.store.update(game)
        return game

    @asynccontextmanager
    async def _transaction(self) -> AsyncIterator[None]:
        """Commit on success; roll back on any failure, including cancellation.

        The rollback is shielded so a client disconnect cannot skip it and
        leave row locks held.
        """
        try:
            yield
            await self.store.commit()
        except BaseException:
            await asyncio.shield(self.store.rollback())
            raise

    @staticmethod
    def _ensure_playable(game: GameState) -> None:
        if game.is_finished:
            raise GameAlreadyFinishedException

    def _validate_guess(self, game: GameState, guess: str) -> str:
        guess = guess.strip().lower()
        if len(guess) != game.word_length:
            logger.info(
                "Guess length %s does not match word length %s",
                len(guess),
                game.word_length,
            )
            raise InvalidWordLengthException(
                f"Guess must be {game.word_length} letters."
            )

        if not is_playable_word(guess):
            logger.info("Guess contains non-letter characters")
            raise InvalidGuessException

        if not self.dictionary.is_valid_word(guess):
            logger.info("Word not in dictionary: %s", guess)
            raise WordNotInDictionaryException
        return guess

    async def _load_game(self, game_id: str, *, lock: bool = False) -> GameState:
        game = await self.store.load(game_id, lock=lock)
        if game is None:
            logger.info("Game not found %s", game_id)
            raise GameNotFoundException
        return game
