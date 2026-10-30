from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from sqlalchemy import select
from fastapi import HTTPException, status
from app.model.session import InterviewSession
from app.schemas.session import InterviewSessionResponse
from app.services.interview_learning_report_service import interview_learning_report_service
from app.core.security import get_user_id_from_token
from app.db.session import get_db
from app.model.user import User
from app.model.interview import Interview, InterviewQuestion
from app.schemas.interview import InterviewCreate, InterviewResponse
from app.services.groq_service import groq_question_service
from datetime import datetime, timezone, timedelta
from app.services.evaluation_service import answer_evaluation_service
from app.model.session import InterviewSession, InterviewAnswer
from app.schemas.session import (
    InterviewAnswerSubmit,
    InterviewAnswerResponse,
    SessionQuestionResponse,
)
router = APIRouter(prefix="/interviews", tags=["Interviews"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

class InterviewTerminationRequest(BaseModel):
    answer_text: str | None = Field(
        default=None,
        max_length=10000,
        description="Optional final spoken answer before termination",
    )
def get_current_active_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    user_id = get_user_id_from_token(token)
    user = db.get(User, user_id)

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    # SQLite may return naive datetimes even for timezone=True columns.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _finish_session(interview_session: InterviewSession) -> None:
    interview_session.status = "completed"
    interview_session.completed_at = _utc_now()


def _get_or_generate_next_question(db: Session, interview: Interview, current_order: int):
    """Return the next saved question, generating one if the prepared set is exhausted."""
    next_order = current_order + 1
    existing = next(
        (q for q in interview.questions if q.order_number == next_order),
        None,
    )
    if existing is not None:
        return existing

    try:
        generated = groq_question_service.generate_questions(
            job_role=interview.job_role,
            experience_level=interview.experience_level,
            difficulty=interview.difficulty,
            total_questions=1,
        )
    except Exception:
        # End gracefully if the model cannot provide another question.
        return None

    if not generated:
        return None

    item = generated[0]
    new_question = InterviewQuestion(
        interview_id=interview.id,
        question_text=item["question_text"],
        question_type=item.get("question_type", "technical"),
        order_number=next_order,
    )
    db.add(new_question)
    db.flush()
    # Keep the relationship collection in sync for subsequent operations.
    interview.questions.append(new_question)
    return new_question


def _question_payload(question):
    if question is None:
        return None
    return {
        "id": question.id,
        "question_text": question.question_text,
        "question_type": question.question_type,
        "order_number": question.order_number,
    }


@router.post(
    "",
    response_model=InterviewResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_interview(
    interview_data: InterviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # 1. Generate questions using Groq.
    try:
        questions = groq_question_service.generate_questions(
            job_role=interview_data.job_role.strip(),
            experience_level=interview_data.experience_level.strip(),
            difficulty=interview_data.difficulty.strip().lower(),
            total_questions=interview_data.total_questions,
        )
    except Exception:
        # Keep internal API errors and credentials out of the response.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI question generation failed. Please try again.",
        )

    # 2. Create the interview and its questions.
    interview = Interview(
        user_id=current_user.id,
        job_role=interview_data.job_role.strip(),
        experience_level=interview_data.experience_level.strip(),
        difficulty=interview_data.difficulty.strip().lower(),
        total_questions=interview_data.total_questions,
        duration_minutes=interview_data.duration_minutes,
        question_time_limit_seconds=interview_data.question_time_limit_seconds,
        status="created",
    )

    interview.questions = [
        InterviewQuestion(
            question_text=question["question_text"],
            question_type=question["question_type"],
            order_number=question["order_number"],
        )
        for question in questions
    ]

    # 3. Save everything together in one transaction.
    try:
        db.add(interview)
        db.commit()
        db.refresh(interview)
    except Exception:
        db.rollback()
        raise

    return interview


@router.get("", response_model=list[InterviewResponse])
def get_my_interviews(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    interviews = (
        db.query(Interview)
        .filter(Interview.user_id == current_user.id)
        .order_by(Interview.created_at.desc())
        .all()
    )

    return interviews


@router.get("/{interview_id}", response_model=InterviewResponse)
def get_interview_by_id(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.user_id == current_user.id,
        )
        .first()
    )

    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    return interview


@router.post(
    "/{interview_id}/sessions",
    response_model=InterviewSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def start_interview_session(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # 1. Find the interview and verify ownership.
    interview = (
        db.query(Interview)
        .filter(
            Interview.id == interview_id,
            Interview.user_id == current_user.id,
        )
        .first()
    )

    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    # 2. Ensure the interview has questions.
    if not interview.questions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This interview has no questions",
        )

    try:
        # 3. Create a new session.
        now = _utc_now()
        session = InterviewSession(
            interview_id=interview.id,
            user_id=current_user.id,
            status="in_progress",
            current_question_order=1,
            started_at=now,
            deadline_at=now + timedelta(minutes=interview.duration_minutes),
            current_question_started_at=now,
        )

        db.add(session)
        db.commit()
        db.refresh(session)

        # Return the first question and authoritative server-side deadlines.
        return {
            "id": session.id,
            "interview_id": interview.id,
            "status": session.status,
            "current_question_order": session.current_question_order,
            "started_at": session.started_at,
            "current_question_started_at": session.current_question_started_at,
            "deadline_at": session.deadline_at,
            "question_time_limit_seconds": interview.question_time_limit_seconds,
            "current_question": interview.questions[0],
            "total_questions": len(interview.questions),
        }

    except Exception:
        db.rollback()
        raise



@router.post(
    "/sessions/{session_id}/answers",
    response_model=dict,
)
def submit_interview_answer(
    session_id: int,
    payload: InterviewAnswerSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # 1. Find and lock the session belonging to this user.
    interview_session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id,
            InterviewSession.user_id == current_user.id,
        )
        .with_for_update()
        .first()
    )

    if interview_session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found",
        )

    if interview_session.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This interview session is not in progress",
        )

    # 2. Load the interview.
    interview = (
        db.query(Interview)
        .filter(Interview.id == interview_session.interview_id)
        .first()
    )

    if interview is None or not interview.questions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview or questions not found",
        )

    questions = interview.questions
    current_order = interview_session.current_question_order

    current_question = next(
        (
            question
            for question in questions
            if question.order_number == current_order
        ),
        None,
    )

    if current_question is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current question could not be found",
        )

    # The overall deadline takes precedence over the per-question timer.
    now = _utc_now()
    overall_deadline = _as_utc(interview_session.deadline_at)
    if overall_deadline and now >= overall_deadline:
        _finish_session(interview_session)
        db.commit()
        return {
            "message": "The interview time limit has expired.",
            "completed": True,
            "timed_out": True,
            "session_id": interview_session.id,
            "current_question_order": interview_session.current_question_order,
            "total_questions": len(questions),
            "saved_answer": None,
            "next_question": None,
        }

    question_started = _as_utc(interview_session.current_question_started_at)
    if question_started and (now - question_started).total_seconds() >= interview.question_time_limit_seconds:
        next_question = _get_or_generate_next_question(db, interview, current_order)
        if next_question is None:
            _finish_session(interview_session)
            db.commit()
            return {
                "message": "The interview has ended because no further question could be generated.",
                "completed": True,
                "timed_out": True,
                "session_id": interview_session.id,
                "current_question_order": interview_session.current_question_order,
                "total_questions": len(interview.questions),
                "saved_answer": None,
                "next_question": None,
            }
        interview_session.current_question_order = next_question.order_number
        interview_session.current_question_started_at = now
        db.commit()
        return {
            "message": "Question time expired. The question was skipped.",
            "completed": False,
            "timed_out": True,
            "session_id": interview_session.id,
            "current_question_order": next_question.order_number,
            "total_questions": len(interview.questions),
            "saved_answer": None,
            "next_question": _question_payload(next_question),
            "next_question_started_at": interview_session.current_question_started_at,
            "deadline_at": interview_session.deadline_at,
            "question_time_limit_seconds": interview.question_time_limit_seconds,
        }

    # 3. Validate the answer before calling the AI.
    answer_text = payload.answer_text.strip()

    if not answer_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Answer cannot be empty or whitespace",
        )

    existing_answer = (
        db.query(InterviewAnswer)
        .filter(
            InterviewAnswer.session_id == session_id,
            InterviewAnswer.question_id == current_question.id,
        )
        .first()
    )

    if existing_answer is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This question has already been answered",
        )

    # 4. Evaluate the answer using Groq.
    try:
        evaluation = answer_evaluation_service.evaluate_answer(
            question_text=current_question.question_text,
            answer_text=answer_text,
            job_role=interview.job_role,
            experience_level=interview.experience_level,
            difficulty=interview.difficulty,
        )
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "AI answer evaluation failed. "
                "Your answer was not saved. Please try again."
            ),
        )

    # 5. Save the answer and evaluation together.
    try:
        answer = InterviewAnswer(
            session_id=session_id,
            question_id=current_question.id,
            answer_text=answer_text,
            score=evaluation["score"],
            max_score=evaluation["max_score"],
            correctness=evaluation["correctness"],
            relevance=evaluation["relevance"],
            clarity=evaluation["clarity"],
            technical_depth=evaluation["technical_depth"],
            strengths=evaluation["strengths"],
            weaknesses=evaluation["weaknesses"],
            feedback=evaluation["feedback"],
            suggested_answer=evaluation["suggested_answer"],
        )

        db.add(answer)

        # Use prepared questions first, then generate additional questions while
        # the overall interview deadline still allows time to continue.
        next_question = _get_or_generate_next_question(db, interview, current_order)

        if next_question is not None and _as_utc(interview_session.deadline_at) and _utc_now() < _as_utc(interview_session.deadline_at):
            interview_session.current_question_order = next_question.order_number
            interview_session.current_question_started_at = _utc_now()
            completed = False
            message = "Answer evaluated and saved successfully"
        else:
            _finish_session(interview_session)
            next_question = None
            completed = True
            message = "Interview completed and final answer evaluated"

        db.flush()

        result = {
            "message": message,
            "completed": completed,
            "session_id": interview_session.id,
            "current_question_order": (
                interview_session.current_question_order
            ),
            "total_questions": len(questions),
            "saved_answer": {
                "id": answer.id,
                "session_id": answer.session_id,
                "question_id": answer.question_id,
                "answer_text": answer.answer_text,
                "answered_at": answer.answered_at,
                "evaluation": evaluation,
            },
            "next_question": _question_payload(next_question),
            "next_question_started_at": interview_session.current_question_started_at,
            "deadline_at": interview_session.deadline_at,
            "question_time_limit_seconds": interview.question_time_limit_seconds,
        }

        db.commit()
        return result

    except Exception:
        db.rollback()
        raise


