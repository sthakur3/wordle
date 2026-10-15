import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import GameNotFoundException
from app.domain.game import GameState, GameStatus, GuessResult
from app.domain.game_store import GameNotLockedError, GameStore
from app.models.game import Game


def _guesses_to_json(guesses: list[GuessResult]) -> list[dict]:
    return [
        {"word": guess.word, "evaluation": list(guess.evaluation)}
        for guess in guesses
    ]


def _to_domain(row: Game) -> GameState:
    return GameState(
        game_id=str(row.id),
        word_length=row.word_length,
        target_word=row.target_word,
        max_turns=row.max_turns,
        remaining_turns=row.remaining_turns,
        status=GameStatus(row.status),
        guesses=[
            GuessResult(word=item["word"], evaluation=tuple(item["evaluation"]))
            for item in (row.guesses or [])
        ],
    )


class PostgresGameStore(GameStore):
    """Stores each game as one row in Postgres."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._locked: set[uuid.UUID] = set()

    async def create(self, game: GameState) -> None:
        self.session.add(
            Game(
                id=uuid.UUID(game.game_id),
                word_length=game.word_length,
                target_word=game.target_word,
                max_turns=game.max_turns,
                remaining_turns=game.remaining_turns,
                status=game.status.value,
                guesses=_guesses_to_json(game.guesses),
            )
        )
        await self.session.flush()

    async def commit(self) -> None:
        await self.session.commit()
        self._locked.clear()

    async def rollback(self) -> None:
        await self.session.rollback()
        self._locked.clear()

    async def update(self, game: GameState) -> None:
        game_uuid = uuid.UUID(game.game_id)
        if game_uuid not in self._locked:
            raise GameNotLockedError(f"Game {game.game_id} was not loaded with lock=True")
        # Reuses the row already locked by load(lock=True); no second query.
        row = await self.session.get(Game, game_uuid)
        if row is None:
            raise GameNotFoundException

        row.remaining_turns = game.remaining_turns
        row.status = game.status.value
        row.guesses = _guesses_to_json(game.guesses)
        await self.session.flush()

    async def load(self, game_id: str, *, lock: bool = False) -> GameState | None:
        try:
            parsed_id = uuid.UUID(game_id)
        except ValueError:
            return None

        if lock:
            row = await self.session.get(
                Game, parsed_id, with_for_update=True, populate_existing=True
            )
            if row is not None:
                self._locked.add(parsed_id)
        else:
            row = await self.session.get(Game, parsed_id)
        if row is None:
            return None

        return _to_domain(row)
