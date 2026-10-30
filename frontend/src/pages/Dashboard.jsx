
import InterviewCard from "../components/InterviewCard";
import StatsCard from "../components/StatsCard";

function Dashboard({ interviews, onNewInterview, onStartInterview, onViewAll }) {
  const totalQuestions = interviews.reduce(
    (sum, interview) => sum + interview.questions,
    0
  );

  const averageQuestions = interviews.length
    ? Math.round(totalQuestions / interviews.length)
    : 0;

  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="eyebrow">
            <span>✦</span> YOUR CAREER, YOUR PACE
          </div>
          <h1>Let's get you interview-ready.</h1>
          <p className="page-subtitle">
            Practice with AI, sharpen your answers, and walk in with confidence.
          </p>
        </div>

        <button className="primary-button" onClick={onNewInterview}>
          <span>＋</span> New interview
        </button>
      </section>

      <section className="hero-card">
        <div className="hero-copy">
          <span className="hero-tag">✦ MEET YOUR AI INTERVIEWER</span>
          <h2>Real practice. Better answers.</h2>
          <p>
            Prepare with role-based questions, AI-powered evaluation, and
            personalized feedback.
          </p>
          <button className="hero-button" onClick={onNewInterview}>
            Create an interview <span>→</span>
          </button>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-glow" />
          <div className="ai-sparkle sparkle-one">✦</div>
          <div className="ai-sparkle sparkle-two">✧</div>
          <div className="ai-orb"><span>AI</span></div>
          <div className="floating-card">
            <span className="floating-dot" />
            Ready when you are
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <StatsCard
          label="Practice interviews"
          value={interviews.length}
          description="Your interview collection"
          icon="▤"
          color="purple"
        />
        <StatsCard
          label="Questions per interview"
          value={averageQuestions}
          description="Average planned questions"
          icon="✧"
          color="blue"
        />
        <StatsCard
          label="Completed sessions"
          value={0}
          description="Your journey starts today"
          icon="✓"
          color="green"
        />
      </section>

      <section className="interviews-section">
        <div className="section-heading">
          <div>
            <h2>Your practice interviews</h2>
            <p>Choose a role and get ready to practice.</p>
          </div>
          <button className="text-button" onClick={onViewAll}>
            View all <span>→</span>
          </button>
        </div>

        <div className="interview-grid">
          {interviews.map((interview) => (
            <InterviewCard
              key={interview.id}
              interview={interview}
              onStart={onStartInterview}
            />
          ))}

          <button className="add-interview-card" onClick={onNewInterview}>
            <span className="add-icon">＋</span>
            <strong>Create a new interview</strong>
            <span>Choose your role, level, and questions</span>
          </button>
        </div>
      </section>
    </>
  );
}

export default Dashboard;
