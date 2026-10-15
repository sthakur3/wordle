"""add games check constraints

Revision ID: 0002_games_constraints
Revises: 0001_create_games
Create Date: 2026-10-14

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0002_games_constraints"
down_revision: Union[str, Sequence[str], None] = "0001_create_games"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_games_status", "games", "status IN ('IN_PROGRESS', 'WON', 'LOST')"
    )
    op.create_check_constraint(
        "ck_games_remaining_turns",
        "games",
        "remaining_turns >= 0 AND remaining_turns <= max_turns",
    )
    op.create_check_constraint(
        "ck_games_word_length", "games", "char_length(target_word) = word_length"
    )


def downgrade() -> None:
    op.drop_constraint("ck_games_word_length", "games")
    op.drop_constraint("ck_games_remaining_turns", "games")
    op.drop_constraint("ck_games_status", "games")