@router.post("/sessions/{session_id}/skip", response_model=dict)
def skip_interview_question(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    interview_session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id,
            InterviewSession.user_id == current_user.id,
        )
        .with_for_update()
        .first()
    )
    if interview_session is None:
        raise HTTPException(status_code=404, detail="Interview session not found")
    if interview_session.status != "in_progress":
        return {"completed": True, "status": interview_session.status, "next_question": None}

    interview = db.get(Interview, interview_session.interview_id)
    if interview is None:
        raise HTTPException(status_code=404, detail="Interview not found")

    now = _utc_now()
    deadline = _as_utc(interview_session.deadline_at)
    if deadline and now >= deadline:
        _finish_session(interview_session)
        db.commit()
        return {"completed": True, "timed_out": True, "status": "completed", "next_question": None}

    next_question = _get_or_generate_next_question(
        db, interview, interview_session.current_question_order
    )
    if next_question is None:
        _finish_session(interview_session)
        db.commit()
        return {"completed": True, "status": "completed", "next_question": None}

    interview_session.current_question_order = next_question.order_number
    interview_session.current_question_started_at = now
    db.commit()
    return {
        "completed": False,
        "timed_out": True,
        "status": "in_progress",
        "session_id": session_id,
        "current_question_order": next_question.order_number,
        "total_questions": len(interview.questions),
        "next_question": _question_payload(next_question),
        "next_question_started_at": interview_session.current_question_started_at,
        "deadline_at": interview_session.deadline_at,
        "question_time_limit_seconds": interview.question_time_limit_seconds,
    }


