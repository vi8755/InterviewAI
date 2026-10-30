
function StatsCard({ label, value, description, icon, color = "purple" }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>

      <strong>{value}</strong>
      <p>{description}</p>
    </div>
  );
}

export default StatsCard;
