
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("access_token");

  const headers = {
    ...options.headers,
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.detail || `Request failed: ${response.status}`
    );
  }

  return data;
}

export async function loginUser(email, password) {
  const data = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (!data?.access_token) {
    throw new Error("The server did not return an access token.");
  }

  localStorage.setItem("access_token", data.access_token);
  return data;
}

export async function getCurrentUser() {
  return apiRequest("/auth/me");
}

export async function registerUser(full_name, email, password) {
  return apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ full_name, email, password }),
  });
}

export async function getMyInterviews() {
  return apiRequest("/interviews");
}


export async function createInterview(interviewData) {
  return apiRequest("/interviews", {
    method: "POST",
    body: JSON.stringify({
      job_role: interviewData.job_role,
      experience_level: interviewData.experience_level,
      difficulty: interviewData.difficulty,
      total_questions: Number(interviewData.total_questions),

      // Pass the selected timer settings to FastAPI.
      duration_minutes: Number(interviewData.duration_minutes ?? 10),
      question_time_limit_seconds: Number(
        interviewData.question_time_limit_seconds ?? 120
      ),
    }),
  });
}



export function logoutUser() {
  localStorage.removeItem("access_token");
}


export function startInterviewSession(interviewId) {
  return apiRequest(`/interviews/${interviewId}/sessions`, {
    method: "POST",
  });
}

export function submitInterviewAnswer(sessionId, answerText) {
  return apiRequest(`/interviews/sessions/${sessionId}/answers`, {
    method: "POST",
    body: JSON.stringify({
      answer_text: answerText,
    }),
  });
}
 