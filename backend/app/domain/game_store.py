from abc import ABC, abstractmethod

from app.domain.game import GameState


class GameNotLockedError(RuntimeError):
    """Raised when update is called without a prior load(lock=True)."""


class GameStore(ABC):
    """Persistence port for a game.

    create inserts a new game. load returns None when the id does not exist;
    load(lock=True) takes a row lock held until commit or rollback. update
    changes the mutable fields of a game and must follow load(lock=True) in the
    same transaction, otherwise it raises GameNotLockedError. commit and
    rollback end the unit of work and release locks.
    """

    @abstractmethod
    async def create(self, game: GameState) -> None: ...

    @abstractmethod
    async def update(self, game: GameState) -> None: ...

    @abstractmethod
    async def load(self, game_id: str, *, lock: bool = False) -> GameState | None: ...

    @abstractmethod
    async def commit(self) -> None: ...

    @abstractmethod
    async def rollback(self) -> None: ...
