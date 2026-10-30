
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class InterviewCreate(BaseModel):
    job_role: str = Field(min_length=2, max_length=150)
    experience_level: str = Field(min_length=2, max_length=50)
    difficulty: str = Field(min_length=3, max_length=30)

    # Keep compatibility with existing fixed-question interviews.
    total_questions: int = Field(default=5, ge=1, le=20)

    # New timed-interview settings.
    duration_minutes: int = Field(default=10, ge=1, le=120)
    question_time_limit_seconds: int = Field(
        default=120,
        ge=15,
        le=600,
    )


class InterviewQuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question_text: str
    question_type: str
    order_number: int


class InterviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    job_role: str
    experience_level: str
    difficulty: str
    total_questions: int
    status: str
    created_at: datetime
    questions: list[InterviewQuestionResponse] = Field(
        default_factory=list
    )
