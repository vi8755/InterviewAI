
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    job_role: Mapped[str] = mapped_column(String(150), nullable=False)
    experience_level: Mapped[str] = mapped_column(String(50), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(30), nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    
    duration_minutes: Mapped[int] = mapped_column(
    Integer,
    nullable=False,
    default=10,
    server_default="10",
    )

    question_time_limit_seconds: Mapped[int] = mapped_column(
    Integer,
    nullable=False,
    default=120,
    server_default="120",
   )


    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="created"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    questions: Mapped[list["InterviewQuestion"]] = relationship(
        back_populates="interview",
        cascade="all, delete-orphan",
        order_by="InterviewQuestion.id",
    )


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    interview_id: Mapped[int] = mapped_column(
        ForeignKey("interviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="technical"
    )
    order_number: Mapped[int] = mapped_column(Integer, nullable=False)

    interview: Mapped["Interview"] = relationship(back_populates="questions")
