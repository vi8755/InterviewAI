import json
import re
from typing import Any

from app.services.groq_service import groq_question_service


class InterviewLearningReportService:
    """Generate an evidence-based learning plan from saved interview evaluations."""

    def __init__(self):
        self.client = groq_question_service.client
        self.model = groq_question_service.model

    def generate_report(
        self,
        job_role: str,
        experience_level: str,
        difficulty: str,
        answers: list[dict[str, Any]],
    ) -> dict[str, Any]:
        if not answers:
            raise ValueError("No evaluated answers are available for this interview.")

        compact_answers = []
        for item in answers:
            compact_answers.append({
                "question": str(item.get("question_text") or ""),
                "answer": str(item.get("answer_text") or "")[:3000],
                "score": item.get("score"),
                "max_score": item.get("max_score", 10),
                "correctness": item.get("correctness"),
                "relevance": item.get("relevance"),
                "clarity": item.get("clarity"),
                "technical_depth": item.get("technical_depth"),
                "strengths": item.get("strengths") or [],
                "weaknesses": item.get("weaknesses") or [],
                "feedback": str(item.get("feedback") or "")[:1500],
            })

        prompt = f"""
Create a personalized technical-interview learning report using only the evidence below.
Candidate context: role={job_role}; experience={experience_level}; difficulty={difficulty}.
Interview answers and their existing evaluations:
{json.dumps(compact_answers, ensure_ascii=False)}

Rules:
- Do not invent skills the candidate demonstrated.
- Base strengths and weak topics on the supplied answers and evaluations.
- Prioritize weak topics that recur or have low scores; be specific and actionable.
- If evidence is limited, say so rather than making broad claims.
- Learning goals must be teachable; practice tasks must be concrete and checkable.
- Produce a realistic 7-day plan. Day 1 should address the highest-priority gap.
- Return valid JSON only, without Markdown fences, with exactly this structure:
{{
  "overall_summary": "2-4 sentence evidence-based summary",
  "performance_level": "Needs improvement | Developing | Good | Strong",
  "strengths": ["specific demonstrated strength"],
  "priority_improvements": [
    {{
      "topic": "specific topic",
      "priority": "high | medium | low",
      "evidence": "what in the answer/evaluation indicates this gap",
      "why_it_matters": "short explanation",
      "learning_goals": ["specific goal"],
      "practice_tasks": ["concrete task with a clear completion criterion"]
    }}
  ],
  "action_plan": [
    {{
      "day": 1,
      "focus": "topic",
      "tasks": ["specific task"],
      "success_criteria": "how the candidate knows it is done"
    }}
  ],
  "next_interview_recommendation": "what to practise before the next mock interview"
}}
Limit strengths to 5, priority_improvements to 5, and action_plan to 7 days.
Each list may be shorter when the evidence does not support more items.
"""
        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a supportive technical-interview coach. "
                        "Be specific, fair, evidence-based, and practical. Return JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_completion_tokens=3000,
        )
        content = (completion.choices[0].message.content or "").strip()
        if not content:
            raise ValueError("The AI returned an empty learning report.")
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.I).strip()
        try:
            report = json.loads(content)
        except json.JSONDecodeError as exc:
            raise ValueError("The AI returned invalid learning-report JSON.") from exc

        required = ("overall_summary", "performance_level", "strengths",
                    "priority_improvements", "action_plan", "next_interview_recommendation")
        if any(key not in report for key in required):
            raise ValueError("The AI learning report is missing required fields.")
        if not isinstance(report["strengths"], list) or not isinstance(report["priority_improvements"], list):
            raise ValueError("The AI learning report contains invalid topic lists.")
        if not isinstance(report["action_plan"], list):
            raise ValueError("The AI learning report contains an invalid action plan.")
        return report


interview_learning_report_service = InterviewLearningReportService()