@router.post("/sessions/{session_id}/finish", response_model=dict)
def finish_interview_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    interview_session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id,
            InterviewSession.user_id == current_user.id,
        )
        .with_for_update()
        .first()
    )
    if interview_session is None:
        raise HTTPException(status_code=404, detail="Interview session not found")
    if interview_session.status == "in_progress":
        _finish_session(interview_session)
        db.commit()
    return {
        "session_id": session_id,
        "status": interview_session.status,
        "completed": interview_session.status == "completed",
        "message": "Interview completed normally.",
        "answers": _get_session_answer_report(db, session_id),
    }


@router.post("/sessions/{session_id}/terminate", response_model=dict)
def terminate_interview_session(
    session_id: int,
    payload: InterviewTerminationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # 1. Find and lock this user's session.
    interview_session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id,
            InterviewSession.user_id == current_user.id,
        )
        .with_for_update()
        .first()
    )

    if interview_session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found",
        )

    # Repeated termination requests must not process answers twice.
    if interview_session.status in ("terminated", "completed"):
        return {
            "session_id": interview_session.id,
            "status": interview_session.status,
            "message": "Interview session is already finished",
            "answers": _get_session_answer_report(db, session_id),
        }

    if interview_session.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Interview session cannot be terminated from its current state",
        )

    interview = db.get(Interview, interview_session.interview_id)

    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    answer_text = (payload.answer_text or "").strip()
    evaluation_error = None

    try:
        # 2. Save the current spoken answer if one was provided.
        if answer_text:
            current_question = next(
                (
                    q for q in interview.questions
                    if q.order_number
                    == interview_session.current_question_order
                ),
                None,
            )

            if current_question is not None:
                existing_answer = (
                    db.query(InterviewAnswer)
                    .filter(
                        InterviewAnswer.session_id == session_id,
                        InterviewAnswer.question_id == current_question.id,
                    )
                    .first()
                )

                # Don't duplicate an answer already saved for this question.
                if existing_answer is None:
                    evaluation = None

                    try:
                        evaluation = (
                            answer_evaluation_service.evaluate_answer(
                                question_text=current_question.question_text,
                                answer_text=answer_text,
                                job_role=interview.job_role,
                                experience_level=interview.experience_level,
                                difficulty=interview.difficulty,
                            )
                        )
                    except Exception:
                        # Still preserve the candidate's answer and end the
                        # session even if the AI evaluator is unavailable.
                        evaluation_error = (
                            "The last answer was saved without AI evaluation."
                        )

                    answer = InterviewAnswer(
                        session_id=session_id,
                        question_id=current_question.id,
                        answer_text=answer_text,
                    )

                    if evaluation is not None:
                        answer.score = evaluation["score"]
                        answer.max_score = evaluation["max_score"]
                        answer.correctness = evaluation["correctness"]
                        answer.relevance = evaluation["relevance"]
                        answer.clarity = evaluation["clarity"]
                        answer.technical_depth = evaluation["technical_depth"]
                        answer.strengths = evaluation["strengths"]
                        answer.weaknesses = evaluation["weaknesses"]
                        answer.feedback = evaluation["feedback"]
                        answer.suggested_answer = evaluation["suggested_answer"]

                    db.add(answer)

        # 3. Persist the interrupted status.
        interview_session.status = "terminated"
        interview_session.completed_at = datetime.now(timezone.utc)

        db.commit()

    except Exception:
        db.rollback()
        raise

    return {
        "session_id": session_id,
        "status": "terminated",
        "completed": False,
        "message": "Interview terminated after a security violation",
        "evaluation_warning": evaluation_error,
        "answers": _get_session_answer_report(db, session_id),
    }


