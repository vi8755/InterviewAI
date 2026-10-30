
from app.services.evaluation_service import answer_evaluation_service

question = (
    "What is a Python decorator, and why is it used?"
)

answer = """
A decorator is a function that takes another function
and extends its behavior without modifying its original code.
It is commonly used for logging, authentication, and timing.
"""

try:
    result = answer_evaluation_service.evaluate_answer(
        question_text=question,
        answer_text=answer,
        job_role="Python Developer",
        experience_level="Beginner",
        difficulty="Easy",
    )

    print("\n--- AI EVALUATION RESULT ---")
    print(f"Score: {result['score']}/{result['max_score']}")
    print(f"Correctness: {result['correctness']}/10")
    print(f"Relevance: {result['relevance']}/10")
    print(f"Clarity: {result['clarity']}/10")
    print(f"Technical depth: {result['technical_depth']}/10")
    print("Strengths:", result["strengths"])
    print("Weaknesses:", result["weaknesses"])
    print("Feedback:", result["feedback"])
    print("Suggested answer:", result["suggested_answer"])

except Exception as exc:
    print(f"Evaluation test failed: {type(exc).__name__}: {exc}")
