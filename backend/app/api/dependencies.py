from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.database import get_session
from app.core.config import settings
from app.domain.game_store import GameStore
from app.repositories.game_store import PostgresGameStore
from app.services.dictionary_service import DictionaryService
from app.services.game_service import GameService

def get_game_store(
    session: AsyncSession = Depends(get_session),
) -> GameStore:
    return PostgresGameStore(session)


def get_dictionary_service(request: Request) -> DictionaryService:
    return request.app.state.dictionary


def get_game_service(
    store: GameStore = Depends(get_game_store),
    dictionary: DictionaryService = Depends(get_dictionary_service),
) -> GameService:
    return GameService(
        store,
        dictionary,
        min_word_length=settings.MIN_WORD_LENGTH,
        max_word_length=settings.MAX_WORD_LENGTH,
    )
