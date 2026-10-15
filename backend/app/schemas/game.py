from typing import List, Literal, Optional
from pydantic import BaseModel, Field
from app.domain.game import GameState, GameStatus


class CreateGameRequest(BaseModel):
    # Bounds are enforced by GameService, the single place that validates them.
    word_length: int = Field(default=5, description="Target word length")

class GuessRequest(BaseModel):
    # Length and character rules are enforced by GameService so every invalid
    # guess returns the same 400 error shape. max_length only bounds payload size.
    guess: str = Field(..., max_length=64)

class GuessEvaluation(BaseModel):
    word: str
    evaluation: List[Literal["correct", "present", "absent"]]

class GameStateResponse(BaseModel):
    game_id: str
    word_length: int
    max_turns: int
    remaining_turns: int
    status: GameStatus
    guesses: List[GuessEvaluation]
    target_word: Optional[str] = None

    @classmethod
    def from_domain(cls, game: GameState) -> "GameStateResponse":
        """Build the API response; the target is revealed only once finished."""
        return cls(
            game_id=game.game_id,
            word_length=game.word_length,
            max_turns=game.max_turns,
            remaining_turns=game.remaining_turns,
            status=game.status,
            guesses=[
                GuessEvaluation(word=g.word, evaluation=list(g.evaluation))
                for g in game.guesses
            ],
            target_word=game.target_word if game.is_finished else None,
        )
