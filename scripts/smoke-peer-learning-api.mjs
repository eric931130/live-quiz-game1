import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const port = Number(process.env.SMOKE_PEER_API_PORT || 3102);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = await mkdtemp(path.join(tmpdir(), 'peer-learning-smoke-'));
const storePath = path.join(tempDir, 'question_banks_store.json');

const teacherHeaders = {
  'x-user-id': 'smoke-peer-teacher',
  'x-user-email': 'peer-teacher@example.test',
  'x-user-name': 'Peer Smoke Teacher',
  'x-user-role': 'teacher',
  'x-school-id': 'smoke-school'
};

const studentAHeaders = {
  'x-user-id': 'smoke-student-a',
  'x-user-email': 'student-a@example.test',
  'x-user-name': 'Student Alpha',
  'x-user-role': 'student',
  'x-school-id': 'smoke-school'
};

const studentBHeaders = {
  'x-user-id': 'smoke-student-b',
  'x-user-email': 'student-b@example.test',
  'x-user-name': 'Student Beta',
  'x-user-role': 'student',
  'x-school-id': 'smoke-school'
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function parseJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON, got: ${text.slice(0, 200)}`);
  }
}

async function request(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, options);
}

async function jsonRequest(pathname, { headers = {}, body, ...options } = {}) {
  const response = await request(pathname, {
    ...options,
    headers: {
      ...headers,
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await parseJson(response);
  return { response, json };
}

async function waitForHealth(deadlineMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    try {
      const response = await request('/api/health');
      if (response.ok) return parseJson(response);
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Backend did not become healthy in time.');
}

const child = spawn(process.execPath, ['backend/index.js'], {
  cwd: path.resolve('.'),
  env: {
    ...process.env,
    PORT: String(port),
    QUESTION_BANK_STORE_PATH: storePath,
    REQUIRE_FIREBASE_AUTH: 'false'
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  const health = await waitForHealth();
  assert(health.ok === true, 'Health check did not return ok.');

  const questionContext = {
    questionId: 'smoke-q-1',
    questionBankId: 'smoke-bank-1',
    activityId: 'smoke-activity-1',
    classId: 'smoke-class-1',
    questionPrompt: 'Why does 2 + 2 equal 4?',
    knowledgePoint: 'Addition'
  };

  const { response: explanationResponse, json: explanation } = await jsonRequest('/api/peer-learning/explanations', {
    method: 'POST',
    headers: studentAHeaders,
    body: {
      ...questionContext,
      explanationText: 'Add two and two by counting two more steps from two, which lands on four.'
    }
  });
  assert(explanationResponse.status === 201, `Explanation submit failed with ${explanationResponse.status}.`);
  assert(explanation.status === 'pending_review', 'Explanation should start pending teacher review.');

  const unauthorizedQueue = await request('/api/peer-learning/teacher/queue', { headers: studentAHeaders });
  assert(unauthorizedQueue.status === 403, 'Student should not access the teacher moderation queue.');

  const { response: helpResponse, json: helpRequest } = await jsonRequest('/api/peer-learning/help-requests', {
    method: 'POST',
    headers: studentAHeaders,
    body: {
      ...questionContext,
      message: 'I understand counting, but I need a hint about why addition combines quantities.'
    }
  });
  assert(helpResponse.status === 201, `Help request failed with ${helpResponse.status}.`);
  assert(helpRequest.status === 'open', 'Help request should start open.');

  const { response: responseResponse, json: helpRequestWithResponse } = await jsonRequest(`/api/peer-learning/help-requests/${helpRequest.id}/responses`, {
    method: 'POST',
    headers: studentBHeaders,
    body: {
      responseType: 'hint',
      content: 'Think of two apples and then place two more apples beside them before counting the total.'
    }
  });
  assert(responseResponse.status === 201, `Help response failed with ${responseResponse.status}.`);
  const helpAnswer = helpRequestWithResponse.responses?.[0];
  assert(helpAnswer?.id, 'Help response did not return an id.');
  assert(helpAnswer.status === 'pending_review', 'Help response should start pending review.');

  const { response: queueResponse, json: queue } = await jsonRequest('/api/peer-learning/teacher/queue', {
    headers: teacherHeaders
  });
  assert(queueResponse.ok, 'Teacher moderation queue failed.');
  assert(queue.explanations.some((item) => item.id === explanation.id), 'Pending explanation missing from moderation queue.');
  assert(queue.helpResponses.some((item) => item.id === helpAnswer.id), 'Pending help response missing from moderation queue.');

  const { response: moderateExplanationResponse } = await jsonRequest('/api/peer-learning/teacher/moderate', {
    method: 'POST',
    headers: teacherHeaders,
    body: {
      targetType: 'explanation',
      targetId: explanation.id,
      action: 'feature',
      reason: 'Clear structured peer explanation.'
    }
  });
  assert(moderateExplanationResponse.ok, 'Teacher explanation moderation failed.');

  const { response: moderateHelpResponse } = await jsonRequest('/api/peer-learning/teacher/moderate', {
    method: 'POST',
    headers: teacherHeaders,
    body: {
      targetType: 'helpResponse',
      targetId: helpAnswer.id,
      action: 'approve',
      reason: 'Helpful hint without giving away the answer.'
    }
  });
  assert(moderateHelpResponse.ok, 'Teacher help response moderation failed.');

  const { response: voteResponse, json: votedExplanation } = await jsonRequest(`/api/peer-learning/explanations/${explanation.id}/vote`, {
    method: 'POST',
    headers: studentBHeaders,
    body: { voteType: 'helpful' }
  });
  assert(voteResponse.ok, 'Voting on an approved explanation failed.');
  assert(votedExplanation.helpfulCount === 1, 'Helpful vote count did not update.');

  const { response: markHelpfulResponse, json: resolvedHelpRequest } = await jsonRequest(`/api/peer-learning/help-responses/${helpAnswer.id}/mark-helpful`, {
    method: 'POST',
    headers: studentAHeaders
  });
  assert(markHelpfulResponse.ok, 'Requester could not mark a response helpful.');
  assert(resolvedHelpRequest.status === 'resolved', 'Help request should become resolved.');

  const { response: studentQuestionResponse, json: studentQuestion } = await jsonRequest('/api/peer-learning/student-questions', {
    method: 'POST',
    headers: studentAHeaders,
    body: {
      classId: questionContext.classId,
      questionBankId: questionContext.questionBankId,
      prompt: 'Explain why peer-created questions should be reviewed before classmates use them.',
      type: 'short_answer',
      answer: 'Teacher review protects quality and safety.',
      explanation: 'Review helps catch incorrect answers, unsafe content, and unclear wording.',
      difficulty: 'medium',
      knowledgePoint: 'Moderation',
      creationReason: 'This checks whether students understand safe learning communities.'
    }
  });
  assert(studentQuestionResponse.status === 201, `Student-created question failed with ${studentQuestionResponse.status}.`);
  assert(studentQuestion.status === 'pending_review', 'Student-created question should start pending review.');

  const { json: queueWithStudentQuestion } = await jsonRequest('/api/peer-learning/teacher/queue', {
    headers: teacherHeaders
  });
  assert(queueWithStudentQuestion.studentQuestions.some((item) => item.id === studentQuestion.id), 'Student-created question missing from moderation queue.');

  const { response: moderateStudentQuestionResponse } = await jsonRequest('/api/peer-learning/teacher/moderate', {
    method: 'POST',
    headers: teacherHeaders,
    body: {
      targetType: 'studentQuestion',
      targetId: studentQuestion.id,
      action: 'approve',
      reason: 'Good student-created review question.'
    }
  });
  assert(moderateStudentQuestionResponse.ok, 'Teacher student-created question moderation failed.');

  const { response: voteStudentQuestionResponse, json: votedStudentQuestion } = await jsonRequest(`/api/peer-learning/student-questions/${studentQuestion.id}/vote`, {
    method: 'POST',
    headers: studentBHeaders,
    body: {
      clarity: 5,
      correctness: 5,
      helpfulness: 4,
      difficultyFit: 4
    }
  });
  assert(voteStudentQuestionResponse.ok, 'Student question quality vote failed.');
  assert(votedStudentQuestion.qualityScore > 0, 'Student question quality score did not update.');

  const { response: challengeResponse, json: challenge } = await jsonRequest('/api/peer-learning/challenges', {
    method: 'POST',
    headers: studentAHeaders,
    body: {
      classId: questionContext.classId,
      opponentStudentId: studentBHeaders['x-user-id'],
      opponentName: studentBHeaders['x-user-name'],
      mode: 'one_v_one',
      questionIds: [questionContext.questionId]
    }
  });
  assert(challengeResponse.status === 201, `Peer challenge failed with ${challengeResponse.status}.`);
  assert(challenge.status === 'pending', 'Direct peer challenge should start pending.');

  const { response: acceptChallengeResponse, json: acceptedChallenge } = await jsonRequest(`/api/peer-learning/challenges/${challenge.id}/respond`, {
    method: 'POST',
    headers: studentBHeaders,
    body: { action: 'accept' }
  });
  assert(acceptChallengeResponse.ok, 'Challenge accept failed.');
  assert(acceptedChallenge.status === 'accepted', 'Accepted challenge status mismatch.');

  const { response: completeChallengeResponse, json: completedChallenge } = await jsonRequest(`/api/peer-learning/challenges/${challenge.id}/complete`, {
    method: 'POST',
    headers: studentAHeaders,
    body: { scores: { challenger: 4, opponent: 3 } }
  });
  assert(completeChallengeResponse.ok, 'Challenge complete failed.');
  assert(completedChallenge.status === 'completed', 'Completed challenge status mismatch.');
  assert(completedChallenge.winnerId === studentAHeaders['x-user-id'], 'Challenge winner mismatch.');

  const { response: leaderboardResponse, json: leaderboard } = await jsonRequest('/api/peer-learning/leaderboard', {
    headers: studentAHeaders
  });
  assert(leaderboardResponse.ok, 'Peer leaderboard failed.');
  assert(leaderboard.boards.teamworkXp.length >= 2, 'Leaderboard should include peer participants.');

  const { response: analyticsResponse, json: analytics } = await jsonRequest('/api/peer-learning/teacher/analytics', {
    headers: teacherHeaders
  });
  assert(analyticsResponse.ok, 'Teacher peer analytics failed.');
  assert(analytics.totals.peerExplanations === 1, 'Analytics peer explanation total mismatch.');
  assert(analytics.totals.helpRequests === 1, 'Analytics help request total mismatch.');
  assert(analytics.totals.resolvedHelpRequests === 1, 'Analytics resolved help request total mismatch.');
  assert(analytics.totals.studentCreatedQuestions === 1, 'Analytics student-created question total mismatch.');
  assert(analytics.totals.peerChallenges === 1, 'Analytics peer challenge total mismatch.');
  assert(analytics.totals.completedPeerChallenges === 1, 'Analytics completed peer challenge total mismatch.');

  console.log(`Peer learning API smoke OK: ${baseUrl}`);
} finally {
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
  await rm(tempDir, { recursive: true, force: true });
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
}
