from fastapi import APIRouter, Depends, status
from app.api.dependencies import get_game_service
from app.schemas.game import CreateGameRequest, GameStateResponse, GuessRequest
from app.services.game_service import GameService

router = APIRouter(prefix="/games", tags=["Games"])

@router.post("", response_model=GameStateResponse, status_code=status.HTTP_201_CREATED)
async def create_game(
    payload: CreateGameRequest,
    game_service: GameService = Depends(get_game_service),
):
    game = await game_service.create_game(word_length=payload.word_length)
    return GameStateResponse.from_domain(game)


@router.get("/{game_id}", response_model=GameStateResponse)
async def get_game(
    game_id: str,
    game_service: GameService = Depends(get_game_service),
):
    game = await game_service.get_game(game_id)
    return GameStateResponse.from_domain(game)


@router.post("/{game_id}/guess", response_model=GameStateResponse)
async def submit_guess(
    game_id: str,
    payload: GuessRequest,
    game_service: GameService = Depends(get_game_service),
):
    # Pass guess through validation check
    game = await game_service.submit_guess(game_id=game_id, guess=payload.guess)
    return GameStateResponse.from_domain(game)