def _get_session_answer_report(db: Session, session_id: int) -> list[dict]:
    answers = (
        db.query(InterviewAnswer)
        .filter(InterviewAnswer.session_id == session_id)
        .order_by(InterviewAnswer.id)
        .all()
    )

    return [
        {
            "question_id": answer.question_id,
            "question_text": (
                answer.question.question_text
                if answer.question else None
            ),
            "answer_text": answer.answer_text,
            "score": answer.score,
            "max_score": answer.max_score,
            "correctness": answer.correctness,
            "relevance": answer.relevance,
            "clarity": answer.clarity,
            "technical_depth": answer.technical_depth,
            "strengths": answer.strengths,
            "weaknesses": answer.weaknesses,
            "feedback": answer.feedback,
            "suggested_answer": answer.suggested_answer,
        }
        for answer in answers
    ]

@router.get("/sessions/{session_id}/learning-report", response_model=dict)
def get_interview_learning_report(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    interview_session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id,
            InterviewSession.user_id == current_user.id,
        )
        .first()
    )
    if interview_session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found",
        )

    if interview_session.status not in ("completed", "terminated"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The learning report is available after the interview ends.",
        )

    interview = db.get(Interview, interview_session.interview_id)
    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview not found",
        )

    saved_answers = (
        db.query(InterviewAnswer)
        .filter(InterviewAnswer.session_id == session_id)
        .order_by(InterviewAnswer.id)
        .all()
    )
    if not saved_answers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No saved answers are available to analyze.",
        )

    answer_data = [
        {
            "question_text": answer.question.question_text if answer.question else "",
            "answer_text": answer.answer_text,
            "score": answer.score,
            "max_score": answer.max_score,
            "correctness": answer.correctness,
            "relevance": answer.relevance,
            "clarity": answer.clarity,
            "technical_depth": answer.technical_depth,
            "strengths": answer.strengths or [],
            "weaknesses": answer.weaknesses or [],
            "feedback": answer.feedback or "",
        }
        for answer in saved_answers
    ]

    try:
        report = interview_learning_report_service.generate_report(
            job_role=interview.job_role,
            experience_level=interview.experience_level,
            difficulty=interview.difficulty,
            answers=answer_data,
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI learning report generation failed. Please try again.",
        )

    return {
        "session_id": interview_session.id,
        "session_status": interview_session.status,
        "job_role": interview.job_role,
        "experience_level": interview.experience_level,
        "answers_analyzed": len(saved_answers),
        "report": report,
    }
