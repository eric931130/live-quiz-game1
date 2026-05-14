const isLocalDevHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

const API_BASE = isLocalDevHost
  ? 'http://localhost:3001'
  : 'https://live-quiz-game1.onrender.com';

function getRole(user, fallback = 'student') {
  return user?.role || user?.customClaims?.role || fallback;
}

async function headersFor(user, extra = {}, fallbackRole = 'student') {
  const token = user?.getIdToken ? await user.getIdToken() : null;
  return {
    'x-user-id': user?.uid || user?.studentId || 'anonymous-student',
    'x-user-email': user?.email || '',
    'x-user-name': user?.displayName || user?.nickname || user?.email || '',
    'x-user-role': getRole(user, fallbackRole),
    'x-school-id': user?.schoolId || 'default-school',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra
  };
}

async function parseResponse(response) {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      message = await response.text();
    }
    throw new Error(message);
  }
  return response.json();
}

function queryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

async function parseTextResponse(response) {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      message = await response.text();
    }
    throw new Error(message);
  }
  return response.text();
}

export const peerLearningApi = {
  async overview(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/overview${queryString(params)}`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async settings(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/settings${queryString(params)}`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async updateSettings(user, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/settings`, {
      method: 'PUT',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }, 'teacher'),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async submitExplanation(user, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/explanations`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async voteExplanation(user, explanationId, voteType) {
    const response = await fetch(`${API_BASE}/api/peer-learning/explanations/${explanationId}/vote`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ voteType })
    });
    return parseResponse(response);
  },

  async createHelpRequest(user, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/help-requests`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async listStudentQuestions(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/student-questions${queryString(params)}`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async submitStudentQuestion(user, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/student-questions`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async voteStudentQuestion(user, questionId, scores) {
    const response = await fetch(`${API_BASE}/api/peer-learning/student-questions/${questionId}/vote`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(scores || {})
    });
    return parseResponse(response);
  },

  async challenges(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/challenges${queryString(params)}`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async createChallenge(user, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/challenges`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async respondChallenge(user, challengeId, action) {
    const response = await fetch(`${API_BASE}/api/peer-learning/challenges/${challengeId}/respond`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action })
    });
    return parseResponse(response);
  },

  async completeChallenge(user, challengeId, scores) {
    const response = await fetch(`${API_BASE}/api/peer-learning/challenges/${challengeId}/complete`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ scores })
    });
    return parseResponse(response);
  },

  async peerReviews(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/peer-reviews${queryString(params)}`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async createPeerReview(user, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/peer-reviews`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async submitPeerReview(user, reviewId, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/peer-reviews/${reviewId}/submit`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async wrongExchanges(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/wrong-exchanges${queryString(params)}`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async createWrongExchange(user, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/wrong-exchanges`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async completeWrongExchange(user, exchangeId, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/wrong-exchanges/${exchangeId}/complete`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async guilds(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/guilds${queryString(params)}`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async createGuild(user, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/guilds`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }, 'teacher'),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async joinGuild(user, guildId, payload = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/guilds/${guildId}/join`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async addGuildProgress(user, guildId, payload = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/guilds/${guildId}/progress`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async respondToHelp(user, helpRequestId, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/help-requests/${helpRequestId}/responses`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async markHelpful(user, responseId) {
    const response = await fetch(`${API_BASE}/api/peer-learning/help-responses/${responseId}/mark-helpful`, {
      method: 'POST',
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async report(user, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/report`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async leaderboard(user) {
    const response = await fetch(`${API_BASE}/api/peer-learning/leaderboard`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async teacherQueue(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/teacher/queue${queryString(params)}`, {
      headers: await headersFor(user, {}, 'teacher')
    });
    return parseResponse(response);
  },

  async teacherAnalytics(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/teacher/analytics${queryString(params)}`, {
      headers: await headersFor(user, {}, 'teacher')
    });
    return parseResponse(response);
  },

  async safetySummary(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/teacher/safety-summary${queryString(params)}`, {
      headers: await headersFor(user, {}, 'teacher')
    });
    return parseResponse(response);
  },

  async exportAnalytics(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/teacher/analytics/export${queryString(params)}`, {
      headers: await headersFor(user, {}, 'teacher')
    });
    return parseTextResponse(response);
  },

  async moderationLogs(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/teacher/moderation-logs${queryString(params)}`, {
      headers: await headersFor(user, {}, 'teacher')
    });
    return parseResponse(response);
  },

  async moderationTimeline(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/teacher/timeline${queryString(params)}`, {
      headers: await headersFor(user, {}, 'teacher')
    });
    return parseResponse(response);
  },

  async exportModerationLogs(user, params = {}) {
    const response = await fetch(`${API_BASE}/api/peer-learning/teacher/moderation-logs/export${queryString(params)}`, {
      headers: await headersFor(user, {}, 'teacher')
    });
    return parseTextResponse(response);
  },

  async moderate(user, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/teacher/moderate`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }, 'teacher'),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async moderateBatch(user, payload) {
    const response = await fetch(`${API_BASE}/api/peer-learning/teacher/moderate/batch`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }, 'teacher'),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  }
};
