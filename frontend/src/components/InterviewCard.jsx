
function InterviewCard({ interview, onStart }) {
  return (
    <article className="interview-card">
      <div className="interview-card-top">
        <div className="role-icon">{interview.icon || "💼"}</div>
        <span className="ready-badge">
          <span /> Ready
        </span>
      </div>

      <h3>{interview.role}</h3>
      <p className="role-subtitle">{interview.level} level</p>

      <div className="card-divider" />

      <div className="interview-meta">
        <span>▤ {interview.questions} questions</span>
        <span>◷ Flexible practice</span>
      </div>

      <button className="start-button" onClick={() => onStart(interview)}>
        Start interview <span>→</span>
      </button>
    </article>
  );
}

export default InterviewCard;
