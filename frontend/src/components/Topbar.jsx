
function Topbar({ activePage }) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        Workspace <span>/</span> {activePage}
      </div>

      <div className="topbar-right">
        <span className="system-status">
          <span className="status-dot" />
          AI practice workspace
        </span>
        <div className="top-avatar">U</div>
      </div>
    </header>
  );
}

export default Topbar;
