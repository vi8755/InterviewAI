
import { useState } from "react";
import { loginUser } from "../services/api";

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await loginUser(email, password);
      onLogin(data.user);
    } catch (err) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="brand-icon">I</span>
          <h1>Interview<span>AI</span></h1>
        </div>

        <p className="eyebrow">YOUR PERSONAL AI COACH</p>
        <h2>Welcome back!</h2>
        <p className="login-description">
          Sign in to continue your interview preparation.
        </p>

        {error && (
          <div className="message-banner" role="alert">
            {error}
          </div>
        )}

        <label htmlFor="login-email">Email address</label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />

        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          autoComplete="current-password"
          required
        />

        <button
          className="primary-button login-submit"
          type="submit"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign in →"}
        </button>

        <p className="login-footnote">
          Use the account you registered with your InterviewAI backend.
        </p>
      </form>
    </main>
  );
}

export default Login;
