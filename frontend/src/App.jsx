
import { useCallback, useEffect, useState } from "react";
import "./App.css";

import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import InterviewSession from "./pages/InterviewSession";

import {
  getCurrentUser,
  getMyInterviews,
  createInterview as createInterviewApi,
  logoutUser,
} from "./services/api";

function mapInterview(item) {
  return {
    id: item.id,
    role: item.job_role,
    level: item.experience_level,
    difficulty: item.difficulty,
    questions: item.total_questions ?? item.questions?.length ?? 0,
    status: item.status,
    icon: "💼",
    raw: item,
  };
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [interviews, setInterviews] = useState([]);

  const [activePage, setActivePage] = useState("Dashboard");
  const [selectedInterview, setSelectedInterview] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [role, setRole] = useState("");
  const [level, setLevel] = useState("Intermediate");
  const [difficulty, setDifficulty] = useState("Medium");
  const [questionCount, setQuestionCount] = useState("10");
  const [durationMinutes, setDurationMinutes] = useState("10");
  const [questionTimeLimit, setQuestionTimeLimit] = useState("120");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [interviewsLoading, setInterviewsLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Restore the user's login session when the app loads.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const token = localStorage.getItem("access_token");

      if (!token) {
        setAuthLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser();

        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        logoutUser();

        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the authenticated user's interviews.
  const loadInterviews = useCallback(async () => {
    setInterviewsLoading(true);
    setError("");

    try {
      const data = await getMyInterviews();

      if (!Array.isArray(data)) {
        throw new Error(
          "Unexpected interview response. Check the GET /interviews endpoint."
        );
      }

      setInterviews(data.map(mapInterview));
    } catch (err) {
      setError(err.message || "Unable to load interviews.");
    } finally {
      setInterviewsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadInterviews();
    } else {
      setInterviews([]);
    }
  }, [user, loadInterviews]);

  function handleLogin(loggedInUser) {
    setUser(loggedInUser);
    setActivePage("Dashboard");
    setSelectedInterview(null);
    setMessage("Welcome back!");
    setError("");
  }

  function handleLogout() {
    logoutUser();
    setUser(null);
    setInterviews([]);
    setSelectedInterview(null);
    setShowForm(false);
    setActivePage("Dashboard");
    setMessage("");
    setError("");
  }

  function openCreateForm() {
    setMessage("");
    setError("");
    setShowForm(true);
  }

  async function handleCreateInterview(event) {
    event.preventDefault();

    if (!role.trim()) {
      setError("Please enter a job role.");
      return;
    }

    setCreating(true);
    setError("");
    setMessage("");

    try {
      const created = await createInterviewApi({
        job_role: role.trim(),
        experience_level: level,
        difficulty,
        total_questions: Number(questionCount),
        duration_minutes: Number(durationMinutes),
        question_time_limit_seconds: Number(questionTimeLimit),
      });

      const mapped = mapInterview(created);

      setInterviews((current) => [
        mapped,
        ...current.filter((item) => item.id !== mapped.id),
      ]);

      setShowForm(false);
      setRole("");
      setLevel("Intermediate");
      setDifficulty("Medium");
      setQuestionCount("10");
      setDurationMinutes("10");
      setQuestionTimeLimit("120");
      setActivePage("My Interviews");
      setMessage(`Interview for ${mapped.role} created successfully.`);
    } catch (err) {
      setError(err.message || "Unable to create the interview.");
    } finally {
      setCreating(false);
    }
  }

  function handleStartInterview(interview) {
    setSelectedInterview(interview);
    setMessage("");
    setError("");
  }

  function handleExitInterview() {
    setSelectedInterview(null);
    setMessage("");
    setError("");
    loadInterviews();
  }

  if (authLoading) {
    return (
      <main className="login-page">
        <div className="login-card">
          <h2>Loading InterviewAI...</h2>
          <p className="login-description">
            Checking your sign-in session.
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        setActivePage={(page) => {
          setActivePage(page);
          setSelectedInterview(null);
          setMessage("");
          setError("");
        }}
        interviewCount={interviews.length}
        onNewInterview={openCreateForm}
      />

      <main className="main-content">
        <Topbar activePage={selectedInterview ? "Interview Session" : activePage} />

        <div className="page-content">
          <div className="account-bar">
            <span>
              Signed in as{" "}
              <strong>{user.full_name || user.email}</strong>
            </span>
            <button className="text-button" onClick={handleLogout}>
              Sign out
            </button>
          </div>

          {message && (
            <div className="message-banner" role="status">
              <span>{message}</span>
              <button
                onClick={() => setMessage("")}
                aria-label="Dismiss message"
              >
                ×
              </button>
            </div>
          )}

          {error && !showForm && (
            <div className="message-banner" role="alert">
              <span>{error}</span>
              <button
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}

          {selectedInterview ? (
            <InterviewSession
              key={selectedInterview.id}
              interview={selectedInterview}
              onExit={handleExitInterview}
            />
          ) : activePage === "Dashboard" ? (
            <>
              {interviewsLoading ? (
                <section className="empty-state">
                  <h2>Loading your interviews...</h2>
                  <p>
                    Fetching your saved interviews from the backend.
                  </p>
                </section>
              ) : (
                <Dashboard
                  interviews={interviews}
                  onNewInterview={openCreateForm}
                  onStartInterview={handleStartInterview}
                  onViewAll={() => setActivePage("My Interviews")}
                />
              )}

              {!interviewsLoading && error && (
                <button
                  className="primary-button"
                  onClick={loadInterviews}
                >
                  Retry loading interviews
                </button>
              )}
            </>
          ) : activePage === "My Interviews" ? (
            <section className="interviews-section">
              <div className="section-heading">
                <div>
                  <h2>All practice interviews</h2>
                  <p>Your interviews saved in the database.</p>
                </div>

                <button
                  className="primary-button"
                  onClick={openCreateForm}
                >
                  + New interview
                </button>
              </div>

              {interviewsLoading ? (
                <p>Loading interviews...</p>
              ) : interviews.length === 0 ? (
                <div className="empty-state">
                  <h2>No interviews yet</h2>
                  <p>Create your first interview to get started.</p>
                  <button
                    className="primary-button"
                    onClick={openCreateForm}
                  >
                    Create an interview →
                  </button>
                </div>
              ) : (
                <div className="interview-grid">
                  {interviews.map((interview) => (
                    <article
                      className="interview-card"
                      key={interview.id}
                    >
                      <div className="interview-card-top">
                        <div className="role-icon">
                          {interview.icon}
                        </div>
                        <span className="ready-badge">
                          <span />
                          {interview.status || "Saved"}
                        </span>
                      </div>

                      <h3>{interview.role}</h3>
                      <p className="role-subtitle">
                        {interview.level} level
                      </p>

                      <div className="card-divider" />

                      <div className="interview-meta">
                        <span>
                          ▤ {interview.questions} questions
                        </span>
                        {interview.difficulty && (
                          <span>
                            {interview.difficulty} difficulty
                          </span>
                        )}
                      </div>

                      <button
                        className="start-button"
                        onClick={() => handleStartInterview(interview)}
                      >
                        Start interview <span>→</span>
                      </button>
                    </article>
                  ))}

                  <button
                    className="add-interview-card"
                    onClick={openCreateForm}
                  >
                    <span className="add-icon">＋</span>
                    <strong>Create a new interview</strong>
                    <span>Choose your role, level, and questions</span>
                  </button>
                </div>
              )}
            </section>
          ) : (
            <section className="empty-state">
              <div className="empty-icon">▥</div>
              <h2>Your progress starts here</h2>
              <p>
                Your scores, feedback, strengths, and improvement areas
                will appear here as we connect the evaluation workflow.
              </p>
              <button
                className="primary-button"
                onClick={() => setActivePage("My Interviews")}
              >
                Explore interviews →
              </button>
            </section>
          )}

          <footer className="footer">
            <span>InterviewAI © 2026</span>
            <span>
              Built for your next opportunity{" "}
              <span className="footer-heart">♥</span>
            </span>
          </footer>
        </div>
      </main>

      {showForm && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !creating
            ) {
              setShowForm(false);
              setError("");
            }
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  ✦ LET'S GET STARTED
                </span>
                <h2 id="modal-title">Create an interview</h2>
                <p>
                  Customize your AI-powered practice interview.
                </p>
              </div>

              <button
                className="close-button"
                onClick={() => {
                  setShowForm(false);
                  setError("");
                }}
                aria-label="Close"
                disabled={creating}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateInterview}>
              <label htmlFor="role">Job role</label>
              <input
                id="role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="e.g. Python Developer"
                minLength={2}
                maxLength={150}
                required
              />

              <label htmlFor="level">Experience level</label>
              <select
                id="level"
                value={level}
                onChange={(event) => setLevel(event.target.value)}
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>

              <label htmlFor="difficulty">Interview difficulty</label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>

              <label htmlFor="duration-minutes">
                Total interview duration
              </label>
              <select
                id="duration-minutes"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
              >
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
                <option value="20">20 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
              </select>
              <p className="form-help-text">The interview ends automatically when this time expires.</p>

              <label htmlFor="question-time-limit">
                Maximum time per question
              </label>
              <select
                id="question-time-limit"
                value={questionTimeLimit}
                onChange={(event) => setQuestionTimeLimit(event.target.value)}
              >
                <option value="30">30 seconds</option>
                <option value="60">1 minute</option>
                <option value="90">1 minute 30 seconds</option>
                <option value="120">2 minutes</option>
                <option value="180">3 minutes</option>
                <option value="300">5 minutes</option>
                <option value="600">10 minutes</option>
              </select>
              <p className="form-help-text">An unanswered question is skipped automatically.</p>

              <label htmlFor="question-count">
                Initial number of questions
              </label>
              <select
                id="question-count"
                value={questionCount}
                onChange={(event) => setQuestionCount(event.target.value)}
              >
                <option value="5">5 questions</option>
                <option value="10">10 questions</option>
                <option value="15">15 questions</option>
                <option value="20">20 questions</option>
              </select>
              <p className="form-help-text">More questions can be generated if time remains.</p>

              {error && (
                <div className="message-banner" role="alert">
                  {error}
                </div>
              )}

              <div className="modal-note">
                <span>✦</span>
                This sends a request to your backend and saves the
                generated interview.
              </div>

              <button
                className="primary-button submit-button"
                type="submit"
                disabled={creating}
              >
                {creating
                  ? "Generating interview..."
                  : "Generate interview →"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
