
import json

from groq import Groq

from app.core.config import settings


class GroqQuestionService:
    def __init__(self):
        self.client = Groq(api_key=settings.groq_api_key)
        self.model = settings.groq_model

    def generate_questions(
        self,
        job_role: str,
        experience_level: str,
        difficulty: str,
        total_questions: int,
    ) -> list[dict]:
        prompt = f"""
Generate exactly {total_questions} interview questions for:

Job role: {job_role}
Experience level: {experience_level}
Difficulty: {difficulty}

Requirements:
- Questions must sound natural when spoken aloud.
- Ask one clear question at a time.
- Match the specified role, experience, and difficulty.
- Avoid duplicate questions.
- Mix conceptual and practical questions where appropriate.
- Do not include answers, explanations, or introductory text.
- Return valid JSON only, following this structure:
{{
  "questions": [
    {{
      "question_text": "The interview question",
      "question_type": "technical",
      "order_number": 1
    }}
  ]
}}

Use question_type "technical" for technical questions and
"behavioral" for behavioral questions.
Number questions from 1 to {total_questions}.
"""

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You generate high-quality interview questions "
                        "for a voice-based interview practice platform. "
                        "Follow the requested JSON structure exactly."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_completion_tokens=3000,
        )

        content = completion.choices[0].message.content

        if not content:
            raise ValueError("The AI returned an empty response.")

        # Remove optional Markdown code fences.
        content = content.strip()
        if content.startswith("```"):
            lines = content.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            content = "\n".join(lines)

        result = json.loads(content)
        questions = result.get("questions")

        if not isinstance(questions, list) or len(questions) != total_questions:
            raise ValueError("The AI returned an unexpected number of questions.")

        validated_questions = []

        for index, question in enumerate(questions, start=1):
            question_text = question.get("question_text")
            question_type = question.get("question_type", "technical")

            if not isinstance(question_text, str) or not question_text.strip():
                raise ValueError("The AI returned an invalid question.")

            if question_type not in {"technical", "behavioral"}:
                question_type = "technical"

            validated_questions.append(
                {
                    "question_text": question_text.strip(),
                    "question_type": question_type,
                    "order_number": index,
                }
            )

        return validated_questions


groq_question_service = GroqQuestionService()
