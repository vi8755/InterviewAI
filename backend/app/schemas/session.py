
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SessionQuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question_text: str
    question_type: str
    order_number: int


class InterviewSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    interview_id: int
    status: str
    current_question_order: int
    started_at: datetime
    current_question_started_at: datetime | None = None
    deadline_at: datetime | None = None
    current_question: SessionQuestionResponse
    total_questions: int
    question_time_limit_seconds: int = 120


class InterviewAnswerSubmit(BaseModel):
    answer_text: str = Field(
        min_length=1,
        max_length=10000,
        description="The candidate's answer to the current interview question",
    )


class InterviewAnswerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    question_id: int
    answer_text: str
    answered_at: datetime
