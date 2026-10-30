
function Sidebar({ activePage, setActivePage, interviewCount, onNewInterview }) {
  const navItems = [
    { name: "Dashboard", icon: "⌂" },
    { name: "My Interviews", icon: "▤" },
    { name: "Performance", icon: "▥" },
  ];

  return (
    <aside className="sidebar">
      <a className="brand" href="#dashboard">
        <span className="brand-icon">I</span>
        <span>
          Interview<span className="brand-highlight">AI</span>
          <small>YOUR PERSONAL AI COACH</small>
        </span>
      </a>

      <div className="nav-label">WORKSPACE</div>

      <nav className="navigation">
        {navItems.map((item) => (
          <button
            key={item.name}
            className={`nav-item ${activePage === item.name ? "active" : ""}`}
            onClick={() => setActivePage(item.name)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.name}
            {item.name === "My Interviews" && (
              <span className="nav-count">{interviewCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="help-card">
          <div className="help-icon">✦</div>
          <strong>Practice makes progress.</strong>
          <p>Build confidence, one answer at a time.</p>
          <button onClick={onNewInterview}>Start practicing →</button>
        </div>

        <div className="profile">
          <div className="avatar">U</div>
          <div className="profile-info">
            <strong>My Account</strong>
            <span>Interview candidate</span>
          </div>
          <span className="profile-menu">•••</span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
