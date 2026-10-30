
"""add timed adaptive interview fields

Revision ID: 07e680b6af70
Revises: 03813475039a
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "07e680b6af70"
down_revision: Union[str, Sequence[str], None] = "03813475039a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "interviews",
        sa.Column(
            "duration_minutes",
            sa.Integer(),
            nullable=False,
            server_default="10",
        ),
    )

    op.add_column(
        "interviews",
        sa.Column(
            "question_time_limit_seconds",
            sa.Integer(),
            nullable=False,
            server_default="120",
        ),
    )

    op.add_column(
        "interview_sessions",
        sa.Column(
            "deadline_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.add_column(
        "interview_sessions",
        sa.Column(
            "current_question_started_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column(
        "interview_sessions",
        "current_question_started_at",
    )
    op.drop_column(
        "interview_sessions",
        "deadline_at",
    )
    op.drop_column(
        "interviews",
        "question_time_limit_seconds",
    )
    op.drop_column(
        "interviews",
        "duration_minutes",
    )
