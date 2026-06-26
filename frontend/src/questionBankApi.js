const isLocalDevHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

const API_BASE = isLocalDevHost
  ? 'http://localhost:3001'
  : 'https://live-quiz-game1.onrender.com';

function getRole(user) {
  return user?.role || user?.customClaims?.role || 'player';
}

async function headersFor(user, extra = {}) {
  const token = user?.getIdToken ? await user.getIdToken() : null;
  return {
    'x-user-id': user?.uid || 'anonymous-teacher',
    'x-user-email': user?.email || '',
    'x-user-name': user?.displayName || user?.email || '',
    'x-user-role': getRole(user),
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

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return response.blob();
}

export const questionBankApi = {
  templateUrl() {
    return `${API_BASE}/api/question-banks/template`;
  },

  async list(user) {
    const response = await fetch(`${API_BASE}/api/question-banks`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async previewExcel(user, file, defaults) {
    const body = new FormData();
    body.append('file', file);
    body.append('defaults', JSON.stringify(defaults || {}));
    const response = await fetch(`${API_BASE}/api/question-banks/import/preview`, {
      method: 'POST',
      headers: await headersFor(user),
      body
    });
    return parseResponse(response);
  },

  async validate(user, questions, defaults) {
    const response = await fetch(`${API_BASE}/api/question-banks/validate-preview`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ questions, defaults })
    });
    return parseResponse(response);
  },

  async create(user, payload) {
    const response = await fetch(`${API_BASE}/api/question-banks`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    return parseResponse(response);
  },

  async commitImport(user, payload) {
    const response = await fetch(`${API_BASE}/api/question-banks/import/commit`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    return parseResponse(response);
  },

  async removeBank(user, bankId) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}`, {
      method: 'DELETE',
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async restoreBank(user, bankId, reason) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/restore`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reason })
    });
    return parseResponse(response);
  },

  async removeQuestion(user, bankId, questionId) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/questions/${questionId}`, {
      method: 'DELETE',
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async share(user, bankId, payload) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/share`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    return parseResponse(response);
  },

  async revokeShare(user, bankId, shareId) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/share/${shareId}`, {
      method: 'DELETE',
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async copy(user, bankId) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/copy`, {
      method: 'POST',
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async exportBank(user, bankId) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/export`, {
      method: 'POST',
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async schedule(user, bankId, context) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/schedule`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(context || {})
    });
    return parseResponse(response);
  },

  async createActivity(user, bankId, payload) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/activities`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  },

  async weaknessReport(user, bankId) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/weakness-report`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async healthReport(user, bankId) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/health-report`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async aiPreview(user, bankId, actionType) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/ai-preview`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ actionType })
    });
    return parseResponse(response);
  },

  async applyAiPreview(user, bankId, payload) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/ai-preview/apply`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    return parseResponse(response);
  },

  async versions(user, bankId) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/versions`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async compareVersion(user, bankId, versionId) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/versions/${versionId}/compare`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async restoreVersion(user, bankId, versionId, reason) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/versions/${versionId}/restore`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reason })
    });
    return parseResponse(response);
  },

  async audit(user, bankId) {
    const response = await fetch(`${API_BASE}/api/question-banks/${bankId}/audit`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async adminAudit(user) {
    const response = await fetch(`${API_BASE}/api/admin/audit-logs`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async adminBanks(user) {
    const response = await fetch(`${API_BASE}/api/admin/question-banks`, {
      headers: await headersFor(user)
    });
    return parseResponse(response);
  },

  async adminUpdateBankStatus(user, bankId, payload) {
    const response = await fetch(`${API_BASE}/api/admin/question-banks/${bankId}/status`, {
      method: 'POST',
      headers: await headersFor(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    return parseResponse(response);
  }
};

