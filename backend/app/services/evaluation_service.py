
import json
import re

from app.services.groq_service import groq_question_service


class AnswerEvaluationService:
    def __init__(self):
        self.client = groq_question_service.client
        self.model = groq_question_service.model

    def evaluate_answer(
        self,
        question_text: str,
        answer_text: str,
        job_role: str,
        experience_level: str,
        difficulty: str,
    ) -> dict:
        if not answer_text or not answer_text.strip():
            raise ValueError("The candidate's answer cannot be empty.")

        prompt = f"""
You are evaluating a candidate in a real technical interview.

Candidate context:
- Job role: {job_role}
- Experience level: {experience_level}
- Difficulty: {difficulty}

Interview question:
{question_text}

Candidate answer:
{answer_text}

Evaluate the answer against the exact interview question.

IMPORTANT EVALUATION RULES:

1. Evaluate what the candidate actually says. Do not assume
   they know something they have not demonstrated.

2. Relevance:
   - 0-2: Almost entirely unrelated to the question.
   - 3-4: Addresses a small part of the question.
   - 5-6: Relevant, but incomplete or missing important details.
   - 7-8: Directly answers the question with minor gaps.
   - 9-10: Direct, complete, and highly relevant.

3. Correctness:
   - 0-2: Fundamentally incorrect or no meaningful answer.
   - 3-4: Significant mistakes, with some correct ideas.
   - 5-6: Partially correct, but important errors or omissions.
   - 7-8: Mostly correct, with minor issues.
   - 9-10: Correct and accurate.

4. Clarity:
   Assess how understandable, organized, and clearly expressed
   the answer is. Do not penalize concise answers unnecessarily.

5. Technical depth:
   Assess explanation, reasoning, examples, and depth appropriate
   to the stated experience level and question difficulty.
   For behavioral questions, assess the specificity and depth
   of the example instead of technical knowledge.

6. PARTIAL CREDIT:
   - Do not automatically give zero because an answer is incomplete.
   - Award credit for relevant, correct concepts even when the
     answer is missing details.
   - A short but correct code solution can earn a high score.
   - An answer that is entirely unrelated may receive a very low
     score, even if it contains technically correct information.
   - Do not award points merely for mentioning technical keywords.

7. Feedback must explain what was correct, what was missing,
   and how the candidate can improve.

Return valid JSON only, with exactly this structure:
{{
  "correctness": 0,
  "relevance": 0,
  "clarity": 0,
  "technical_depth": 0,
  "strengths": ["Specific demonstrated strength"],
  "weaknesses": ["Specific area to improve"],
  "feedback": "Constructive, question-specific feedback",
  "suggested_answer": "An example of a strong answer to this question"
}}

Each subscore must be a number from 0 to 10.
Use a score of 0 only when there is no demonstrated quality
for that dimension.
Do not include Markdown fences around the JSON.
"""

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a consistent, fair interview evaluator. "
                        "Assess the actual answer, award partial credit "
                        "where justified, and return valid JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_completion_tokens=2000,
        )

        content = completion.choices[0].message.content

        if not content:
            raise ValueError("The AI returned an empty evaluation.")

        content = content.strip()

        # Remove optional Markdown code fences.
        if content.startswith("```"):
            content = re.sub(
                r"^```(?:json)?\s*|\s*```$",
                "",
                content,
                flags=re.IGNORECASE,
            ).strip()

        try:
            result = json.loads(content)
        except json.JSONDecodeError as exc:
            raise ValueError(
                "The AI returned invalid evaluation JSON."
            ) from exc

        subscores = [
            "correctness",
            "relevance",
            "clarity",
            "technical_depth",
        ]

        for field in subscores:
            value = result.get(field)

            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not 0 <= value <= 10
            ):
                raise ValueError(
                    f"The AI returned an invalid value for '{field}'."
                )

        for field in ("strengths", "weaknesses"):
            value = result.get(field)

            if (
                not isinstance(value, list)
                or not all(
                    isinstance(item, str) and item.strip()
                    for item in value
                )
            ):
                raise ValueError(
                    f"The AI returned an invalid '{field}' list."
                )

        for field in ("feedback", "suggested_answer"):
            value = result.get(field)

            if not isinstance(value, str) or not value.strip():
                raise ValueError(
                    f"The AI returned invalid '{field}' text."
                )

        # Calculate the overall score ourselves so it remains
        # consistent with the four evaluation dimensions.
        score = round(
            result["correctness"] * 0.40
            + result["relevance"] * 0.30
            + result["clarity"] * 0.15
            + result["technical_depth"] * 0.15,
            1,
        )

        return {
            "score": score,
            "max_score": 10,
            "correctness": result["correctness"],
            "relevance": result["relevance"],
            "clarity": result["clarity"],
            "technical_depth": result["technical_depth"],
            "strengths": result["strengths"],
            "weaknesses": result["weaknesses"],
            "feedback": result["feedback"],
            "suggested_answer": result["suggested_answer"],
        }


answer_evaluation_service = AnswerEvaluationService()
