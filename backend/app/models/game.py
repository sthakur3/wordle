import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Game(Base):
    """One Wordle game, including the full guess history."""

    __tablename__ = "games"
    __table_args__ = (
        CheckConstraint(
            "status IN ('IN_PROGRESS', 'WON', 'LOST')", name="ck_games_status"
        ),
        CheckConstraint(
            "remaining_turns >= 0 AND remaining_turns <= max_turns",
            name="ck_games_remaining_turns",
        ),
        CheckConstraint(
            "char_length(target_word) = word_length", name="ck_games_word_length"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    word_length: Mapped[int] = mapped_column(Integer, nullable=False)
    target_word: Mapped[str] = mapped_column(String, nullable=False)
    max_turns: Mapped[int] = mapped_column(Integer, nullable=False)
    remaining_turns: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    guesses: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
