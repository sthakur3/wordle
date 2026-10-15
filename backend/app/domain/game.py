from dataclasses import dataclass, field
from enum import StrEnum
from typing import Literal

LetterResult = Literal["correct", "present", "absent"]


class GameStatus(StrEnum):
    IN_PROGRESS = "IN_PROGRESS"
    WON = "WON"
    LOST = "LOST"


@dataclass(frozen=True)
class GuessResult:
    word: str
    evaluation: tuple[LetterResult, ...]


@dataclass
class GameState:
    """Domain model for one game. Independent of the API and the database."""

    game_id: str
    word_length: int
    target_word: str
    max_turns: int
    remaining_turns: int
    status: GameStatus = GameStatus.IN_PROGRESS
    guesses: list[GuessResult] = field(default_factory=list)

    @classmethod
    def new(cls, game_id: str, target_word: str) -> "GameState":
        word_length = len(target_word)
        max_turns = word_length + 1
        return cls(
            game_id=game_id,
            word_length=word_length,
            target_word=target_word,
            max_turns=max_turns,
            remaining_turns=max_turns,
        )

    @property
    def is_finished(self) -> bool:
        return self.status in (GameStatus.WON, GameStatus.LOST)

    def apply_guess(self, result: GuessResult) -> None:
        self.guesses.append(result)
        self.remaining_turns -= 1

        if result.word.lower() == self.target_word.lower():
            self.status = GameStatus.WON
        elif self.remaining_turns <= 0:
            self.status = GameStatus.LOST
        else:
            self.status = GameStatus.IN_PROGRESS
