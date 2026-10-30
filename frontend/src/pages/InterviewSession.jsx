import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../services/api";
import "./InterviewSession.css";

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

const MALE_AVATAR =
  "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=85";

function getErrorMessage(error) {
  return error?.message || "Something went wrong. Please try again.";
}

export default function InterviewSession({ interview, onExit }) {
  const [session, setSession] = useState(null);
  const [answer, setAnswer] = useState("");
  const [transcript, setTranscript] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [completed, setCompleted] = useState(false);
  const [terminated, setTerminated] = useState(false);
  const [terminationReport, setTerminationReport] = useState([]);
  const [learningReport, setLearningReport] = useState(null);
  const [learningReportLoading, setLearningReportLoading] = useState(false);
  const [learningReportError, setLearningReportError] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [speechSupported] = useState(Boolean(SpeechRecognitionAPI));
  const [micPermission, setMicPermission] = useState("not-started");
  const [hasStarted, setHasStarted] = useState(false);
  const [fullscreenReady, setFullscreenReady] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [securityWarning, setSecurityWarning] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [clockNow, setClockNow] = useState(Date.now());
  const [timeoutAction, setTimeoutAction] = useState("");

  const recognitionRef = useRef(null);
  const answerRef = useRef("");
  const mountedRef = useRef(true);
  const violationCountRef = useRef(0);
  const submittingRef = useRef(false);
  const lastViolationAtRef = useRef(0);
  const submitAnswerRef = useRef(null);
  const terminateSessionRef = useRef(null);
  const sessionStartedRef = useRef(false);
  const rootRef = useRef(null);
  const handledQuestionTimeoutRef = useRef(null);
  const finishingNormallyRef = useRef(false);

  const question = session?.current_question;
  const totalQuestions = session?.total_questions || interview?.total_questions || 1;
  const currentNumber = session?.current_question_order || 1;
  const deadlineMs = session?.deadline_at ? new Date(session.deadline_at).getTime() : null;
  const questionStartedMs = session?.current_question_started_at
    ? new Date(session.current_question_started_at).getTime()
    : null;
  const questionLimitSeconds = session?.question_time_limit_seconds || 120;
  const overallRemainingSeconds = deadlineMs
    ? Math.max(0, Math.ceil((deadlineMs - clockNow) / 1000))
    : null;
  const questionRemainingSeconds = questionStartedMs
    ? Math.max(0, Math.ceil((questionStartedMs + questionLimitSeconds * 1000 - clockNow) / 1000))
    : null;
  const elapsedMs = session?.started_at ? Math.max(0, clockNow - new Date(session.started_at).getTime()) : 0;
  const durationMs = interview?.duration_minutes ? interview.duration_minutes * 60 * 1000 : 10 * 60 * 1000;
  const progress = completed || terminated
    ? 100
    : Math.min(100, Math.round((elapsedMs / durationMs) * 100));

  const formatClock = (seconds) => {
    if (seconds == null || !Number.isFinite(seconds)) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Recognition may already have stopped.
    }
    setListening(false);
  }, []);

  const speakQuestion = useCallback((text) => {
    if (!text || !("speechSynthesis" in window)) {
      setError("Text-to-speech is unavailable in this browser. Read the question on screen.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onstart = () => mountedRef.current && setSpeaking(true);
    utterance.onend = () => mountedRef.current && setSpeaking(false);
    utterance.onerror = () => mountedRef.current && setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const startSession = useCallback(async () => {
    if (!interview?.id) {
      setError("No interview was selected. Please return to My Interviews.");
      return;
    }
    if (sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest(`/interviews/${interview.id}/sessions`, {
        method: "POST",
      });
      if (!mountedRef.current) return;
      setSession(result);
      if (result.current_question?.question_text) {
        setTranscript([{ speaker: "AI interviewer", text: result.current_question.question_text }]);
      }
    } catch (err) {
      sessionStartedRef.current = false;
      if (mountedRef.current) setError(getErrorMessage(err));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [interview]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        // Ignore cleanup errors.
      }
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (hasStarted) startSession();
  }, [hasStarted, startSession]);

  useEffect(() => {
    if (question?.question_text && !completed && hasStarted) {
      speakQuestion(question.question_text);
    }
  }, [question?.id, question?.question_text, completed, hasStarted, speakQuestion]);

  // Generate/retrieve the personalized learning report after the interview ends.
  useEffect(() => {
    if ((!completed && !terminated) || !session?.id) return undefined;

    let cancelled = false;
    setLearningReportLoading(true);
    setLearningReportError("");

    apiRequest(`/interviews/sessions/${session.id}/learning-report`)
      .then((result) => {
        if (!cancelled) setLearningReport(result?.report || null);
      })
      .catch((err) => {
        if (!cancelled) setLearningReportError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLearningReportLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [completed, terminated, session?.id]);

  const enterFullscreenAndStart = async () => {
    setError("");
    try {
      if (!document.fullscreenElement) {
        const target = rootRef.current || document.documentElement;
        if (!target.requestFullscreen) {
          setError("Fullscreen is not supported in this browser. Please use a browser that supports fullscreen mode.");
          return;
        }
        await target.requestFullscreen();
      }
      setFullscreenReady(true);
      setHasStarted(true);
    } catch {
      setError("Please allow fullscreen mode to start the interview.");
    }
  };

  const finishNormally = useCallback(async () => {
    if (!session?.id || completed || terminated || finishingNormallyRef.current) return;
    finishingNormallyRef.current = true;
    submittingRef.current = true;
    stopListening();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setTimeoutAction("overall");
    setError("");
    try {
      const result = await apiRequest(`/interviews/sessions/${session.id}/finish`, { method: "POST" });
      if (!mountedRef.current) return;
      setCompleted(true);
      setSession((previous) => ({ ...previous, status: result.status || "completed" }));
      setTranscript((items) => [...items, {
        speaker: "AI interviewer",
        text: "The interview time limit has ended. Your saved answers are being reviewed for your learning report.",
      }]);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (err) {
      if (mountedRef.current) {
        setError(`${getErrorMessage(err)} The interview could not be finalized yet.`);
        finishingNormallyRef.current = false;
      }
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setTimeoutAction("");
    }
  }, [session?.id, completed, terminated, stopListening]);

  const skipTimedOutQuestion = useCallback(async () => {
    if (!session?.id || completed || terminated || submittingRef.current) return;
    submittingRef.current = true;
    stopListening();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setTimeoutAction("question");
    setAnswer("");
    answerRef.current = "";
    setInterimTranscript("");
    setError("");
    try {
      const result = await apiRequest(`/interviews/sessions/${session.id}/skip`, { method: "POST" });
      if (!mountedRef.current) return;
      if (result.completed) {
        setCompleted(true);
        setSession((previous) => ({ ...previous, status: "completed" }));
        setTranscript((items) => [...items, { speaker: "AI interviewer", text: "The interview has ended. Your saved answers are being prepared for review." }]);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      } else if (result.next_question) {
        setSession((previous) => ({
          ...previous,
          current_question: result.next_question,
          current_question_order: result.current_question_order || result.next_question.order_number,
          total_questions: result.total_questions || previous.total_questions,
          current_question_started_at: result.next_question_started_at,
          deadline_at: result.deadline_at || previous.deadline_at,
          question_time_limit_seconds: result.question_time_limit_seconds || previous.question_time_limit_seconds,
        }));
        setTranscript((items) => [...items,
          { speaker: "AI interviewer", text: "Time is up for that question. Let's move on." },
          { speaker: "AI interviewer", text: result.next_question.question_text },
        ]);
      }
    } catch (err) {
      if (mountedRef.current) setError(getErrorMessage(err));
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setTimeoutAction("");
    }
  }, [session?.id, completed, terminated, stopListening]);

  // Drive both countdowns from server timestamps rather than decrementing state.
  useEffect(() => {
    if (!hasStarted || !session?.id || completed || terminated) return undefined;
    const tick = () => setClockNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [hasStarted, session?.id, completed, terminated]);

  useEffect(() => {
    if (!hasStarted || !session?.id || completed || terminated || !deadlineMs) return;
    if (overallRemainingSeconds === 0 && !submittingRef.current) {
      finishNormally();
    }
  }, [hasStarted, session?.id, completed, terminated, deadlineMs, overallRemainingSeconds, finishNormally]);

  useEffect(() => {
    if (!hasStarted || !session?.id || completed || terminated || questionRemainingSeconds !== 0) return;
    const key = `${session.id}:${question?.id || currentNumber}`;
    if (handledQuestionTimeoutRef.current === key || submittingRef.current) return;
    handledQuestionTimeoutRef.current = key;
    skipTimedOutQuestion();
  }, [hasStarted, session?.id, completed, terminated, questionRemainingSeconds, question?.id, currentNumber, skipTimedOutQuestion]);

  const terminateSession = useCallback(async (finalAnswer = "") => {
    if (!session?.id || terminated || submittingRef.current) return;

    submittingRef.current = true;
    stopListening();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setBusy(true);
    setError("");
    setSecurityWarning(
      "Second security violation detected. Ending the interview and saving your report…"
    );

    try {
      const result = await apiRequest(
        `/interviews/sessions/${session.id}/terminate`,
        {
          method: "POST",
          body: JSON.stringify({ answer_text: finalAnswer.trim() || null }),
        }
      );

      if (!mountedRef.current) return;

      setTerminationReport(Array.isArray(result.answers) ? result.answers : []);
      setTerminated(true);
      setSession((previous) => ({
        ...previous,
        status: result.status || "terminated",
      }));
      setSecurityWarning("");
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(
          `${getErrorMessage(err)} The interview could not be terminated on the server. Please retry the security termination.`
        );
        setSecurityWarning(
          "Second security violation detected. The termination request failed; please do not continue answering."
        );
      }
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, [session, terminated, stopListening]);

  useEffect(() => {
    terminateSessionRef.current = terminateSession;
  }, [terminateSession]);

  const submitAnswer = useCallback(async (autoSubmit = false) => {
    const finalAnswer = answerRef.current.trim();
    if (!session?.id || busy || completed || terminated || submittingRef.current) return;
    if (!finalAnswer) {
      setError(autoSubmit
        ? "Second security warning: there is no spoken answer to submit. Please speak an answer so the existing backend can save it."
        : "Please speak your answer before submitting.");
      return;
    }

    submittingRef.current = true;
    stopListening();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setBusy(true);
    setError("");
    setTranscript((items) => [...items, { speaker: "You", text: finalAnswer }]);

    try {
      const result = await apiRequest(`/interviews/sessions/${session.id}/answers`, {
        method: "POST",
        body: JSON.stringify({ answer_text: finalAnswer }),
      });
      setAnswer("");
      answerRef.current = "";
      setInterimTranscript("");
      if (result.saved_answer?.evaluation) {
        setEvaluations((items) => [
          ...items,
          {
            question: question?.question_text || `Question ${currentNumber}`,
            ...result.saved_answer.evaluation,
          },
        ]);
      }

      if (result.completed) {
        setCompleted(true);
        setSession((previous) => ({ ...previous, status: "completed" }));
        setTranscript((items) => [...items, {
          speaker: "AI interviewer",
          text: "That's the end of the interview. Your evaluation is ready.",
        }]);
      } else if (result.next_question) {
        setSession((previous) => ({
          ...previous,
          current_question: result.next_question,
          current_question_order: result.next_question.order_number || currentNumber + 1,
          total_questions: result.total_questions || previous.total_questions,
          current_question_started_at: result.next_question_started_at,
          deadline_at: result.deadline_at || previous.deadline_at,
          question_time_limit_seconds: result.question_time_limit_seconds || previous.question_time_limit_seconds,
        }));
        setTranscript((items) => [...items, {
          speaker: "AI interviewer",
          text: result.next_question.question_text,
        }]);
        if (autoSubmit) {
          setError("The current spoken answer was submitted after the second security warning. The backend session has advanced to the next question.");
        }
      } else {
        setError("The answer was submitted, but the backend did not return the next question. Check the backend response.");
      }
    } catch (err) {
      setAnswer(finalAnswer);
      answerRef.current = finalAnswer;
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  }, [session, busy, completed, terminated, stopListening, question, currentNumber]);

  useEffect(() => {
    submitAnswerRef.current = submitAnswer;
  }, [submitAnswer]);

  const registerSecurityViolation = useCallback((reason) => {
    if (!hasStarted || completed || terminated || busy || submittingRef.current) return;
    // Browsers may emit blur, visibilitychange, and fullscreenchange for one action.
    // Count them as one violation when they occur nearly simultaneously.
    const now = Date.now();
    if (now - lastViolationAtRef.current < 1500) return;
    lastViolationAtRef.current = now;
    const nextCount = violationCountRef.current + 1;
    violationCountRef.current = nextCount;
    setViolationCount(nextCount);

    if (nextCount === 1) {
      setSecurityWarning(`Warning 1 of 2: ${reason}. Return to the interview. A second detected violation will submit your current spoken answer.`);
      return;
    }

    setSecurityWarning("Warning 2 of 2: repeated interview-window violation detected. The interview will now be terminated.");
    stopListening();
    const terminate = terminateSessionRef.current;
    if (terminate) {
      window.setTimeout(() => terminate(answerRef.current), 0);
    } else {
      setError("The termination handler is not ready. Please do not continue the interview.");
    }
  }, [hasStarted, completed, terminated, busy, stopListening]);

  useEffect(() => {
    if (!hasStarted || completed || terminated) return undefined;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") registerSecurityViolation("You switched tabs or hid the interview window");
    };
    const onBlur = () => registerSecurityViolation("The interview window lost focus");
    const onFullscreenChange = () => {
      const isFullscreen = Boolean(document.fullscreenElement);
      setFullscreenReady(isFullscreen);
      if (!isFullscreen) registerSecurityViolation("Fullscreen mode was exited");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [hasStarted, completed, terminated, registerSecurityViolation]);

  useEffect(() => {
    if (!hasStarted) return undefined;
    const preventClipboard = (event) => event.preventDefault();
    const preventShortcuts = (event) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && ["c", "x", "v", "a", "p", "s"].includes(key)) {
        event.preventDefault();
      }
      if (event.key === "PrintScreen") event.preventDefault();
    };
    document.addEventListener("copy", preventClipboard, true);
    document.addEventListener("cut", preventClipboard, true);
    document.addEventListener("paste", preventClipboard, true);
    document.addEventListener("contextmenu", preventClipboard, true);
    document.addEventListener("selectstart", preventClipboard, true);
    document.addEventListener("dragstart", preventClipboard, true);
    document.addEventListener("keydown", preventShortcuts, true);
    return () => {
      document.removeEventListener("copy", preventClipboard, true);
      document.removeEventListener("cut", preventClipboard, true);
      document.removeEventListener("paste", preventClipboard, true);
      document.removeEventListener("contextmenu", preventClipboard, true);
      document.removeEventListener("selectstart", preventClipboard, true);
      document.removeEventListener("dragstart", preventClipboard, true);
      document.removeEventListener("keydown", preventShortcuts, true);
    };
  }, [hasStarted]);

  const startListening = () => {
    setError("");
    if (!SpeechRecognitionAPI) {
      setMicPermission("unsupported");
      setError("Speech recognition isn't supported in this browser. Use a supported browser with microphone access.");
      return;
    }
    stopListening();
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      setListening(true);
      setMicPermission("granted");
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += `${text} `;
        else interimText += text;
      }
      if (finalText) {
        setAnswer((previous) => {
          const updated = `${previous}${previous.trim() ? " " : ""}${finalText}`.trim();
          answerRef.current = updated;
          return updated;
        });
      }
      setInterimTranscript(interimText);
    };
    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicPermission("denied");
        setError("Microphone permission was denied. Allow microphone access in your browser settings.");
      } else if (event.error === "no-speech") {
        setError("No speech detected. Try speaking again.");
      } else if (event.error !== "aborted") {
        setError(`Speech recognition issue: ${event.error}. Try again or use a supported browser.`);
      }
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setListening(false);
      setError("Couldn't start the microphone. Please try again.");
    }
  };

  const finishInterview = () => {
    stopListening();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onExit?.();
  };

  const learningReportSection = (
    <section className="learning-report">
      <p className="voice-eyebrow">YOUR PERSONALIZED NEXT STEPS</p>
      <h2>Learning &amp; improvement plan</h2>
      <p className="voice-muted">
        Based on your saved answers and their evaluations, here is what to focus on next.
      </p>

      {learningReportLoading && (
        <p className="voice-notice">Analyzing your answers and preparing your learning plan…</p>
      )}
      {learningReportError && (
        <div className="voice-notice learning-report-error" role="alert">
          <p>We couldn't load the personalized learning report.</p>
          <p>{learningReportError}</p>
          <button
            className="voice-secondary"
            onClick={() => {
              setLearningReportError("");
              setLearningReportLoading(true);
              apiRequest(`/interviews/sessions/${session.id}/learning-report`)
                .then((result) => setLearningReport(result?.report || null))
                .catch((err) => setLearningReportError(getErrorMessage(err)))
                .finally(() => setLearningReportLoading(false));
            }}
            disabled={learningReportLoading}
          >
            Try again
          </button>
        </div>
      )}

      {learningReport && (
        <>
          <div className="learning-report-summary">
            <div>
              <span className="learning-report-label">Performance level</span>
              <strong>{learningReport.performance_level || "Interview summary"}</strong>
            </div>
            <p>{learningReport.overall_summary}</p>
          </div>

          {!!learningReport.strengths?.length && (
            <div className="learning-report-block">
              <h3><span aria-hidden="true">✓</span> Your demonstrated strengths</h3>
              <ul>
                {learningReport.strengths.map((item, index) => (
                  <li key={`strength-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {!!learningReport.priority_improvements?.length && (
            <div className="learning-report-block">
              <h3><span aria-hidden="true">↗</span> Topics to focus on</h3>
              <div className="learning-topic-list">
                {learningReport.priority_improvements.map((item, index) => (
                  <article className="learning-topic" key={`${item.topic || "topic"}-${index}`}>
                    <div className="learning-topic-heading">
                      <h4>{item.topic || "Improvement topic"}</h4>
                      <span className={`learning-priority priority-${String(item.priority || "medium").toLowerCase()}`}>
                        {item.priority || "medium"} priority
                      </span>
                    </div>
                    {item.evidence && <p><strong>Why this was identified:</strong> {item.evidence}</p>}
                    {item.why_it_matters && <p><strong>Why it matters:</strong> {item.why_it_matters}</p>}
                    {!!item.learning_goals?.length && (
                      <>
                        <h5>Learning goals</h5>
                        <ul>{item.learning_goals.map((goal, goalIndex) => <li key={goalIndex}>{goal}</li>)}</ul>
                      </>
                    )}
                    {!!item.practice_tasks?.length && (
                      <>
                        <h5>Practice tasks</h5>
                        <ul>{item.practice_tasks.map((task, taskIndex) => <li key={taskIndex}>{task}</li>)}</ul>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}

          {!!learningReport.action_plan?.length && (
            <div className="learning-report-block">
              <h3><span aria-hidden="true">▦</span> Your 7-day action plan</h3>
              <div className="learning-day-list">
                {learningReport.action_plan.map((day, index) => (
                  <article className="learning-day" key={`day-${day.day ?? index}`}>
                    <div className="learning-day-number">Day {day.day ?? index + 1}</div>
                    <div className="learning-day-content">
                      <h4>{day.focus || "Practice and review"}</h4>
                      {!!day.tasks?.length && (
                        <ul>{day.tasks.map((task, taskIndex) => <li key={taskIndex}>{task}</li>)}</ul>
                      )}
                      {day.success_criteria && (
                        <p className="learning-success"><strong>Success criteria:</strong> {day.success_criteria}</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {learningReport.next_interview_recommendation && (
            <div className="learning-next-step">
              <h3>Your next step</h3>
              <p>{learningReport.next_interview_recommendation}</p>
            </div>
          )}
        </>
      )}

      {!learningReportLoading && !learningReportError && !learningReport && (
        <p className="voice-notice">No learning report was returned. You can still review the question-by-question feedback above.</p>
      )}
    </section>
  );

  if (!hasStarted) {
    return (
      <main className="voice-room results-room" ref={rootRef}>
        <header className="voice-header">
          <div className="voice-brand"><span>I</span> InterviewAI</div>
          <button className="voice-secondary" onClick={onExit}>Back to interviews</button>
        </header>
        <section className="results-card">
          <div className="results-check">✦</div>
          <p className="voice-eyebrow">READY WHEN YOU ARE</p>
          <h1>Prepare your interview space</h1>
          <p className="voice-muted">The interview will start only after fullscreen is enabled. Keep this window active and answer using your voice.</p>
          {error && <div className="voice-error" role="alert">{error}</div>}
          <button className="voice-primary" onClick={enterFullscreenAndStart} disabled={busy}>Enter fullscreen and start →</button>
          <p className="transcript-hint">Your browser may ask for microphone permission when you start speaking. Browser controls and operating-system actions cannot be completely blocked by a web page.</p>
        </section>
      </main>
    );
  }

  if (terminated) {
    return (
      <main className="voice-room results-room" ref={rootRef}>
        <header className="voice-header">
          <div className="voice-brand"><span>I</span> InterviewAI</div>
          <button className="voice-secondary" onClick={finishInterview}>Back to interviews</button>
        </header>
        <section className="results-card">
          <div className="results-check">!</div>
          <p className="voice-eyebrow">INTERVIEW TERMINATED</p>
          <h1>Your interview has ended</h1>
          <p className="voice-muted">
            The interview was terminated after a second detected security violation.
            Your answers saved so far are shown below.
          </p>
          {terminationReport.length === 0 ? (
            <p className="voice-notice">No answers were saved for this session.</p>
          ) : (
            <div className="evaluation-list">
              {terminationReport.map((item, index) => (
                <article className="evaluation-item" key={`${item.question_id}-${index}`}>
                  <h3>Question {index + 1}</h3>
                  <p className="evaluation-question">{item.question_text || "Interview question"}</p>
                  <p><strong>Your answer:</strong> {item.answer_text || "No answer saved."}</p>
                  {item.score != null && <p><strong>Score:</strong> {item.score} / {item.max_score ?? 10}</p>}
                  {item.feedback && <p>{item.feedback}</p>}
                  {item.suggested_answer && (
                    <div className="suggested-answer">
                      <strong>Suggested answer</strong>
                      <p>{item.suggested_answer}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          {learningReportSection}
          <button className="voice-primary" onClick={finishInterview}>Return to dashboard →</button>
        </section>
      </main>
    );
  }

  if (completed) {
    return (
      <main className="voice-room results-room" ref={rootRef}>
        <header className="voice-header">
          <div className="voice-brand"><span>I</span> InterviewAI</div>
          <button className="voice-secondary" onClick={finishInterview}>Back to interviews</button>
        </header>
        <section className="results-card">
          <div className="results-check">✓</div>
          <p className="voice-eyebrow">SESSION COMPLETED</p>
          <h1>Great work. You finished your interview!</h1>
          <p className="voice-muted">Your answers have been submitted. Here's your feedback.</p>
          {evaluations.length === 0 ? (
            <p className="voice-notice">The interview is complete, but no evaluation details were included in the answer responses. Check the backend's final result response if you expect a full report here.</p>
          ) : (
            <div className="evaluation-list">
              {evaluations.map((item, index) => (
                <article className="evaluation-item" key={`${index}-${item.question}`}>
                  <h3>Question {index + 1}</h3>
                  <p className="evaluation-question">{item.question}</p>
                  {item.score != null && <p><strong>Score:</strong> {item.score} / 10</p>}
                  {(item.feedback || item.ai_feedback) && <p>{item.feedback || item.ai_feedback}</p>}
                  {item.suggested_answer && <div className="suggested-answer"><strong>Suggested answer</strong><p>{item.suggested_answer}</p></div>}
                </article>
              ))}
            </div>
          )}
          {learningReportSection}
          <button className="voice-primary" onClick={finishInterview}>Return to dashboard →</button>
        </section>
      </main>
    );
  }

  return (
    <main className="voice-room interview-active" ref={rootRef} tabIndex={-1} onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onPaste={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} onSelectStart={(e) => e.preventDefault()}>
      <header className="voice-header">
        <div className="voice-brand"><span>I</span> InterviewAI</div>
        <div className="voice-session-label"><span className="connection-dot" /> Live mock interview {fullscreenReady ? "· Fullscreen" : "· Fullscreen exited"}</div>
        <button className="voice-danger" onClick={finishInterview}>End interview</button>
      </header>

      {timeoutAction && <div className="voice-notice" role="status">{timeoutAction === "overall" ? "Time is up. Finishing your interview…" : "Question time is up. Moving to the next question…"}</div>}
      {securityWarning && <div className="voice-error" role="alert"><span>{securityWarning}</span><button onClick={() => setSecurityWarning("")} aria-label="Dismiss warning">×</button></div>}
      {error && <div className="voice-error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}

      <section className="voice-progress">
        <div><strong>{interview?.job_role || interview?.role || "Practice interview"}</strong><span>{interview?.experience_level || interview?.level || ""}</span></div>
        <div className="progress-detail">
          <div className="progress-label"><span>Question {currentNumber} · Interview progress</span><span>{progress}%</span></div>
          <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
        </div>
      </section>

      {busy && !session ? <div className="voice-loading">Connecting to your interview session…</div> : !session ? (
        <div className="voice-loading"><p>Couldn't start the interview session.</p><button className="voice-primary" onClick={startSession}>Try again</button></div>
      ) : (
        <>
          <section className="video-grid">
            <article className={`video-panel ai-panel ${speaking ? "is-speaking" : ""}`}>
              <img className="ai-avatar" src={MALE_AVATAR} alt="Professional male AI interviewer" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              <div className="video-label"><span className="ai-label-icon">✦</span> AI interviewer</div>
              <div className="speaker-status"><span className={`status-pulse ${speaking ? "active" : ""}`} />{speaking ? "Speaking question…" : listening ? "Listening to you…" : "Ready to interview"}</div>
              <div className="question-overlay"><span className="sound-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span><p>{question?.question_text || "Preparing your next question…"}</p></div>
            </article>
            <article className="video-panel candidate-panel">
              <div className="candidate-placeholder"><div className="candidate-avatar">You</div><p>Your interview space</p><span>Your spoken answer appears in the transcript.</span></div>
              <div className="video-label"><span className="you-label-icon">●</span> You</div>
              <div className="candidate-controls"><button className={`round-control ${listening ? "recording" : ""}`} onClick={listening ? stopListening : startListening} aria-label={listening ? "Stop microphone" : "Start microphone"} title={listening ? "Stop microphone" : "Start microphone"}>{listening ? "■" : "🎙"}</button><span>{listening ? "Microphone on" : "Microphone off"}</span></div>
            </article>
          </section>

          <section className="voice-bottom-grid">
            <article className="voice-panel transcript-panel">
              <div className="panel-heading"><div><span className="panel-icon">▤</span><h2>Live transcript</h2></div><span className="live-tag"><i /> LIVE</span></div>
              <div className="transcript-list" aria-live="polite">
                {transcript.map((item, index) => <div className={`transcript-message ${item.speaker === "You" ? "candidate-message" : ""}`} key={`${index}-${item.speaker}`}><span className="message-avatar">{item.speaker === "You" ? "U" : "AI"}</span><div><strong>{item.speaker}</strong><p>{item.text}</p></div></div>)}
                {interimTranscript && <div className="interim-transcript"><span className="listening-indicator" /> {interimTranscript}</div>}
              </div>
              <label className="answer-label" htmlFor="answer-text">Voice answer <span>{listening ? "Listening — speak naturally" : "Use the microphone to answer"}</span></label>
              <textarea id="answer-text" value={answer} readOnly placeholder="Your recognized speech will appear here…" rows={4} aria-readonly="true" />
              <div className="transcript-hint">{speechSupported ? "Voice input only. Use the microphone and speak clearly." : "Speech recognition is not supported in this browser. Try a supported browser with microphone access."}{micPermission === "denied" && " Microphone access is blocked."}</div>
            </article>
            <aside className="voice-panel status-panel">
              <div className="panel-heading"><div><span className="panel-icon">✦</span><h2>Interview status</h2></div><span className="connected-tag"><i /> Connected</span></div>
              <div className="status-row"><span>Session</span><strong>{session.id}</strong></div>
              <div className="status-row"><span>Total time left</span><strong className={overallRemainingSeconds != null && overallRemainingSeconds <= 60 ? "" : "good"}>{formatClock(overallRemainingSeconds)}</strong></div>
              <div className="status-row"><span>Question time left</span><strong className={questionRemainingSeconds != null && questionRemainingSeconds <= 15 ? "" : "good"}>{formatClock(questionRemainingSeconds)}</strong></div>
              <div className="status-row"><span>Microphone</span><strong className={listening ? "good" : ""}>{listening ? "Listening" : "Standby"}</strong></div>
              <div className="status-row"><span>Speech playback</span><strong className={speaking ? "good" : ""}>{speaking ? "Speaking" : "Ready"}</strong></div>
              <div className="status-row"><span>Question</span><strong>{currentNumber} / {totalQuestions}</strong></div>
              <div className="status-row"><span>Security warnings</span><strong className={violationCount ? "" : "good"}>{violationCount} / 2</strong></div>
              <div className="privacy-note"><span>♧</span><div><strong>Evaluation stays hidden</strong><p>Your feedback appears only after the interview is completed.</p></div></div>
              <button className="voice-secondary repeat-button" onClick={() => speakQuestion(question?.question_text)} disabled={!question?.question_text || busy}>↻ Repeat question</button>
            </aside>
          </section>

          <footer className="voice-controls">
            <button className="voice-secondary" onClick={() => speakQuestion(question?.question_text)} disabled={!question?.question_text || busy}>↻ Repeat question</button>
            <div className={`main-mic-wrap ${listening ? "recording" : ""}`}><button className="main-mic" onClick={listening ? stopListening : startListening} disabled={busy || !speechSupported} aria-label={listening ? "Stop listening" : "Start speaking"}>{listening ? "■" : "🎙"}</button><span>{listening ? "Listening to your answer" : "Speak naturally"}</span></div>
            {listening && <button className="voice-secondary" onClick={stopListening}>Stop listening</button>}
            <button className="voice-primary" onClick={() => submitAnswer(false)} disabled={busy || !answer.trim()}>{busy ? "Submitting…" : "Submit spoken answer →"}</button>
          </footer>
        </>
      )}
    </main>
  );
}
