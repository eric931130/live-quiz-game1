const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const storeFilePath = process.env.QUESTION_BANK_STORE_PATH || path.join(__dirname, 'question_banks_store.json');
const legacyBanksFilePath = path.join(__dirname, 'banks.json');
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MUTATION_WINDOW_MS = 60 * 1000;
const MUTATION_LIMIT = 80;
const mutationBuckets = new Map();
const ADMIN_ROLE_VALUES = new Set(['admin', 'developer', 'platform_owner', 'owner', 'platform_admin', 'superadmin']);
let firebaseAuthClient = null;
let firebaseAuthInitAttempted = false;

function envList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminRole(role) {
  return ADMIN_ROLE_VALUES.has(String(role || '').toLowerCase());
}

function hasTrustedAdminAccess(req, userId, email) {
  const allowedIds = envList('ADMIN_USER_IDS');
  const allowedEmails = envList('ADMIN_EMAILS');
  const normalizedUserId = String(userId || '').trim().toLowerCase();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const configuredSecret = String(process.env.ADMIN_API_SECRET || '').trim();
  const providedSecret = String(req.header('x-admin-secret') || '').trim();
  const secretMatches = Boolean(configuredSecret && providedSecret) &&
    Buffer.byteLength(providedSecret) === Buffer.byteLength(configuredSecret) &&
    crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(configuredSecret));

  return (
    allowedIds.includes(normalizedUserId) ||
    allowedEmails.includes(normalizedEmail) ||
    Boolean(secretMatches)
  );
}

function getFirebaseAuthClient() {
  if (firebaseAuthClient || firebaseAuthInitAttempted) return firebaseAuthClient;
  firebaseAuthInitAttempted = true;

  try {
    const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
    const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
    if (!serviceAccountJson && !projectId) return null;

    const appOptions = {};
    if (serviceAccountJson) {
      appOptions.credential = admin.credential.cert(JSON.parse(serviceAccountJson));
    } else {
      appOptions.credential = admin.credential.applicationDefault();
    }
    if (projectId) appOptions.projectId = projectId;

    if (!admin.apps.length) admin.initializeApp(appOptions);
    firebaseAuthClient = admin.auth();
  } catch (error) {
    console.error('Firebase Admin initialization failed:', error.message);
    firebaseAuthClient = null;
  }

  return firebaseAuthClient;
}

async function verifyFirebaseToken(req) {
  const authHeader = String(req.header('authorization') || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const authClient = getFirebaseAuthClient();
  if (!authClient) return null;
  try {
    return await authClient.verifyIdToken(match[1]);
  } catch (error) {
    console.warn('Firebase ID token verification failed:', error.message);
    return null;
  }
}

app.get('/api/health', (req, res) => {
  const store = readStore();
  res.json({
    ok: true,
    service: 'live-quiz-game-backend',
    timestamp: nowIso(),
    uptimeSeconds: Math.round(process.uptime()),
    counts: {
      questionBanks: store.questionBanks.length,
      shares: store.shares.length,
      activities: store.activities.length,
      studentAnswers: store.studentAnswers.length,
      peerExplanations: store.peerExplanations.length,
      helpRequests: store.helpRequests.length,
      helpResponses: store.helpResponses.length,
      studentCreatedQuestions: store.studentCreatedQuestions.length,
      peerChallenges: store.peerChallenges.length,
      peerReviewAssignments: store.peerReviewAssignments.length,
      wrongQuestionExchanges: store.wrongQuestionExchanges.length,
      learningGuilds: store.learningGuilds.length,
      peerLearningSettings: store.peerLearningSettings.length,
      auditLogs: store.auditLogs.length
    }
  });
});

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function readStore() {
  if (!fs.existsSync(storeFilePath)) {
    fs.writeFileSync(storeFilePath, JSON.stringify({ questionBanks: [], shares: [], auditLogs: [], activities: [], studentAnswers: [], questionAnalytics: [], peerExplanations: [], helpRequests: [], helpResponses: [], studentCreatedQuestions: [], peerChallenges: [], peerReviewAssignments: [], wrongQuestionExchanges: [], learningGuilds: [], peerLearningSettings: [], moderationLogs: [] }, null, 2));
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(storeFilePath, 'utf8'));
    return {
      questionBanks: Array.isArray(parsed.questionBanks) ? parsed.questionBanks : [],
      shares: Array.isArray(parsed.shares) ? parsed.shares : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      studentAnswers: Array.isArray(parsed.studentAnswers) ? parsed.studentAnswers : [],
      questionAnalytics: Array.isArray(parsed.questionAnalytics) ? parsed.questionAnalytics : [],
      peerExplanations: Array.isArray(parsed.peerExplanations) ? parsed.peerExplanations : [],
      helpRequests: Array.isArray(parsed.helpRequests) ? parsed.helpRequests : [],
      helpResponses: Array.isArray(parsed.helpResponses) ? parsed.helpResponses : [],
      studentCreatedQuestions: Array.isArray(parsed.studentCreatedQuestions) ? parsed.studentCreatedQuestions : [],
      peerChallenges: Array.isArray(parsed.peerChallenges) ? parsed.peerChallenges : [],
      peerReviewAssignments: Array.isArray(parsed.peerReviewAssignments) ? parsed.peerReviewAssignments : [],
      wrongQuestionExchanges: Array.isArray(parsed.wrongQuestionExchanges) ? parsed.wrongQuestionExchanges : [],
      learningGuilds: Array.isArray(parsed.learningGuilds) ? parsed.learningGuilds : [],
      peerLearningSettings: Array.isArray(parsed.peerLearningSettings) ? parsed.peerLearningSettings : [],
      moderationLogs: Array.isArray(parsed.moderationLogs) ? parsed.moderationLogs : []
    };
  } catch (error) {
    console.error('Unable to read question bank store:', error);
    return { questionBanks: [], shares: [], auditLogs: [], activities: [], studentAnswers: [], questionAnalytics: [], peerExplanations: [], helpRequests: [], helpResponses: [], studentCreatedQuestions: [], peerChallenges: [], peerReviewAssignments: [], wrongQuestionExchanges: [], learningGuilds: [], peerLearningSettings: [], moderationLogs: [] };
  }
}

function writeStore(store) {
  fs.writeFileSync(storeFilePath, JSON.stringify(store, null, 2));
}

async function getPrincipal(req) {
  const decodedToken = await verifyFirebaseToken(req);
  const tokenRole = decodedToken?.role || (decodedToken?.admin ? 'admin' : '');
  const requestedRole = String(tokenRole || req.header('x-user-role') || 'teacher').toLowerCase();
  const userId = String(decodedToken?.uid || req.header('x-user-id') || '').trim() || 'anonymous-teacher';
  const email = String(decodedToken?.email || req.header('x-user-email') || '').trim();
  const tokenClaimsAdmin = Boolean(decodedToken && (decodedToken.admin === true || isAdminRole(decodedToken.role)));
  const clientClaimsAdmin = isAdminRole(requestedRole);
  const trustedAdmin = clientClaimsAdmin && (tokenClaimsAdmin || hasTrustedAdminAccess(req, userId, email));
  const role = clientClaimsAdmin && !trustedAdmin ? 'teacher' : requestedRole;

  return {
    userId,
    role,
    requestedRole,
    trustedAdmin,
    authVerified: Boolean(decodedToken),
    authSource: decodedToken ? 'firebase_id_token' : 'headers',
    email,
    displayName: String(decodedToken?.name || req.header('x-user-name') || '').trim(),
    organizationId: String(req.header('x-organization-id') || req.header('x-school-id') || 'default-school').trim(),
    schoolId: String(req.header('x-school-id') || req.header('x-organization-id') || 'default-school').trim(),
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || ''
  };
}

function isAdmin(principal) {
  return Boolean(principal.trustedAdmin && isAdminRole(principal.role));
}

async function requirePrincipal(req, res, next) {
  req.principal = await getPrincipal(req);
  if (String(process.env.REQUIRE_FIREBASE_AUTH || '').toLowerCase() === 'true' && !req.principal.authVerified) {
    return res.status(401).json({ error: 'Firebase authentication is required.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.principal)) return res.status(403).json({ error: 'Admin permission required.' });
  next();
}

function isTeacherRole(principal) {
  return isAdmin(principal) || ['teacher', 'instructor', 'educator'].includes(String(principal.role || '').toLowerCase());
}

function requireTeacher(req, res, next) {
  if (!isTeacherRole(req.principal)) return res.status(403).json({ error: 'Teacher permission required.' });
  next();
}

async function rateLimitMutations(req, res, next) {
  const principal = req.principal || await getPrincipal(req);
  const key = `${principal.userId}:${Math.floor(Date.now() / MUTATION_WINDOW_MS)}`;
  const count = (mutationBuckets.get(key) || 0) + 1;
  mutationBuckets.set(key, count);
  if (count > MUTATION_LIMIT) return res.status(429).json({ error: 'Too many question bank requests. Please try again later.' });
  next();
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function sanitizeCell(value) {
  let text = normalizeText(value);
  text = text.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/\son\w+\s*=/gi, '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return text;
}

function normalizePromptKey(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '');
}

function activeShareFor(store, bank, principal) {
  return store.shares.find((share) => (
    share.questionBankId === bank.id &&
    share.sharedWithTeacherId === principal.userId &&
    !share.revokedAt &&
    (!share.expiresAt || new Date(share.expiresAt).getTime() > Date.now())
  ));
}

function getPermission(store, bank, principal) {
  const share = activeShareFor(store, bank, principal);
  const owner = bank.ownerTeacherId === principal.userId;
  const admin = isAdmin(principal);
  const visibleRecord = bank.status !== 'deleted' && !bank.deletedAt;
  const usableRecord = visibleRecord && !['locked', 'suspended'].includes(bank.status);

  return {
    isOwner: owner,
    isAdmin: admin,
    share,
    canView: admin || (visibleRecord && owner) || (visibleRecord && Boolean(share)),
    canUse: admin || (usableRecord && owner) || (usableRecord && Boolean(share?.canUse)),
    canEdit: admin || (usableRecord && owner),
    canDelete: admin || (usableRecord && owner),
    canShare: admin || (usableRecord && owner),
    canExport: admin || (usableRecord && owner) || (usableRecord && Boolean(share?.canExport)),
    canCopy: admin || (usableRecord && owner) || (usableRecord && Boolean(share?.canCopy))
  };
}

function publicBank(store, bank, principal) {
  const permission = getPermission(store, bank, principal);
  return {
    ...bank,
    questions: (bank.questions || []).filter((question) => !question.deletedAt),
    shares: permission.isOwner || permission.isAdmin
      ? store.shares.filter((share) => share.questionBankId === bank.id)
      : undefined,
    permission: {
      isOwner: permission.isOwner,
      canView: permission.canView,
      canUse: permission.canUse,
      canEdit: permission.canEdit,
      canDelete: permission.canDelete,
      canShare: permission.canShare,
      canExport: permission.canExport,
      canCopy: permission.canCopy,
      label: permission.isOwner ? '我擁有的題庫' : permission.share ? '分享給我的題庫' : permission.isAdmin ? '管理員檢視' : '無權限',
      notice: permission.isOwner ? '你可以編輯與管理此題庫。' : '你可以使用此題庫，但不能修改原始內容。'
    }
  };
}

function findBankOr404(store, id, res) {
  const bank = store.questionBanks.find((item) => item.id === id);
  if (!bank) {
    res.status(404).json({ error: 'Question bank not found.' });
    return null;
  }
  return bank;
}

function addAudit(store, principal, actionType, targetType, targetId, metadata = {}) {
  const log = {
    id: createId('audit'),
    actorUserId: principal.userId,
    actorRole: principal.role,
    actionType,
    targetType,
    targetId,
    targetQuestionBankId: metadata.targetQuestionBankId || (targetType === 'questionBank' ? targetId : undefined),
    targetQuestionId: metadata.targetQuestionId,
    metadata,
    createdAt: nowIso(),
    ipAddress: principal.ipAddress,
    userAgent: principal.userAgent
  };
  store.auditLogs.unshift(log);
  return log;
}

function headerKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s_*：:()（）-]/g, '');
}

function matchHeader(cell) {
  const key = headerKey(cell);
  if (!key) return null;

  const headerMap = [
    ['prompt', ['題目', '題幹', 'question', 'prompt', '問題']],
    ['answer', ['答案', '正解', 'answer', 'correctanswer']],
    ['optionA', ['選項a', 'a', 'opta', 'optiona']],
    ['optionB', ['選項b', 'b', 'optb', 'optionb']],
    ['optionC', ['選項c', 'c', 'optc', 'optionc']],
    ['optionD', ['選項d', 'd', 'optd', 'optiond']],
    ['type', ['題型', 'type', 'questiontype']],
    ['difficulty', ['難度', '難易度', 'difficulty']],
    ['course', ['課程', 'course']],
    ['chapter', ['章節', '章', 'chapter', 'unit', '單元']],
    ['section', ['小節', '節', 'section']],
    ['tags', ['標籤', 'tags', 'tag']],
    ['explanation', ['解析', '詳解', 'explanation']],
    ['knowledgePoint', ['知識點', '概念', 'knowledgepoint', 'concept']],
    ['teachingGoal', ['教學目標', '學習目標', 'teachinggoal', 'learningobjective']],
    ['estimatedSolvingTime', ['預估作答時間', '作答時間', 'estimatedtime', 'solvingtime']],
    ['sourceNote', ['來源備註', '來源', 'sourcenote', 'source']],
    ['rightsRiskStatus', ['權利風險', '授權狀態', 'rightsrisk', 'rightsstatus']]
  ];

  for (const [field, aliases] of headerMap) {
    if (aliases.some((alias) => key === headerKey(alias) || key.includes(headerKey(alias)))) return field;
  }
  return null;
}

function detectType(rawType, row) {
  const type = headerKey(rawType);
  if (['是非題', 'truefalse', 'tf', '判斷題'].some((item) => type.includes(headerKey(item)))) return 'true_false';
  if (['簡答題', 'shortanswer', 'short'].some((item) => type.includes(headerKey(item)))) return 'short_answer';
  if (['填空題', 'fillblank', 'blank'].some((item) => type.includes(headerKey(item)))) return 'fill_blank';
  if (['配合題', 'matching', 'match'].some((item) => type.includes(headerKey(item)))) return 'matching';
  if (['申論', '開放', 'essay', 'open'].some((item) => type.includes(headerKey(item)))) return 'essay';
  if (['選擇題', 'multiplechoice', 'multiple_choice', 'choice', 'mc'].some((item) => type.includes(headerKey(item)))) return 'multiple_choice';
  if (!row.optionC && !row.optionD) return 'true_false';
  return 'multiple_choice';
}

function normalizeAnswer(rawAnswer, options, type) {
  const raw = normalizeText(rawAnswer);
  const upper = raw.toUpperCase();

  if (type === 'true_false') {
    if (['O', 'TRUE', 'T', '1', 'YES', 'Y', '對', '是', 'A'].includes(upper)) return 'A';
    if (['X', 'FALSE', 'F', '0', 'NO', 'N', '錯', '否', 'B'].includes(upper)) return 'B';
    return upper || '';
  }

  if (type === 'multiple_choice') {
    const exact = Object.entries(options).find(([, value]) => normalizeText(value).toUpperCase() === upper);
    if (exact) return exact[0];
    if (['1', '2', '3', '4'].includes(upper)) return ['A', 'B', 'C', 'D'][Number(upper) - 1];
    const match = upper.match(/[A-D]/);
    return match ? match[0] : upper;
  }

  return raw;
}

function normalizeQuestion(row, defaults = {}) {
  const type = detectType(row.type || row.Type || defaults.type, row);
  const options = {
    A: sanitizeCell(row.optionA || row.OptA || row.A || (type === 'true_false' ? 'O（是／對）' : '')),
    B: sanitizeCell(row.optionB || row.OptB || row.B || (type === 'true_false' ? 'X（否／錯）' : '')),
    C: sanitizeCell(row.optionC || row.OptC || row.C || ''),
    D: sanitizeCell(row.optionD || row.OptD || row.D || '')
  };
  const prompt = sanitizeCell(row.prompt || row.Question || row.question);
  const answer = normalizeAnswer(row.answer || row.Answer, options, type);
  const tags = Array.isArray(row.tags)
    ? row.tags.map(sanitizeCell).filter(Boolean)
    : sanitizeCell(row.tags || defaults.tags || '').split(/[，,]/).map((tag) => tag.trim()).filter(Boolean);
  const chapter = sanitizeCell(row.chapter || row.Chapter || defaults.chapter || '未分類');
  const section = sanitizeCell(row.section || row.Section || defaults.section || '未分節');
  const knowledgePoint = sanitizeCell(row.knowledgePoint || row.concept || defaults.knowledgePoint || '');
  const teachingGoal = sanitizeCell(row.teachingGoal || row.learningObjective || defaults.teachingGoal || '');
  const sourceNote = sanitizeCell(row.sourceNote || row.source || '');
  const rightsRiskStatus = sanitizeCell(row.rightsRiskStatus || defaults.rightsRiskStatus || 'unchecked');
  const estimatedSolvingTime = Number(row.estimatedSolvingTime || defaults.estimatedSolvingTime || 60);

  return {
    id: row.id || createId('q'),
    type,
    prompt,
    options,
    answer,
    explanation: sanitizeCell(row.explanation || ''),
    difficulty: sanitizeCell(row.difficulty || defaults.difficulty || 'medium'),
    knowledgePoint,
    teachingGoal,
    estimatedSolvingTime: Number.isFinite(estimatedSolvingTime) && estimatedSolvingTime > 0 ? estimatedSolvingTime : 60,
    tags,
    course: sanitizeCell(row.course || defaults.course || ''),
    chapter,
    section,
    unit: sanitizeCell(row.unit || defaults.unit || ''),
    sourceNote,
    rightsRiskStatus,
    aiAssisted: Boolean(row.aiAssisted),
    analyticsMetadata: row.analyticsMetadata || {},
    createdAt: row.createdAt || nowIso(),
    updatedAt: nowIso(),
    deletedAt: row.deletedAt || null,
    Question: prompt,
    OptA: options.A,
    OptB: options.B,
    OptC: options.C,
    OptD: options.D,
    Answer: answer,
    Chapter: chapter,
    Section: section,
    Type: type
  };
}

function hasPossibleRightsRisk(question) {
  const text = [
    question.prompt,
    question.sourceNote,
    ...(question.tags || [])
  ].join(' ').toLowerCase();
  return ['課本', '出版社', '補習班', '考古題', '會考', '學測', '統測', 'toeic', '版權', 'copyright', 'textbook', 'publisher']
    .some((keyword) => text.includes(keyword));
}

function hasPossiblePersonalData(question) {
  const text = [question.prompt, question.explanation, question.sourceNote].join(' ');
  return /[\w.-]+@[\w.-]+\.\w+/.test(text) || /09\d{8}/.test(text) || /(學生姓名|身分證|地址|電話|家長姓名)/.test(text);
}

function countBy(items, picker) {
  return items.reduce((acc, item) => {
    const key = picker(item) || '未標示';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function percentage(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function generateQuestionBankHealthReport(bank) {
  const questions = (bank.questions || []).filter((question) => !question.deletedAt);
  const totalQuestions = questions.length;
  const duplicateKeys = new Map();
  questions.forEach((question) => {
    const key = normalizePromptKey(question.prompt || question.Question);
    if (!key) return;
    duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
  });

  const invalidQuestions = questions.filter((question) => {
    if (!question.prompt) return true;
    if (question.type !== 'essay' && !question.answer) return true;
    if (question.type === 'multiple_choice' && (!question.options?.A || !question.options?.B)) return true;
    return false;
  });
  const duplicateCandidates = Array.from(duplicateKeys.values()).filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
  const missingAnswers = questions.filter((question) => question.type !== 'essay' && !question.answer).length;
  const missingOptions = questions.filter((question) => question.type === 'multiple_choice' && (!question.options?.A || !question.options?.B)).length;
  const missingExplanations = questions.filter((question) => !question.explanation).length;
  const rightsRiskQuestions = questions.filter(hasPossibleRightsRisk).length;
  const personalDataCandidates = questions.filter(hasPossiblePersonalData).length;
  const difficultyDistribution = countBy(questions, (question) => question.difficulty);
  const typeDistribution = countBy(questions, (question) => question.type);
  const knowledgeDistribution = countBy(questions, (question) => question.knowledgePoint);
  const teachingGoalCoverage = questions.filter((question) => question.teachingGoal).length;
  const knowledgeCoverage = questions.filter((question) => question.knowledgePoint).length;
  const needsReview = invalidQuestions.length + duplicateCandidates + rightsRiskQuestions + personalDataCandidates;
  const qualityScore = Math.max(0, Math.min(100,
    100
    - invalidQuestions.length * 8
    - duplicateCandidates * 3
    - missingExplanations * 1
    - rightsRiskQuestions * 4
    - personalDataCandidates * 8
  ));

  const suggestions = [];
  if (missingExplanations) suggestions.push(`建議補上 ${missingExplanations} 題解析，讓學生複習時能理解錯因。`);
  if (duplicateCandidates) suggestions.push(`偵測到 ${duplicateCandidates} 題疑似重複，建議合併或改寫。`);
  if (knowledgeCoverage < totalQuestions) suggestions.push('建議補齊知識點標籤，方便後續依概念產生活動。');
  if (rightsRiskQuestions) suggestions.push('部分題目 may involve textbook, publisher, or exam-provider rights; please confirm authorization.');
  if (personalDataCandidates) suggestions.push('部分題目 potentially contains personal data; please remove student-identifiable information before use.');
  if (!suggestions.length) suggestions.push('題庫格式健康度良好，可進一步建立活動或分享給其他老師。');

  return {
    generatedAt: nowIso(),
    scope: 'phase_2_rule_based_ai_health_report',
    disclaimer: 'This report is an AI-assisted, rule-based review. It may flag possible rights concerns, but it is not a legal conclusion. Please confirm authorization before uploading, sharing, exporting, or copying content.',
    totals: {
      totalQuestions,
      validQuestions: totalQuestions - invalidQuestions.length,
      invalidQuestions: invalidQuestions.length,
      needsReview,
      duplicateCandidates,
      missingAnswers,
      missingOptions,
      missingExplanations,
      possibleRightsRisk: rightsRiskQuestions,
      possiblePersonalData: personalDataCandidates
    },
    qualityScore,
    difficultyDistribution,
    typeDistribution,
    knowledgeCoverage: {
      coveredQuestions: knowledgeCoverage,
      coverageRate: percentage(knowledgeCoverage, totalQuestions),
      distribution: knowledgeDistribution
    },
    teachingGoalCoverage: {
      coveredQuestions: teachingGoalCoverage,
      coverageRate: percentage(teachingGoalCoverage, totalQuestions)
    },
    classroomReadiness: {
      estimatedUsability: qualityScore >= 85 ? 'ready' : qualityScore >= 65 ? 'usable_with_review' : 'needs_cleanup',
      suggestedUse: qualityScore >= 85 ? '可用於即時測驗或課後複習。' : '建議先修正缺漏答案、解析與權利風險標記。'
    },
    suggestions
  };
}

function createAiPreview(bank, actionType) {
  const questions = (bank.questions || []).filter((question) => !question.deletedAt);
  const sample = questions.slice(0, 8);
  const previewItems = sample.map((question) => {
    const before = {
      id: question.id,
      prompt: question.prompt,
      explanation: question.explanation,
      tags: question.tags || [],
      difficulty: question.difficulty,
      knowledgePoint: question.knowledgePoint || ''
    };
    const inferredTags = Array.from(new Set([
      ...(question.tags || []),
      question.chapter,
      question.knowledgePoint,
      question.type === 'true_false' ? '判斷概念' : '',
      question.difficulty ? `難度:${question.difficulty}` : ''
    ].filter(Boolean)));
    const after = { ...before };

    if (actionType === 'auto_tag') {
      after.tags = inferredTags;
      after.knowledgePoint = before.knowledgePoint || question.chapter || bank.chapter || '待確認知識點';
    } else if (actionType === 'generate_explanations') {
      after.explanation = before.explanation || `建議解析：請引導學生回到「${question.knowledgePoint || question.chapter || bank.subject || '本題核心概念'}」，確認題幹關鍵字與答案選項的對應關係。`;
    } else if (actionType === 'improve_clarity') {
      after.prompt = before.prompt ? before.prompt.replace(/\s+/g, ' ').trim() : before.prompt;
      after.explanation = before.explanation || '建議補充解析，降低學生只記答案的風險。';
    } else if (actionType === 'check_rights_risk') {
      after.rightsRiskStatus = hasPossibleRightsRisk(question) ? 'potentially_requires_review' : 'no_obvious_signal';
      after.note = hasPossibleRightsRisk(question)
        ? 'This question may involve third-party teaching material or exam content; please confirm authorization.'
        : 'No obvious rights-risk signal was detected by the rule-based check.';
    }

    return { questionId: question.id, before, after, aiAssisted: true };
  });

  return {
    id: createId('ai_preview'),
    actionType,
    generatedAt: nowIso(),
    status: 'preview_only',
    disclaimer: 'AI-assisted suggestions are previews only. A teacher must review and confirm before any change is saved.',
    items: previewItems
  };
}

function validateQuestions(rawRows, principal, defaults = {}) {
  const store = readStore();
  const existingPrompts = new Set();
  store.questionBanks
    .filter((bank) => bank.ownerTeacherId === principal.userId && !bank.deletedAt)
    .forEach((bank) => (bank.questions || []).forEach((question) => {
      if (!question.deletedAt) existingPrompts.add(normalizePromptKey(question.prompt || question.Question));
    }));

  const seenPrompts = new Map();
  const rows = rawRows
    .filter((row) => row && Object.values(row).some((value) => normalizeText(value)))
    .map((row, index) => {
      const question = normalizeQuestion(row, defaults);
      const errors = [];
      const warnings = [];
      const promptKey = normalizePromptKey(question.prompt);

      if (!question.prompt) errors.push({ field: 'prompt', message: '缺少題目內容。' });
      if (!question.answer && question.type !== 'essay') warnings.push({ field: 'answer', message: '缺少答案；開放題以外建議填寫答案。' });
      if (!question.explanation) warnings.push({ field: 'explanation', message: '缺少解析，建議補充學生友善說明。', missingExplanation: true });
      if (!question.knowledgePoint) warnings.push({ field: 'knowledgePoint', message: '尚未標示知識點，建議於儲存前補上。', needsReview: true });
      if ([question.prompt, question.answer, question.explanation, question.sourceNote, ...Object.values(question.options || {})].some((value) => /^'[=+\-@]/.test(String(value || '')))) {
        warnings.push({ field: 'spreadsheetSafety', message: '偵測到疑似試算表公式，已作為純文字處理。', needsReview: true });
      }
      if (hasPossibleRightsRisk(question)) warnings.push({ field: 'rightsRiskStatus', message: '可能涉及教材、出版社或考試來源，請確認授權。', rightsRisk: true });
      if (hasPossiblePersonalData(question)) warnings.push({ field: 'prompt', message: '可能包含學生個資，請確認已移除或取得合法處理依據。', rightsRisk: true });
      if (question.type === 'multiple_choice') {
        if (!question.options.A || !question.options.B) errors.push({ field: 'options', message: '選擇題至少需要 A、B 兩個選項。' });
        if (question.answer && !['A', 'B', 'C', 'D'].includes(question.answer)) errors.push({ field: 'answer', message: '選擇題答案需為 A、B、C 或 D。' });
        if (question.answer && !question.options[question.answer]) warnings.push({ field: 'answer', message: '答案指向的選項目前沒有內容。' });
      }
      if (question.type === 'true_false' && question.answer && !['A', 'B'].includes(question.answer)) {
        errors.push({ field: 'answer', message: '是非題答案需為 O/對/A 或 X/錯/B。' });
      }
      if (promptKey && seenPrompts.has(promptKey)) warnings.push({ field: 'prompt', message: `與第 ${seenPrompts.get(promptKey)} 列重複。`, duplicate: true });
      if (promptKey && existingPrompts.has(promptKey)) warnings.push({ field: 'prompt', message: '與你既有題庫中的題目相似。', duplicate: true });
      if (promptKey && !seenPrompts.has(promptKey)) seenPrompts.set(promptKey, index + 1);

      return { rowNumber: index + 1, question, errors, warnings, valid: errors.length === 0 };
    });

  return {
    rows,
    summary: {
      totalRows: rows.length,
      validQuestions: rows.filter((row) => row.valid).length,
      invalidRows: rows.filter((row) => !row.valid).length,
      duplicateQuestions: rows.filter((row) => row.warnings.some((warning) => warning.duplicate)).length,
      missingExplanations: rows.filter((row) => row.warnings.some((warning) => warning.missingExplanation)).length,
      needsReview: rows.filter((row) => !row.valid || row.warnings.some((warning) => warning.needsReview || warning.rightsRisk)).length,
      possibleRightsRisk: rows.filter((row) => row.warnings.some((warning) => warning.rightsRisk)).length,
      questionsToCreate: rows.filter((row) => row.valid).length
    }
  };
}

function cellTextForImport(cell) {
  const value = cell?.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
  if (value.formula) return value.result ?? '';
  if (value.text) return value.text;
  if (value.result !== undefined) return value.result;
  return '';
}

async function parseWorkbookExcelJs(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer, {
    ignoreNodes: ['sheetProtection', 'dataValidations', 'conditionalFormatting', 'extLst']
  });
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('Excel file does not contain a worksheet.');

  const rows = [];
  const columnCount = Math.min(Math.max(worksheet.columnCount || 0, 1), 80);
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const rowValues = [];
    for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
      rowValues.push(cellTextForImport(row.getCell(columnIndex)));
    }
    rows.push(rowValues);
  });

  let headerRowIdx = -1;
  let columnMap = {};
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 25); rowIndex += 1) {
    const map = {};
    rows[rowIndex].forEach((cell, colIndex) => {
      const field = matchHeader(cell);
      if (field && map[field] === undefined) map[field] = colIndex;
    });
    if (map.prompt !== undefined && map.answer !== undefined) {
      headerRowIdx = rowIndex;
      columnMap = map;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error('Unable to identify required question and answer columns in the Excel file.');
  }

  return rows.slice(headerRowIdx + 1).map((row) => {
    const item = {};
    Object.entries(columnMap).forEach(([field, colIndex]) => {
      item[field] = sanitizeCell(row[colIndex]);
    });
    return item;
  });
}

async function workbookBufferFromRows(rows, sheetName = 'Question Bank') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Shi Shuo Xin Yu';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(sheetName);
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  worksheet.addRow(headers);
  rows.forEach((row) => {
    worksheet.addRow(headers.map((header) => sanitizeCell(row[header] ?? '')));
  });
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FF1A1A1A' } };
  worksheet.columns.forEach((column) => {
    const lengths = column.values.slice(1).map((value) => normalizeText(value).length + 2);
    column.width = Math.min(42, Math.max(12, ...lengths));
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function snapshotQuestionBank(bank) {
  return {
    id: bank.id,
    title: bank.title,
    description: bank.description,
    subject: bank.subject,
    gradeLevel: bank.gradeLevel,
    course: bank.course,
    unit: bank.unit,
    chapter: bank.chapter,
    knowledgePoints: bank.knowledgePoints || [],
    tags: bank.tags || [],
    visibility: bank.visibility,
    status: bank.status,
    version: bank.version,
    rightsRiskStatus: bank.rightsRiskStatus,
    questions: (bank.questions || []).filter((question) => !question.deletedAt).map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      options: question.options,
      answer: question.answer,
      explanation: question.explanation,
      difficulty: question.difficulty,
      knowledgePoint: question.knowledgePoint,
      teachingGoal: question.teachingGoal,
      tags: question.tags || [],
      rightsRiskStatus: question.rightsRiskStatus,
      aiAssisted: Boolean(question.aiAssisted)
    }))
  };
}

function createVersionRecord(bank, principal, versionNumber, versionName, changeSummary) {
  return {
    id: createId('version'),
    questionBankId: bank.id,
    versionNumber,
    versionName: sanitizeCell(versionName || `Version ${versionNumber}`),
    changeSummary: sanitizeCell(changeSummary || ''),
    snapshot: snapshotQuestionBank({ ...bank, version: versionNumber }),
    createdBy: principal.userId,
    createdAt: nowIso()
  };
}

function compareQuestionBankSnapshots(baseSnapshot, targetSnapshot) {
  const metadataFields = ['title', 'description', 'subject', 'gradeLevel', 'course', 'unit', 'chapter', 'visibility', 'status', 'rightsRiskStatus'];
  const metadataChanges = metadataFields
    .filter((field) => JSON.stringify(baseSnapshot?.[field] || '') !== JSON.stringify(targetSnapshot?.[field] || ''))
    .map((field) => ({
      field,
      current: baseSnapshot?.[field] || '',
      target: targetSnapshot?.[field] || ''
    }));

  const currentQuestions = new Map((baseSnapshot?.questions || []).map((question) => [question.id, question]));
  const targetQuestions = new Map((targetSnapshot?.questions || []).map((question) => [question.id, question]));
  const addedInTarget = [];
  const removedInTarget = [];
  const changedQuestions = [];

  targetQuestions.forEach((question, id) => {
    const current = currentQuestions.get(id);
    if (!current) {
      addedInTarget.push({ id, prompt: question.prompt });
      return;
    }
    const changedFields = ['type', 'prompt', 'answer', 'explanation', 'difficulty', 'knowledgePoint', 'rightsRiskStatus']
      .filter((field) => JSON.stringify(current[field] || '') !== JSON.stringify(question[field] || ''));
    if (changedFields.length) {
      changedQuestions.push({
        id,
        prompt: question.prompt || current.prompt,
        changedFields,
        currentPrompt: current.prompt,
        targetPrompt: question.prompt
      });
    }
  });

  currentQuestions.forEach((question, id) => {
    if (!targetQuestions.has(id)) removedInTarget.push({ id, prompt: question.prompt });
  });

  return {
    comparedAt: nowIso(),
    metadataChanges,
    questionSummary: {
      currentQuestionCount: currentQuestions.size,
      targetQuestionCount: targetQuestions.size,
      addedInTargetCount: addedInTarget.length,
      removedInTargetCount: removedInTarget.length,
      changedQuestionCount: changedQuestions.length
    },
    addedInTarget,
    removedInTarget,
    changedQuestions
  };
}

function restoreBankFromSnapshot(bank, snapshot) {
  const metadataFields = ['title', 'description', 'subject', 'gradeLevel', 'course', 'unit', 'chapter', 'knowledgePoints', 'tags', 'visibility', 'rightsRiskStatus'];
  metadataFields.forEach((field) => {
    if (snapshot[field] !== undefined) bank[field] = snapshot[field];
  });
  bank.name = bank.title;
  bank.status = snapshot.status && snapshot.status !== 'deleted' ? snapshot.status : 'active';
  bank.deletedAt = null;
  bank.questions = (snapshot.questions || []).map((question) => normalizeQuestion({
    id: question.id || createId('q'),
    type: question.type,
    prompt: question.prompt,
    optionA: question.options?.A,
    optionB: question.options?.B,
    optionC: question.options?.C,
    optionD: question.options?.D,
    answer: question.answer,
    explanation: question.explanation,
    difficulty: question.difficulty,
    knowledgePoint: question.knowledgePoint,
    teachingGoal: question.teachingGoal,
    tags: question.tags || [],
    rightsRiskStatus: question.rightsRiskStatus,
    aiAssisted: question.aiAssisted,
    createdAt: question.createdAt,
    deletedAt: null
  }, bank));
}

function ensureVersionHistory(bank, principal) {
  if (Array.isArray(bank.versions) && bank.versions.length > 0) return;
  bank.versions = [
    createVersionRecord(
      bank,
      principal,
      sanitizeCell(bank.version || '1.0'),
      'Baseline',
      'Initial version history record created for this question bank.'
    )
  ];
}

function nextMinorVersion(currentVersion) {
  const match = sanitizeCell(currentVersion || '1.0').match(/^(\d+)(?:\.(\d+))?/);
  if (!match) return '1.1';
  const major = Number(match[1]);
  const minor = Number(match[2] || 0);
  return `${major}.${minor + 1}`;
}

function applyAiPreviewToBank(bank, preview) {
  const beforeSnapshot = snapshotQuestionBank(bank);
  const updatedQuestionIds = [];

  (preview.items || []).forEach((item) => {
    const question = (bank.questions || []).find((candidate) => candidate.id === item.questionId && !candidate.deletedAt);
    if (!question) return;
    const after = item.after || {};
    if (typeof after.prompt === 'string') question.prompt = sanitizeCell(after.prompt);
    if (typeof after.explanation === 'string') question.explanation = sanitizeCell(after.explanation);
    if (Array.isArray(after.tags)) question.tags = after.tags.map(sanitizeCell).filter(Boolean);
    if (typeof after.difficulty === 'string') question.difficulty = sanitizeCell(after.difficulty);
    if (typeof after.knowledgePoint === 'string') question.knowledgePoint = sanitizeCell(after.knowledgePoint);
    if (typeof after.rightsRiskStatus === 'string') question.rightsRiskStatus = sanitizeCell(after.rightsRiskStatus);
    question.aiAssisted = true;
    question.updatedAt = nowIso();
    question.Question = question.prompt;
    updatedQuestionIds.push(question.id);
  });

  return { beforeSnapshot, updatedQuestionIds };
}

function createActivityCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function questionMatchesActivityFilters(question, filters = {}) {
  if (filters.difficulty && filters.difficulty !== 'any' && question.difficulty !== filters.difficulty) return false;
  if (filters.questionType && filters.questionType !== 'any' && question.type !== filters.questionType) return false;
  if (filters.knowledgePoint) {
    const haystack = [
      question.knowledgePoint,
      question.chapter,
      question.section,
      ...(question.tags || [])
    ].join(' ').toLowerCase();
    if (!haystack.includes(String(filters.knowledgePoint).toLowerCase())) return false;
  }
  return true;
}

function toPlayableQuestion(question) {
  return {
    id: question.id,
    questionBankId: question.questionBankId,
    Question: question.prompt || question.Question,
    prompt: question.prompt || question.Question,
    OptA: question.options?.A || question.OptA || '',
    OptB: question.options?.B || question.OptB || '',
    OptC: question.options?.C || question.OptC || '',
    OptD: question.options?.D || question.OptD || '',
    options: question.options || {
      A: question.OptA || '',
      B: question.OptB || '',
      C: question.OptC || '',
      D: question.OptD || ''
    },
    Answer: question.answer || question.Answer,
    answer: question.answer || question.Answer,
    explanation: question.explanation || '',
    Type: question.type,
    type: question.type,
    Chapter: question.chapter || '未分類',
    Section: question.section || '未分節',
    difficulty: question.difficulty,
    knowledgePoint: question.knowledgePoint,
    teachingGoal: question.teachingGoal,
    estimatedSolvingTime: question.estimatedSolvingTime
  };
}

function generateActivityFromQuestionBank(bank, principal, options = {}) {
  const activityType = sanitizeCell(options.activityType || 'live_quiz');
  const supportedTypes = ['quick_warmup', 'live_quiz', 'homework', 'formal_quiz', 'review_practice', 'group_battle', 'remedial_task', 'challenge_task'];
  const type = supportedTypes.includes(activityType) ? activityType : 'live_quiz';
  const requestedCount = Number(options.questionCount || 10);
  const questionCount = Number.isFinite(requestedCount) ? Math.max(1, Math.min(100, requestedCount)) : 10;
  const filters = {
    difficulty: sanitizeCell(options.difficulty || 'any'),
    questionType: sanitizeCell(options.questionType || 'any'),
    knowledgePoint: sanitizeCell(options.knowledgePoint || '')
  };
  const pool = (bank.questions || [])
    .filter((question) => !question.deletedAt)
    .filter((question) => questionMatchesActivityFilters(question, filters));
  const randomize = options.randomize !== false;
  const selected = (randomize ? [...pool].sort(() => 0.5 - Math.random()) : pool).slice(0, questionCount);
  if (!selected.length) {
    const error = new Error('No usable questions matched the selected activity settings.');
    error.status = 422;
    throw error;
  }

  const timestamp = nowIso();
  const activity = {
    id: createId('activity'),
    code: createActivityCode(),
    questionBankId: bank.id,
    questionBankTitle: bank.title,
    ownerTeacherId: bank.ownerTeacherId,
    createdBy: principal.userId,
    createdAt: timestamp,
    updatedAt: timestamp,
    activityType: type,
    title: sanitizeCell(options.title || `${bank.title} - ${type}`),
    status: 'draft',
    questionCount: selected.length,
    sourceQuestionIds: selected.map((question) => question.id),
    questions: selected.map((question) => toPlayableQuestion({ ...question, questionBankId: bank.id })),
    settings: {
      timeLimit: Math.max(10, Math.min(600, Number(options.timeLimit || 60))),
      randomize,
      showAnswer: options.showAnswer !== false,
      showExplanation: Boolean(options.showExplanation),
      allowRetry: Boolean(options.allowRetry),
      leaderboard: options.leaderboard !== false,
      participantMode: sanitizeCell(options.participantMode || 'individual'),
      anonymous: Boolean(options.anonymous),
      filters
    }
  };
  return activity;
}

function recordStudentAnswer(store, payload) {
  const question = payload.question || {};
  const questionBankId = sanitizeCell(payload.questionBankId || question.questionBankId || '');
  const questionId = sanitizeCell(payload.questionId || question.id || `${payload.roomId}_${payload.qIndex}`);
  const selectedAnswer = sanitizeCell(payload.selectedAnswer || '');
  const correctAnswer = sanitizeCell(payload.correctAnswer || question.Answer || question.answer || '');
  const isCorrect = Boolean(payload.isCorrect);
  const submittedAt = nowIso();
  const answer = {
    id: createId('answer'),
    studentId: sanitizeCell(payload.studentId || ''),
    studentName: sanitizeCell(payload.studentName || ''),
    teacherUserId: sanitizeCell(payload.teacherUserId || ''),
    classId: sanitizeCell(payload.classId || payload.roomId || ''),
    activityId: sanitizeCell(payload.activityId || ''),
    roomId: sanitizeCell(payload.roomId || ''),
    questionId,
    questionBankId,
    selectedAnswer,
    correctAnswer,
    isCorrect,
    timeSpent: Number(payload.timeSpent || 0),
    attemptCount: Number(payload.attemptCount || 1),
    score: Number(payload.score || 0),
    knowledgePoint: sanitizeCell(question.knowledgePoint || question.Chapter || question.chapter || ''),
    difficulty: sanitizeCell(question.difficulty || ''),
    questionPrompt: sanitizeCell(question.prompt || question.Question || ''),
    submittedAt
  };
  store.studentAnswers.unshift(answer);

  if (questionBankId && questionId) {
    let analytics = store.questionAnalytics.find((item) => item.questionId === questionId && item.questionBankId === questionBankId);
    if (!analytics) {
      analytics = {
        id: createId('analytics'),
        questionId,
        questionBankId,
        timesUsed: 0,
        correctCount: 0,
        totalAnswerTime: 0,
        commonWrongAnswers: {},
        detectedDifficulty: 'unknown',
        teachingInsight: '',
        updatedAt: submittedAt
      };
      store.questionAnalytics.push(analytics);
    }
    analytics.timesUsed += 1;
    analytics.correctCount += isCorrect ? 1 : 0;
    analytics.totalAnswerTime += answer.timeSpent;
    if (!isCorrect && selectedAnswer) {
      analytics.commonWrongAnswers[selectedAnswer] = (analytics.commonWrongAnswers[selectedAnswer] || 0) + 1;
    }
    analytics.accuracyRate = Math.round((analytics.correctCount / analytics.timesUsed) * 100);
    analytics.averageAnswerTime = Math.round((analytics.totalAnswerTime / analytics.timesUsed) * 10) / 10;
    analytics.detectedDifficulty = analytics.accuracyRate >= 80 ? 'easy' : analytics.accuracyRate >= 50 ? 'medium' : 'hard';
    analytics.teachingInsight = analytics.accuracyRate < 50
      ? 'Students may need a follow-up explanation or remedial practice for this concept.'
      : 'Performance is currently within an expected range.';
    analytics.updatedAt = submittedAt;
  }

  return answer;
}

function buildWeaknessReport(store, bank, principal) {
  const answers = (store.studentAnswers || []).filter((answer) => (
    answer.questionBankId === bank.id &&
    !answer.deletedAt &&
    (isAdmin(principal) || answer.teacherUserId === principal.userId)
  ));
  const totalAnswers = answers.length;
  const incorrectAnswers = answers.filter((answer) => !answer.isCorrect);
  const conceptStats = {};
  incorrectAnswers.forEach((answer) => {
    const key = answer.knowledgePoint || '未標示知識點';
    if (!conceptStats[key]) conceptStats[key] = { knowledgePoint: key, incorrect: 0, total: 0 };
    conceptStats[key].incorrect += 1;
  });
  answers.forEach((answer) => {
    const key = answer.knowledgePoint || '未標示知識點';
    if (!conceptStats[key]) conceptStats[key] = { knowledgePoint: key, incorrect: 0, total: 0 };
    conceptStats[key].total += 1;
  });
  const concepts = Object.values(conceptStats)
    .map((item) => ({
      ...item,
      incorrectRate: item.total ? Math.round((item.incorrect / item.total) * 100) : 0
    }))
    .sort((a, b) => b.incorrectRate - a.incorrectRate || b.incorrect - a.incorrect);
  const mostMissedConcept = concepts[0] || null;
  const weakQuestions = (store.questionAnalytics || [])
    .filter((item) => item.questionBankId === bank.id && item.timesUsed > 0)
    .sort((a, b) => (a.accuracyRate || 100) - (b.accuracyRate || 100))
    .slice(0, 8);

  return {
    generatedAt: nowIso(),
    questionBankId: bank.id,
    questionBankTitle: bank.title,
    totalAnswers,
    incorrectAnswers: incorrectAnswers.length,
    incorrectRate: totalAnswers ? Math.round((incorrectAnswers.length / totalAnswers) * 100) : 0,
    mostMissedConcept,
    concepts,
    weakQuestions,
    suggestedAction: mostMissedConcept
      ? `Review ${mostMissedConcept.knowledgePoint} and create a short follow-up practice.`
      : '尚無足夠答題資料，建議先用此題庫建立一次即時測驗。',
    recommendedFollowUp: mostMissedConcept
      ? `5-minute warm-up quiz for ${mostMissedConcept.knowledgePoint}`
      : '先累積學生作答資料'
  };
}

function visiblePeerExplanation(explanation, principal) {
  return (
    explanation.status === 'approved' ||
    explanation.teacherFeatured ||
    explanation.studentId === principal.userId ||
    isTeacherRole(principal)
  ) && explanation.status !== 'deleted';
}

function peerIdentity(principal, fallbackName = '') {
  return sanitizeCell(principal.displayName || fallbackName || principal.email || principal.userId || 'Student');
}

function addModerationLog(store, principal, actionType, targetType, targetId, reason = '') {
  const log = {
    id: createId('mod'),
    actorUserId: principal.userId,
    actorRole: principal.role,
    actionType,
    targetType,
    targetId,
    reason: sanitizeCell(reason),
    createdAt: nowIso()
  };
  store.moderationLogs.unshift(log);
  addAudit(store, principal, `PEER_${actionType}`, targetType, targetId, { moderationLogId: log.id, reason });
  return log;
}

function hydrateModerationLog(store, log) {
  const target = moderationTarget(store, log.targetType, log.targetId);
  return {
    ...log,
    targetStatus: target?.status || '',
    targetClassId: target?.classId || '',
    targetSummary: sanitizeCell(target?.name || target?.prompt || target?.message || target?.content || target?.knowledgePoint || target?.mode || '')
  };
}

function filteredModerationLogs(store, query = {}) {
  const classId = sanitizeCell(query.classId || '');
  const targetType = sanitizeCell(query.targetType || '');
  const actionType = sanitizeCell(query.actionType || '');
  const actorUserId = sanitizeCell(query.actorUserId || '');
  const limit = Math.max(1, Math.min(1000, Number(query.limit || 250)));
  return (store.moderationLogs || [])
    .map((log) => hydrateModerationLog(store, log))
    .filter((log) => !classId || log.targetClassId === classId)
    .filter((log) => !targetType || log.targetType === targetType)
    .filter((log) => !actionType || log.actionType === actionType)
    .filter((log) => !actorUserId || log.actorUserId === actorUserId)
    .slice(0, limit);
}

function csvValue(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function moderationLogsCsv(logs) {
  const headers = ['createdAt', 'actorUserId', 'actorRole', 'actionType', 'targetType', 'targetId', 'targetStatus', 'targetClassId', 'reason', 'targetSummary'];
  const rows = logs.map((log) => headers.map((header) => csvValue(log[header])).join(','));
  return [headers.join(','), ...rows].join('\n');
}

function peerClassId(query = {}) {
  return sanitizeCell(query.classId || '');
}

function byPeerClass(items = [], classId = '') {
  return items.filter((item) => !classId || item.classId === classId);
}

function publicPeerExplanation(explanation, principal) {
  const canModerate = isTeacherRole(principal);
  return {
    ...explanation,
    studentId: canModerate || explanation.studentId === principal.userId ? explanation.studentId : undefined,
    studentName: explanation.anonymous && !canModerate ? 'Anonymous classmate' : explanation.studentName,
    votes: undefined,
    myVote: (explanation.votes || []).find((vote) => vote.studentId === principal.userId)?.voteType || null,
    helpfulCount: explanation.helpfulCount || 0,
    clearCount: explanation.clearCount || 0,
    needsImprovementCount: explanation.needsImprovementCount || 0
  };
}

function publicHelpRequest(request, store, principal) {
  const canModerate = isTeacherRole(principal);
  const responses = (store.helpResponses || [])
    .filter((response) => response.helpRequestId === request.id && response.status !== 'deleted')
    .filter((response) => (
      response.status === 'approved' ||
      response.responderStudentId === principal.userId ||
      request.studentId === principal.userId ||
      canModerate
    ))
    .map((response) => ({
      ...response,
      responderStudentId: canModerate || response.responderStudentId === principal.userId ? response.responderStudentId : undefined,
      responderName: response.anonymous && !canModerate ? 'Anonymous helper' : response.responderName
    }));
  return {
    ...request,
    studentId: canModerate || request.studentId === principal.userId ? request.studentId : undefined,
    studentName: request.anonymous && !canModerate ? 'Anonymous classmate' : request.studentName,
    responses
  };
}

function publicStudentQuestion(question, principal) {
  const canModerate = isTeacherRole(principal);
  return {
    ...question,
    creatorStudentId: canModerate || question.creatorStudentId === principal.userId ? question.creatorStudentId : undefined,
    creatorName: question.anonymous && !canModerate ? 'Anonymous creator' : question.creatorName,
    votes: undefined,
    myVote: (question.votes || []).find((vote) => vote.studentId === principal.userId) || null
  };
}

function visibleStudentQuestion(question, principal) {
  return (
    question.status === 'approved' ||
    question.status === 'added_to_teacher_bank' ||
    question.creatorStudentId === principal.userId ||
    isTeacherRole(principal)
  ) && question.status !== 'deleted';
}

function publicPeerChallenge(challenge, principal) {
  const canModerate = isTeacherRole(principal);
  const isParticipant = [challenge.challengerStudentId, challenge.opponentStudentId].includes(principal.userId);
  if (!canModerate && !isParticipant && challenge.status !== 'completed') return null;
  return {
    ...challenge,
    challengerStudentId: canModerate || challenge.challengerStudentId === principal.userId ? challenge.challengerStudentId : undefined,
    opponentStudentId: canModerate || challenge.opponentStudentId === principal.userId ? challenge.opponentStudentId : undefined,
    scores: challenge.status === 'completed' || canModerate || isParticipant ? challenge.scores : undefined
  };
}

function publicPeerReviewAssignment(assignment, principal) {
  const canModerate = isTeacherRole(principal);
  const isParticipant = [assignment.reviewerStudentId, assignment.revieweeStudentId].includes(principal.userId);
  if (!canModerate && !isParticipant && assignment.status !== 'submitted') return null;
  return {
    ...assignment,
    reviewerStudentId: canModerate || assignment.reviewerStudentId === principal.userId ? assignment.reviewerStudentId : undefined,
    revieweeStudentId: canModerate || assignment.revieweeStudentId === principal.userId ? assignment.revieweeStudentId : undefined,
    reviewerName: assignment.anonymous && !canModerate && assignment.revieweeStudentId === principal.userId ? 'Anonymous reviewer' : assignment.reviewerName,
    revieweeName: assignment.anonymous && !canModerate && assignment.reviewerStudentId === principal.userId ? 'Anonymous classmate' : assignment.revieweeName
  };
}

function publicWrongQuestionExchange(exchange, principal) {
  const canModerate = isTeacherRole(principal);
  const isParticipant = [exchange.studentAId, exchange.studentBId].includes(principal.userId);
  if (!canModerate && !isParticipant && exchange.status !== 'completed') return null;
  return {
    ...exchange,
    studentAId: canModerate || exchange.studentAId === principal.userId ? exchange.studentAId : undefined,
    studentBId: canModerate || exchange.studentBId === principal.userId ? exchange.studentBId : undefined
  };
}

function publicLearningGuild(guild, principal) {
  const canModerate = isTeacherRole(principal);
  return {
    ...guild,
    members: (guild.members || []).map((member) => ({
      ...member,
      studentId: canModerate || member.studentId === principal.userId ? member.studentId : undefined
    }))
  };
}

const PEER_LEARNING_SETTING_KEYS = [
  'peerExplanations',
  'helpRequests',
  'studentQuestions',
  'peerChallenges',
  'peerReviews',
  'wrongExchanges',
  'learningGuilds',
  'allowAnonymous',
  'moderationRequired'
];

function defaultPeerLearningSettings(classId = '') {
  return {
    classId: sanitizeCell(classId || ''),
    peerExplanations: true,
    helpRequests: true,
    studentQuestions: true,
    peerChallenges: true,
    peerReviews: true,
    wrongExchanges: true,
    learningGuilds: true,
    allowAnonymous: false,
    moderationRequired: true,
    freeChat: false,
    safetyNote: 'Peer learning is structured around questions, explanations, reviews, wrong-question repair, and guild missions. Teachers keep final moderation control.'
  };
}

function getPeerLearningSettings(store, classId = '') {
  const normalizedClassId = sanitizeCell(classId || '');
  const saved = (store.peerLearningSettings || []).find((item) => item.classId === normalizedClassId);
  return {
    ...defaultPeerLearningSettings(normalizedClassId),
    ...(saved || {})
  };
}

function upsertPeerLearningSettings(store, classId, patch, principal) {
  const normalizedClassId = sanitizeCell(classId || '');
  const next = getPeerLearningSettings(store, normalizedClassId);
  PEER_LEARNING_SETTING_KEYS.forEach((key) => {
    if (typeof patch[key] === 'boolean') next[key] = patch[key];
  });
  next.updatedAt = nowIso();
  next.updatedBy = principal.userId;
  const existingIndex = (store.peerLearningSettings || []).findIndex((item) => item.classId === normalizedClassId);
  if (existingIndex >= 0) store.peerLearningSettings[existingIndex] = next;
  else {
    store.peerLearningSettings = store.peerLearningSettings || [];
    store.peerLearningSettings.unshift({ ...next, createdAt: nowIso(), createdBy: principal.userId });
  }
  return next;
}

function ensurePeerFeatureEnabled(store, classId, feature, principal) {
  const settings = getPeerLearningSettings(store, classId);
  if (settings[feature] !== false) return { ok: true, settings };
  return {
    ok: false,
    status: 403,
    error: `${feature} is disabled by the teacher for this class.`,
    settings
  };
}

function computePeerLearningAnalytics(store, query = {}) {
  const classId = peerClassId(query);
  const explanations = byPeerClass(store.peerExplanations || [], classId).filter((item) => item.status !== 'deleted');
  const helpRequests = byPeerClass(store.helpRequests || [], classId).filter((item) => item.status !== 'deleted');
  const helpResponses = byPeerClass(store.helpResponses || [], classId).filter((item) => item.status !== 'deleted');
  const studentQuestions = byPeerClass(store.studentCreatedQuestions || [], classId).filter((item) => item.status !== 'deleted');
  const peerChallenges = byPeerClass(store.peerChallenges || [], classId).filter((item) => item.status !== 'deleted');
  const peerReviews = byPeerClass(store.peerReviewAssignments || [], classId).filter((item) => item.status !== 'deleted');
  const wrongExchanges = byPeerClass(store.wrongQuestionExchanges || [], classId).filter((item) => item.status !== 'deleted');
  const guilds = byPeerClass(store.learningGuilds || [], classId).filter((item) => item.status !== 'deleted');
  const students = {};
  const concepts = {};

  function studentStat(id, name) {
    const key = id || 'anonymous';
    if (!students[key]) {
      students[key] = {
        studentId: key,
        studentName: sanitizeCell(name || key),
        explanationsSubmitted: 0,
        explanationsApproved: 0,
        helpfulVotes: 0,
        helpRequestsCreated: 0,
        helpRequestsResolved: 0,
        helpResponsesSubmitted: 0,
        helpfulResponses: 0,
        studentQuestionsCreated: 0,
        studentQuestionsApproved: 0,
        challengesCompleted: 0,
        peerReviewsCompleted: 0,
        wrongExchangesCompleted: 0,
        guildXp: 0,
        teamworkXp: 0
      };
    }
    return students[key];
  }

  explanations.forEach((explanation) => {
    const stat = studentStat(explanation.studentId, explanation.studentName);
    stat.explanationsSubmitted += 1;
    if (explanation.status === 'approved') stat.explanationsApproved += 1;
    stat.helpfulVotes += explanation.helpfulCount || 0;
    stat.teamworkXp += 8 + (explanation.status === 'approved' ? 12 : 0) + (explanation.teacherFeatured ? 20 : 0) + ((explanation.helpfulCount || 0) * 3) + ((explanation.clearCount || 0) * 2);
    const concept = explanation.knowledgePoint || 'Uncategorized';
    concepts[concept] = concepts[concept] || { knowledgePoint: concept, helpRequests: 0, explanations: 0 };
    concepts[concept].explanations += 1;
  });

  helpRequests.forEach((request) => {
    const stat = studentStat(request.studentId, request.studentName);
    stat.helpRequestsCreated += 1;
    if (request.status === 'resolved') stat.helpRequestsResolved += 1;
    stat.teamworkXp += request.status === 'resolved' ? 8 : 2;
    const concept = request.knowledgePoint || 'Uncategorized';
    concepts[concept] = concepts[concept] || { knowledgePoint: concept, helpRequests: 0, explanations: 0 };
    concepts[concept].helpRequests += 1;
  });

  helpResponses.forEach((response) => {
    const stat = studentStat(response.responderStudentId, response.responderName);
    stat.helpResponsesSubmitted += 1;
    if (response.helpfulMarked) stat.helpfulResponses += 1;
    stat.teamworkXp += 6 + (response.helpfulMarked ? 12 : 0) + (response.teacherApproved ? 8 : 0);
  });

  studentQuestions.forEach((question) => {
    const stat = studentStat(question.creatorStudentId, question.creatorName);
    stat.studentQuestionsCreated += 1;
    if (['approved', 'added_to_teacher_bank'].includes(question.status)) stat.studentQuestionsApproved += 1;
    stat.teamworkXp += 10 + (['approved', 'added_to_teacher_bank'].includes(question.status) ? 18 : 0) + Math.round(question.qualityScore || 0);
    const concept = question.knowledgePoint || 'Uncategorized';
    concepts[concept] = concepts[concept] || { knowledgePoint: concept, helpRequests: 0, explanations: 0, studentQuestions: 0 };
    concepts[concept].studentQuestions = (concepts[concept].studentQuestions || 0) + 1;
  });

  peerChallenges.forEach((challenge) => {
    if (challenge.status !== 'completed') return;
    [challenge.challengerStudentId, challenge.opponentStudentId].filter(Boolean).forEach((studentId) => {
      const name = studentId === challenge.challengerStudentId ? challenge.challengerName : challenge.opponentName;
      const stat = studentStat(studentId, name);
      stat.challengesCompleted += 1;
      stat.teamworkXp += Number(challenge.xpAwards?.[studentId] || 10);
    });
  });

  peerReviews.forEach((assignment) => {
    const reviewer = studentStat(assignment.reviewerStudentId, assignment.reviewerName);
    if (assignment.status === 'submitted') reviewer.peerReviewsCompleted += 1;
    reviewer.teamworkXp += assignment.status === 'submitted' ? 14 : 4;
    if (assignment.revieweeStudentId) studentStat(assignment.revieweeStudentId, assignment.revieweeName);
  });

  wrongExchanges.forEach((exchange) => {
    if (exchange.status !== 'completed') return;
    [exchange.studentAId, exchange.studentBId].filter(Boolean).forEach((studentId) => {
      const name = studentId === exchange.studentAId ? exchange.studentAName : exchange.studentBName;
      const stat = studentStat(studentId, name);
      stat.wrongExchangesCompleted += 1;
      stat.teamworkXp += 16;
    });
    const concept = exchange.knowledgePoint || 'Uncategorized';
    concepts[concept] = concepts[concept] || { knowledgePoint: concept, helpRequests: 0, explanations: 0, studentQuestions: 0, wrongExchanges: 0 };
    concepts[concept].wrongExchanges = (concepts[concept].wrongExchanges || 0) + 1;
  });

  guilds.forEach((guild) => {
    (guild.members || []).forEach((member) => {
      const stat = studentStat(member.studentId, member.studentName);
      stat.guildXp += Number(member.xp || 0);
      stat.teamworkXp += Number(member.xp || 0);
    });
  });

  const leaderboard = Object.values(students)
    .sort((a, b) => b.teamworkXp - a.teamworkXp)
    .slice(0, 20)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    generatedAt: nowIso(),
    classId,
    totals: {
      peerExplanations: explanations.length,
      approvedExplanations: explanations.filter((item) => item.status === 'approved').length,
      helpRequests: helpRequests.length,
      resolvedHelpRequests: helpRequests.filter((item) => item.status === 'resolved').length,
      helpResponses: helpResponses.length,
      studentCreatedQuestions: studentQuestions.length,
      approvedStudentQuestions: studentQuestions.filter((item) => ['approved', 'added_to_teacher_bank'].includes(item.status)).length,
      peerChallenges: peerChallenges.length,
      completedPeerChallenges: peerChallenges.filter((item) => item.status === 'completed').length,
      peerReviewAssignments: peerReviews.length,
      submittedPeerReviews: peerReviews.filter((item) => item.status === 'submitted').length,
      wrongQuestionExchanges: wrongExchanges.length,
      completedWrongQuestionExchanges: wrongExchanges.filter((item) => item.status === 'completed').length,
      learningGuilds: guilds.length,
      pendingModeration: explanations.filter((item) => ['pending_review', 'flagged', 'returned_for_revision'].includes(item.status)).length +
        helpRequests.filter((item) => item.status === 'flagged').length +
        helpResponses.filter((item) => ['pending_review', 'flagged'].includes(item.status)).length +
        studentQuestions.filter((item) => ['pending_review', 'flagged', 'returned_for_revision'].includes(item.status)).length +
        peerChallenges.filter((item) => item.status === 'flagged').length +
        peerReviews.filter((item) => item.status === 'flagged').length +
        wrongExchanges.filter((item) => item.status === 'flagged').length +
        guilds.filter((item) => item.status === 'flagged' || item.moderationLocked).length
    },
    leaderboard,
    conceptHotspots: Object.values(concepts)
      .sort((a, b) => ((b.helpRequests || 0) + (b.explanations || 0) + (b.studentQuestions || 0) + (b.wrongExchanges || 0)) - ((a.helpRequests || 0) + (a.explanations || 0) + (a.studentQuestions || 0) + (a.wrongExchanges || 0)))
      .slice(0, 12),
    badges: {
      clearExplainers: leaderboard.filter((item) => item.explanationsApproved >= 2 || item.helpfulVotes >= 3).slice(0, 5),
      helpfulClassmates: leaderboard.filter((item) => item.helpfulResponses >= 1 || item.helpResponsesSubmitted >= 2).slice(0, 5),
      questionDesigners: leaderboard.filter((item) => item.studentQuestionsApproved >= 1 || item.studentQuestionsCreated >= 2).slice(0, 5),
      peerReviewers: leaderboard.filter((item) => item.peerReviewsCompleted >= 1).slice(0, 5),
      wrongQuestionRepair: leaderboard.filter((item) => item.wrongExchangesCompleted >= 1).slice(0, 5)
    }
  };
}

function peerLearningAnalyticsCsv(analytics) {
  const headers = [
    'rank',
    'studentId',
    'studentName',
    'teamworkXp',
    'explanationsSubmitted',
    'explanationsApproved',
    'helpfulVotes',
    'helpRequestsCreated',
    'helpRequestsResolved',
    'helpResponsesSubmitted',
    'helpfulResponses',
    'studentQuestionsCreated',
    'studentQuestionsApproved',
    'challengesCompleted',
    'peerReviewsCompleted',
    'wrongExchangesCompleted',
    'guildXp'
  ];
  const rows = (analytics.leaderboard || []).map((item) => headers.map((header) => csvValue(item[header])).join(','));
  return [headers.join(','), ...rows].join('\n');
}

function buildPeerLearningSafetySummary(store, query = {}) {
  const classId = peerClassId(query);
  const analytics = computePeerLearningAnalytics(store, { classId });
  const logs = filteredModerationLogs(store, { ...query, classId, limit: 1000 });
  const reports = logs.filter((log) => log.actionType === 'REPORT_CONTENT');
  const topReportedTypes = Object.entries(reports.reduce((acc, log) => {
    acc[log.targetType] = (acc[log.targetType] || 0) + 1;
    return acc;
  }, {}))
    .map(([targetType, count]) => ({ targetType, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const lockedGuilds = byPeerClass(store.learningGuilds || [], classId)
    .filter((guild) => guild.status !== 'deleted' && guild.moderationLocked)
    .map((guild) => ({
      id: guild.id,
      name: guild.name,
      classId: guild.classId,
      memberCount: (guild.members || []).length,
      lastProgressNote: guild.lastProgressNote || '',
      teacherReviewNote: guild.teacherReviewNote || ''
    }));
  const studentsNeedingSupport = (analytics.leaderboard || [])
    .filter((student) => student.helpRequestsCreated > student.helpRequestsResolved || student.helpRequestsCreated > student.helpResponsesSubmitted + 1)
    .slice(0, 8);
  const recommendations = [];
  if (analytics.totals.pendingModeration > 0) recommendations.push('Review pending or flagged peer-learning items before the next live activity.');
  if (reports.length >= 3) recommendations.push('Check repeated reports for patterns by target type, class, or concept before reopening public visibility.');
  if (lockedGuilds.length > 0) recommendations.push('Follow up with locked learning guilds and document the resolution note before unlocking.');
  if ((analytics.conceptHotspots || []).length > 0) recommendations.push('Use the top hot concepts for a short reteaching prompt or structured peer-help mission.');
  if (recommendations.length === 0) recommendations.push('No urgent peer-learning safety signals were detected for this filter.');

  return {
    generatedAt: nowIso(),
    classId,
    totals: analytics.totals,
    riskIndicators: {
      recentReports: reports.length,
      pendingModeration: analytics.totals.pendingModeration,
      lockedGuilds: lockedGuilds.length,
      reportRate: analytics.totals.pendingModeration > 0 ? Number((reports.length / analytics.totals.pendingModeration).toFixed(2)) : reports.length
    },
    topReportedTypes,
    lockedGuilds,
    studentsNeedingSupport,
    conceptHotspots: analytics.conceptHotspots,
    recommendedActions: recommendations
  };
}

function moderationTarget(store, targetType, targetId) {
  const collections = {
    explanation: store.peerExplanations,
    helpRequest: store.helpRequests,
    helpResponse: store.helpResponses,
    studentQuestion: store.studentCreatedQuestions,
    peerChallenge: store.peerChallenges,
    peerReview: store.peerReviewAssignments,
    wrongExchange: store.wrongQuestionExchanges,
    learningGuild: store.learningGuilds
  };
  const collection = collections[targetType];
  if (!collection) return null;
  return collection.find((item) => item.id === targetId);
}

function applyPeerModerationAction(store, principal, payload = {}) {
  const targetType = sanitizeCell(payload.targetType || '');
  const targetId = sanitizeCell(payload.targetId || '');
  const action = sanitizeCell(payload.action || '');
  const reason = sanitizeCell(payload.reason || '');
  const target = moderationTarget(store, targetType, targetId);
  if (!target) return { ok: false, status: 404, error: 'Moderation target not found.', targetType, targetId };
  if (targetType === 'learningGuild' && ['lock', 'unlock'].includes(action)) {
    target.moderationLocked = action === 'lock';
    target.updatedAt = nowIso();
    target.teacherReviewNote = reason;
    addModerationLog(store, principal, `MODERATE_${action.toUpperCase()}`, targetType, targetId, reason);
    return { ok: true, target, targetType, targetId, action };
  }
  const statusByAction = {
    approve: 'approved',
    feature: 'approved',
    hide: 'hidden',
    reject: 'rejected',
    return: 'returned_for_revision',
    delete: 'deleted',
    flag: 'flagged',
    add_to_teacher_bank: 'added_to_teacher_bank'
  };
  if (!statusByAction[action]) return { ok: false, status: 400, error: 'Unsupported moderation action.', targetType, targetId };
  if (targetType === 'studentQuestion' && action === 'add_to_teacher_bank') {
    const bank = (store.questionBanks || []).find((item) => item.id === target.questionBankId && !item.deletedAt);
    if (!bank) return { ok: false, status: 400, error: 'A target teacher question bank is required before adding this student question.', targetType, targetId };
    const permission = getPermission(store, bank, principal);
    if (!permission.canEdit) return { ok: false, status: 403, error: 'Only the question bank owner or admin can add this student question to the bank.', targetType, targetId };
    const addedQuestion = normalizeQuestion({
      prompt: target.prompt,
      type: target.type,
      optionA: target.options?.A,
      optionB: target.options?.B,
      optionC: target.options?.C,
      optionD: target.options?.D,
      answer: target.answer,
      explanation: target.explanation,
      difficulty: target.difficulty,
      knowledgePoint: target.knowledgePoint,
      teachingGoal: target.creationReason,
      sourceNote: target.sourceNote,
      tags: ['student-created', target.creatorName].filter(Boolean)
    }, bank);
    bank.questions = bank.questions || [];
    bank.questions.push(addedQuestion);
    bank.updatedAt = nowIso();
    bank.updatedBy = principal.userId;
    target.addedQuestionId = addedQuestion.id;
    target.addedToTeacherBankAt = nowIso();
    addAudit(store, principal, 'ADD_STUDENT_CREATED_QUESTION_TO_BANK', 'question', addedQuestion.id, {
      targetQuestionBankId: bank.id,
      targetQuestionId: addedQuestion.id,
      studentQuestionId: target.id
    });
  }
  target.status = statusByAction[action];
  target.teacherReviewNote = reason;
  target.updatedAt = nowIso();
  if (targetType === 'explanation' && action === 'feature') target.teacherFeatured = true;
  if (targetType === 'helpResponse' && action === 'approve') target.teacherApproved = true;
  addModerationLog(store, principal, `MODERATE_${action.toUpperCase()}`, targetType, targetId, reason);
  return { ok: true, target, targetType, targetId, action };
}

function createQuestionBank({ principal, metadata, questions, legalAcknowledged }) {
  const timestamp = nowIso();
  const id = createId('qb');
  const title = sanitizeCell(metadata.title || metadata.name || '未命名題庫');
  const bank = {
    id,
    title,
    name: title,
    description: sanitizeCell(metadata.description || ''),
    ownerTeacherId: principal.userId,
    ownerTeacherName: principal.displayName || principal.email || principal.userId,
    createdBy: principal.userId,
    updatedBy: principal.userId,
    organizationId: sanitizeCell(metadata.organizationId || principal.organizationId),
    schoolId: sanitizeCell(metadata.schoolId || principal.schoolId),
    subject: sanitizeCell(metadata.subject || ''),
    gradeLevel: sanitizeCell(metadata.gradeLevel || ''),
    course: sanitizeCell(metadata.course || ''),
    unit: sanitizeCell(metadata.unit || ''),
    chapter: sanitizeCell(metadata.chapter || ''),
    knowledgePoints: Array.isArray(metadata.knowledgePoints)
      ? metadata.knowledgePoints.map(sanitizeCell).filter(Boolean)
      : sanitizeCell(metadata.knowledgePoints || '').split(/[，,]/).map((item) => item.trim()).filter(Boolean),
    tags: Array.isArray(metadata.tags) ? metadata.tags.map(sanitizeCell).filter(Boolean) : sanitizeCell(metadata.tags || '').split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
    visibility: sanitizeCell(metadata.visibility || 'private'),
    usageScenarios: Array.isArray(metadata.usageScenarios) ? metadata.usageScenarios.map(sanitizeCell).filter(Boolean) : [],
    version: sanitizeCell(metadata.version || '1.0'),
    rightsRiskStatus: sanitizeCell(metadata.rightsRiskStatus || 'unchecked'),
    sharingSettings: { allowExport: Boolean(metadata.allowExport), allowCopy: Boolean(metadata.allowCopy) },
    permissionMetadata: { ownerOnlyEdit: true, sharedUsersReadOnlyByDefault: true },
    legalAcknowledgedAt: legalAcknowledged ? timestamp : null,
    legalAcknowledgedBy: legalAcknowledged ? principal.userId : null,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    originalQuestionBankId: metadata.originalQuestionBankId || null,
    originalOwnerTeacherId: metadata.originalOwnerTeacherId || null,
    copiedFrom: metadata.copiedFrom || null,
    copiedAt: metadata.copiedAt || null,
    attributionNotice: metadata.attributionNotice || '',
    versions: [],
    questions
  };
  bank.versions.push(createVersionRecord(bank, principal, bank.version, 'Version 1.0', 'Question bank created.'));
  return bank;
}

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.xlsx') return cb(new Error('Unsupported file format. Please upload an .xlsx file.'));
    cb(null, true);
  }
});

app.use('/api/question-banks', requirePrincipal);
app.use('/api/admin', requirePrincipal);
app.use('/api/peer-learning', requirePrincipal);

app.get('/api/question-banks/template', async (req, res) => {
  const excelBuffer = await workbookBufferFromRows([
    {
      type: 'multiple_choice',
      question: 'Sample question prompt',
      optionA: 'Option A',
      optionB: 'Option B',
      optionC: 'Option C',
      optionD: 'Option D',
      answer: 'B',
      difficulty: 'medium',
      course: 'Course name',
      chapter: 'Chapter name',
      section: 'Section name',
      tags: 'tag1,tag2',
      explanation: 'Optional explanation',
      knowledgePoint: 'Knowledge point',
      teachingGoal: 'Teaching goal',
      estimatedSolvingTime: '60',
      sourceNote: 'Source or rights note'
    }
  ], 'Question Bank Template');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="question-bank-template.xlsx"');
  return res.send(excelBuffer);
});

app.get('/api/question-banks', (req, res) => {
  const store = readStore();
  const banks = store.questionBanks
    .filter((bank) => getPermission(store, bank, req.principal).canView)
    .map((bank) => publicBank(store, bank, req.principal));
  res.json(banks);
});

app.get('/api/question-banks/:id', (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const permission = getPermission(store, bank, req.principal);
  if (!permission.canView) return res.status(403).json({ error: 'You do not have access to this question bank.' });
  addAudit(store, req.principal, 'VIEW_QUESTION_BANK', 'questionBank', bank.id, { targetQuestionBankId: bank.id });
  writeStore(store);
  res.json(publicBank(store, bank, req.principal));
});

app.post('/api/question-banks/validate-preview', rateLimitMutations, (req, res) => {
  res.json(validateQuestions(req.body.questions || [], req.principal, req.body.defaults || {}));
});

app.post('/api/question-banks/import/preview', rateLimitMutations, (req, res) => {
  excelUpload.single('file')(req, res, async (error) => {
    if (error) return res.status(400).json({ error: error.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    try {
      const defaults = req.body.defaults ? JSON.parse(req.body.defaults) : {};
      res.json(validateQuestions(await parseWorkbookExcelJs(req.file.buffer), req.principal, defaults));
    } catch (parseError) {
      res.status(400).json({ error: parseError.message });
    }
  });
});

app.post('/api/question-banks/import/commit', rateLimitMutations, (req, res) => {
  const { metadata = {}, rows = [], legalAcknowledged } = req.body;
  if (!legalAcknowledged) return res.status(400).json({ error: 'Legal acknowledgement is required before import.' });

  const preview = validateQuestions(rows.map((row) => row.question || row), req.principal, metadata);
  if (preview.summary.invalidRows > 0) return res.status(422).json({ error: 'Import contains validation errors.', preview });

  const store = readStore();
  const bank = createQuestionBank({ principal: req.principal, metadata, questions: preview.rows.map((row) => row.question), legalAcknowledged });
  store.questionBanks.push(bank);
  addAudit(store, req.principal, 'IMPORT_QUESTION_BANK', 'questionBank', bank.id, {
    targetQuestionBankId: bank.id,
    summary: preview.summary,
    legalAcknowledged: true
  });
  writeStore(store);
  res.status(201).json(publicBank(store, bank, req.principal));
});

app.post('/api/question-banks', rateLimitMutations, (req, res) => {
  const { metadata = {}, questions = [], legalAcknowledged } = req.body;
  if (!legalAcknowledged) return res.status(400).json({ error: 'Legal acknowledgement is required.' });

  const preview = validateQuestions(questions, req.principal, metadata);
  if (preview.summary.invalidRows > 0) return res.status(422).json({ error: 'Question bank contains validation errors.', preview });

  const store = readStore();
  const bank = createQuestionBank({ principal: req.principal, metadata, questions: preview.rows.map((row) => row.question), legalAcknowledged });
  store.questionBanks.push(bank);
  addAudit(store, req.principal, 'CREATE_QUESTION_BANK', 'questionBank', bank.id, { targetQuestionBankId: bank.id, count: bank.questions.length });
  writeStore(store);
  res.status(201).json(publicBank(store, bank, req.principal));
});

app.patch('/api/question-banks/:id', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const permission = getPermission(store, bank, req.principal);
  if (!permission.canEdit) return res.status(403).json({ error: 'Only the owner or admin can edit this question bank.' });

  const before = { title: bank.title, tags: bank.tags, chapter: bank.chapter, visibility: bank.visibility };
  ['title', 'description', 'subject', 'gradeLevel', 'course', 'chapter', 'visibility'].forEach((field) => {
    if (req.body[field] !== undefined) bank[field] = sanitizeCell(req.body[field]);
  });
  if (req.body.tags !== undefined) bank.tags = Array.isArray(req.body.tags) ? req.body.tags.map(sanitizeCell) : sanitizeCell(req.body.tags).split(/[，,]/).filter(Boolean);
  bank.name = bank.title;
  bank.updatedAt = nowIso();
  bank.updatedBy = req.principal.userId;
  addAudit(store, req.principal, 'UPDATE_QUESTION_BANK_METADATA', 'questionBank', bank.id, {
    targetQuestionBankId: bank.id,
    before,
    after: { title: bank.title, tags: bank.tags, chapter: bank.chapter, visibility: bank.visibility }
  });
  writeStore(store);
  res.json(publicBank(store, bank, req.principal));
});

app.post('/api/question-banks/:id/questions', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  if (!getPermission(store, bank, req.principal).canEdit) return res.status(403).json({ error: 'Only the owner or admin can add questions.' });

  const preview = validateQuestions([req.body], req.principal, bank);
  if (preview.summary.invalidRows > 0) return res.status(422).json({ error: 'Question has validation errors.', preview });
  const question = preview.rows[0].question;
  bank.questions.push(question);
  bank.updatedAt = nowIso();
  bank.updatedBy = req.principal.userId;
  addAudit(store, req.principal, 'ADD_QUESTION', 'question', question.id, { targetQuestionBankId: bank.id, targetQuestionId: question.id });
  writeStore(store);
  res.status(201).json(question);
});

app.patch('/api/question-banks/:id/questions/:questionId', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  if (!getPermission(store, bank, req.principal).canEdit) return res.status(403).json({ error: 'Only the owner or admin can edit questions.' });

  const questionIndex = (bank.questions || []).findIndex((question) => question.id === req.params.questionId && !question.deletedAt);
  if (questionIndex === -1) return res.status(404).json({ error: 'Question not found.' });
  const before = bank.questions[questionIndex];
  bank.questions[questionIndex] = normalizeQuestion({ ...before, ...req.body, id: before.id, createdAt: before.createdAt }, bank);
  bank.updatedAt = nowIso();
  bank.updatedBy = req.principal.userId;
  addAudit(store, req.principal, 'UPDATE_QUESTION', 'question', before.id, {
    targetQuestionBankId: bank.id,
    targetQuestionId: before.id,
    before,
    after: bank.questions[questionIndex]
  });
  writeStore(store);
  res.json(bank.questions[questionIndex]);
});

app.delete('/api/question-banks/:id/questions/:questionId', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  if (!getPermission(store, bank, req.principal).canEdit) return res.status(403).json({ error: 'Only the owner or admin can delete questions.' });

  const question = (bank.questions || []).find((item) => item.id === req.params.questionId && !item.deletedAt);
  if (!question) return res.status(404).json({ error: 'Question not found.' });
  question.deletedAt = nowIso();
  question.updatedAt = nowIso();
  bank.updatedAt = nowIso();
  bank.updatedBy = req.principal.userId;
  addAudit(store, req.principal, 'DELETE_QUESTION', 'question', question.id, { targetQuestionBankId: bank.id, targetQuestionId: question.id, reason: req.body?.reason });
  writeStore(store);
  res.json({ ok: true });
});

app.delete('/api/question-banks/:id', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  if (!getPermission(store, bank, req.principal).canDelete) return res.status(403).json({ error: 'Only the owner or admin can delete this question bank.' });

  bank.deletedAt = nowIso();
  bank.status = 'deleted';
  bank.updatedAt = nowIso();
  bank.updatedBy = req.principal.userId;
  addAudit(store, req.principal, 'DELETE_QUESTION_BANK', 'questionBank', bank.id, { targetQuestionBankId: bank.id, reason: req.body?.reason });
  writeStore(store);
  res.json({ ok: true });
});

app.post('/api/question-banks/:id/restore', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const canRestore = isAdmin(req.principal) || bank.ownerTeacherId === req.principal.userId;
  if (!canRestore) return res.status(403).json({ error: 'Only the owner or admin can restore this question bank.' });
  const beforeSnapshot = snapshotQuestionBank(bank);
  bank.deletedAt = null;
  bank.status = 'active';
  bank.updatedAt = nowIso();
  bank.updatedBy = req.principal.userId;
  addAudit(store, req.principal, 'RESTORE_QUESTION_BANK', 'questionBank', bank.id, {
    targetQuestionBankId: bank.id,
    beforeSnapshot,
    afterSnapshot: snapshotQuestionBank(bank),
    reason: sanitizeCell(req.body?.reason || '')
  });
  writeStore(store);
  res.json(publicBank(store, bank, req.principal));
});

app.post('/api/question-banks/:id/share', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  if (!getPermission(store, bank, req.principal).canShare) return res.status(403).json({ error: 'Only the owner can share this question bank.' });
  if (!req.body.legalAcknowledged) return res.status(400).json({ error: 'Legal acknowledgement is required before sharing.' });

  const sharedWithTeacherId = sanitizeCell(req.body.sharedWithTeacherId || req.body.email);
  if (!sharedWithTeacherId) return res.status(400).json({ error: 'A teacher id or email is required.' });

  const share = {
    id: createId('share'),
    questionBankId: bank.id,
    ownerTeacherId: bank.ownerTeacherId,
    sharedWithTeacherId,
    sharedWithTeacherName: sanitizeCell(req.body.sharedWithTeacherName || sharedWithTeacherId),
    permissionLevel: sanitizeCell(req.body.permissionLevel || 'use_readonly'),
    canUse: true,
    canExport: Boolean(req.body.canExport),
    canCopy: Boolean(req.body.canCopy),
    expiresAt: req.body.expiresAt || null,
    createdAt: nowIso(),
    revokedAt: null,
    createdBy: req.principal.userId
  };
  store.shares.push(share);
  addAudit(store, req.principal, 'SHARE_QUESTION_BANK', 'questionBankShare', share.id, { targetQuestionBankId: bank.id, share });
  writeStore(store);
  res.status(201).json(share);
});

app.delete('/api/question-banks/:id/share/:shareId', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  if (!getPermission(store, bank, req.principal).canShare) return res.status(403).json({ error: 'Only the owner can revoke sharing.' });

  const share = store.shares.find((item) => item.id === req.params.shareId && item.questionBankId === bank.id && !item.revokedAt);
  if (!share) return res.status(404).json({ error: 'Share not found.' });
  share.revokedAt = nowIso();
  addAudit(store, req.principal, 'REVOKE_QUESTION_BANK_SHARE', 'questionBankShare', share.id, { targetQuestionBankId: bank.id, share });
  writeStore(store);
  res.json({ ok: true });
});

app.post('/api/question-banks/:id/export', rateLimitMutations, async (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  if (!getPermission(store, bank, req.principal).canExport) return res.status(403).json({ error: 'Export is not allowed for this question bank.' });

  const rows = (bank.questions || []).filter((question) => !question.deletedAt).map((question) => ({
    題型: question.type,
    題目: question.prompt,
    選項A: question.options?.A || '',
    選項B: question.options?.B || '',
    選項C: question.options?.C || '',
    選項D: question.options?.D || '',
    答案: question.answer,
    難易度: question.difficulty,
    課程: question.course,
    章節: question.chapter,
    小節: question.section,
    標籤: (question.tags || []).join(','),
    解析: question.explanation
  }));
  const excelBuffer = await workbookBufferFromRows(rows, 'Question Bank Export');
  addAudit(store, req.principal, 'EXPORT_QUESTION_BANK', 'questionBank', bank.id, { targetQuestionBankId: bank.id, count: rows.length });
  writeStore(store);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(bank.title)}.xlsx"`);
  return res.send(excelBuffer);
});

app.post('/api/question-banks/:id/copy', rateLimitMutations, (req, res) => {
  const store = readStore();
  const source = findBankOr404(store, req.params.id, res);
  if (!source) return;
  if (!getPermission(store, source, req.principal).canCopy) return res.status(403).json({ error: 'Copying is not allowed for this question bank.' });

  const metadata = {
    ...source,
    title: `${source.title}（副本）`,
    originalQuestionBankId: source.id,
    originalOwnerTeacherId: source.ownerTeacherId,
    copiedFrom: source.id,
    copiedAt: nowIso(),
    attributionNotice: `本題庫複製自 ${source.ownerTeacherName || source.ownerTeacherId} 的「${source.title}」，分享或複製不代表轉讓底層智慧財產權。`
  };
  const questions = (source.questions || []).filter((question) => !question.deletedAt).map((question) => normalizeQuestion({ ...question, id: createId('q') }, source));
  const bank = createQuestionBank({ principal: req.principal, metadata, questions, legalAcknowledged: true });
  store.questionBanks.push(bank);
  addAudit(store, req.principal, 'COPY_QUESTION_BANK', 'questionBank', bank.id, { targetQuestionBankId: bank.id, sourceQuestionBankId: source.id });
  writeStore(store);
  res.status(201).json(publicBank(store, bank, req.principal));
});

app.post('/api/question-banks/:id/schedule', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  if (!getPermission(store, bank, req.principal).canUse) return res.status(403).json({ error: 'You cannot use this question bank in class or assignments.' });
  addAudit(store, req.principal, 'SCHEDULE_QUESTION_BANK', 'questionBank', bank.id, { targetQuestionBankId: bank.id, context: req.body || {} });
  writeStore(store);
  res.json({ ok: true });
});

app.post('/api/question-banks/:id/activities', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const permission = getPermission(store, bank, req.principal);
  if (!permission.canUse) return res.status(403).json({ error: 'You cannot create classroom activities from this question bank.' });

  try {
    const activity = generateActivityFromQuestionBank(bank, req.principal, req.body || {});
    store.activities.unshift(activity);
    addAudit(store, req.principal, 'CREATE_ACTIVITY_FROM_QUESTION_BANK', 'activity', activity.id, {
      targetQuestionBankId: bank.id,
      activityId: activity.id,
      activityType: activity.activityType,
      questionCount: activity.questionCount,
      sharedAccess: !permission.isOwner && Boolean(permission.share)
    });
    writeStore(store);
    res.status(201).json(activity);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.get('/api/question-banks/:id/activities', (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  if (!getPermission(store, bank, req.principal).canUse) return res.status(403).json({ error: 'You cannot view activities for this question bank.' });
  res.json((store.activities || []).filter((activity) => activity.questionBankId === bank.id && activity.createdBy === req.principal.userId));
});

app.get('/api/question-banks/:id/weakness-report', (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  if (!getPermission(store, bank, req.principal).canUse) return res.status(403).json({ error: 'You cannot view learning reports for this question bank.' });
  const report = buildWeaknessReport(store, bank, req.principal);
  addAudit(store, req.principal, 'VIEW_CLASS_WEAKNESS_REPORT', 'questionBank', bank.id, {
    targetQuestionBankId: bank.id,
    totalAnswers: report.totalAnswers,
    incorrectRate: report.incorrectRate
  });
  writeStore(store);
  res.json(report);
});

app.get('/api/question-banks/:id/wrong-answers', (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  if (!getPermission(store, bank, req.principal).canUse) return res.status(403).json({ error: 'You cannot view wrong answers for this question bank.' });
  const studentId = sanitizeCell(req.query.studentId || '');
  const answers = (store.studentAnswers || []).filter((answer) => (
    answer.questionBankId === bank.id &&
    !answer.isCorrect &&
    answer.teacherUserId === req.principal.userId &&
    (!studentId || answer.studentId === studentId)
  ));
  res.json(answers.slice(0, 200));
});

app.get('/api/question-banks/:id/health-report', (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const permission = getPermission(store, bank, req.principal);
  if (!permission.canView) return res.status(403).json({ error: 'You do not have access to this question bank.' });

  const report = generateQuestionBankHealthReport(bank);
  addAudit(store, req.principal, 'RUN_AI_HEALTH_REPORT', 'questionBank', bank.id, {
    targetQuestionBankId: bank.id,
    qualityScore: report.qualityScore,
    needsReview: report.totals.needsReview
  });
  writeStore(store);
  res.json(report);
});

app.post('/api/question-banks/:id/ai-preview', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const permission = getPermission(store, bank, req.principal);
  if (!permission.canEdit) return res.status(403).json({ error: 'Only the owner can run AI modification previews for this question bank.' });

  const actionType = sanitizeCell(req.body.actionType || '');
  const allowedActions = ['auto_tag', 'generate_explanations', 'improve_clarity', 'check_rights_risk'];
  if (!allowedActions.includes(actionType)) return res.status(400).json({ error: 'Unsupported AI preview action.' });

  const preview = createAiPreview(bank, actionType);
  addAudit(store, req.principal, 'RUN_AI_PREVIEW', 'questionBank', bank.id, {
    targetQuestionBankId: bank.id,
    actionType,
    previewItemCount: preview.items.length
  });
  writeStore(store);
  res.json(preview);
});

app.post('/api/question-banks/:id/ai-preview/apply', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const permission = getPermission(store, bank, req.principal);
  if (!permission.canEdit) return res.status(403).json({ error: 'Only the owner can apply AI-assisted changes to this question bank.' });
  if (!req.body.teacherConfirmed) return res.status(400).json({ error: 'Teacher confirmation is required before applying AI-assisted changes.' });
  if (!req.body.legalAcknowledged) return res.status(400).json({ error: 'Rights and policy acknowledgement is required before applying AI-assisted changes.' });

  const actionType = sanitizeCell(req.body.actionType || '');
  const allowedActions = ['auto_tag', 'generate_explanations', 'improve_clarity', 'check_rights_risk'];
  if (!allowedActions.includes(actionType)) return res.status(400).json({ error: 'Unsupported AI preview action.' });

  ensureVersionHistory(bank, req.principal);
  const preview = createAiPreview(bank, actionType);
  const { beforeSnapshot, updatedQuestionIds } = applyAiPreviewToBank(bank, preview);
  const nextVersion = nextMinorVersion(bank.version);
  bank.version = nextVersion;
  bank.updatedAt = nowIso();
  bank.updatedBy = req.principal.userId;
  const versionRecord = createVersionRecord(
    bank,
    req.principal,
    nextVersion,
    `AI ${actionType}`,
    `Teacher confirmed AI-assisted ${actionType} changes for ${updatedQuestionIds.length} questions.`
  );
  bank.versions.unshift(versionRecord);
  const afterSnapshot = snapshotQuestionBank(bank);

  addAudit(store, req.principal, 'APPLY_AI_MODIFICATION', 'questionBank', bank.id, {
    targetQuestionBankId: bank.id,
    actionType,
    versionNumber: nextVersion,
    updatedQuestionIds,
    beforeSnapshot,
    afterSnapshot,
    legalAcknowledged: true,
    teacherConfirmed: true
  });
  writeStore(store);
  res.json({
    bank: publicBank(store, bank, req.principal),
    version: versionRecord,
    updatedQuestionIds
  });
});

app.get('/api/question-banks/:id/versions', (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const permission = getPermission(store, bank, req.principal);
  if (!permission.isOwner && !permission.isAdmin) return res.status(403).json({ error: 'Only owner or admin can view version history.' });
  ensureVersionHistory(bank, req.principal);
  writeStore(store);
  res.json(bank.versions || []);
});

app.get('/api/question-banks/:id/versions/:versionId/compare', (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const permission = getPermission(store, bank, req.principal);
  if (!permission.isOwner && !permission.isAdmin) return res.status(403).json({ error: 'Only owner or admin can compare version history.' });
  ensureVersionHistory(bank, req.principal);
  const version = (bank.versions || []).find((item) => item.id === req.params.versionId);
  if (!version) return res.status(404).json({ error: 'Version not found.' });
  writeStore(store);
  res.json({
    version,
    comparison: compareQuestionBankSnapshots(snapshotQuestionBank(bank), version.snapshot)
  });
});

app.post('/api/question-banks/:id/versions/:versionId/restore', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const canRestore = isAdmin(req.principal) || bank.ownerTeacherId === req.principal.userId;
  if (!canRestore) return res.status(403).json({ error: 'Only owner or admin can restore a question bank version.' });
  ensureVersionHistory(bank, req.principal);
  const version = (bank.versions || []).find((item) => item.id === req.params.versionId);
  if (!version) return res.status(404).json({ error: 'Version not found.' });

  const beforeSnapshot = snapshotQuestionBank(bank);
  restoreBankFromSnapshot(bank, version.snapshot);
  const nextVersion = nextMinorVersion(bank.version);
  bank.version = nextVersion;
  bank.updatedAt = nowIso();
  bank.updatedBy = req.principal.userId;
  const restoredVersion = createVersionRecord(
    bank,
    req.principal,
    nextVersion,
    `Restored ${version.versionNumber}`,
    `Restored from ${version.versionName || version.versionNumber}.`
  );
  bank.versions.unshift(restoredVersion);
  addAudit(store, req.principal, 'RESTORE_QUESTION_BANK_VERSION', 'questionBank', bank.id, {
    targetQuestionBankId: bank.id,
    restoredFromVersionId: version.id,
    restoredFromVersionNumber: version.versionNumber,
    beforeSnapshot,
    afterSnapshot: snapshotQuestionBank(bank),
    reason: sanitizeCell(req.body?.reason || '')
  });
  writeStore(store);
  res.json({
    bank: publicBank(store, bank, req.principal),
    version: restoredVersion
  });
});

app.get('/api/question-banks/:id/audit', (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const permission = getPermission(store, bank, req.principal);
  if (!permission.isOwner && !permission.isAdmin) return res.status(403).json({ error: 'Only owner or admin can view audit logs.' });
  res.json(store.auditLogs.filter((log) => log.targetQuestionBankId === bank.id));
});

app.get('/api/peer-learning/overview', (req, res) => {
  const store = readStore();
  const questionId = sanitizeCell(req.query.questionId || '');
  const classId = sanitizeCell(req.query.classId || '');
  const settings = getPeerLearningSettings(store, classId);
  const explanations = (store.peerExplanations || [])
    .filter((item) => (!questionId || item.questionId === questionId) && (!classId || item.classId === classId))
    .filter((item) => visiblePeerExplanation(item, req.principal))
    .slice(0, 80)
    .map((item) => publicPeerExplanation(item, req.principal));
  const helpRequests = (store.helpRequests || [])
    .filter((item) => item.status !== 'deleted' && (!questionId || item.questionId === questionId) && (!classId || item.classId === classId))
    .slice(0, 60)
    .map((item) => publicHelpRequest(item, store, req.principal));
  res.json({
    settings,
    explanations: settings.peerExplanations ? explanations : [],
    helpRequests: settings.helpRequests ? helpRequests : [],
    studentQuestions: settings.studentQuestions ? (store.studentCreatedQuestions || [])
      .filter((item) => (!questionId || item.questionId === questionId) && (!classId || item.classId === classId))
      .filter((item) => visibleStudentQuestion(item, req.principal))
      .slice(0, 40)
      .map((item) => publicStudentQuestion(item, req.principal)) : [],
    challenges: settings.peerChallenges ? (store.peerChallenges || [])
      .filter((item) => item.status !== 'deleted' && (!classId || item.classId === classId))
      .map((item) => publicPeerChallenge(item, req.principal))
      .filter(Boolean)
      .slice(0, 30) : [],
    peerReviews: settings.peerReviews ? (store.peerReviewAssignments || [])
      .filter((item) => item.status !== 'deleted' && (!classId || item.classId === classId))
      .map((item) => publicPeerReviewAssignment(item, req.principal))
      .filter(Boolean)
      .slice(0, 30) : [],
    wrongExchanges: settings.wrongExchanges ? (store.wrongQuestionExchanges || [])
      .filter((item) => item.status !== 'deleted' && (!classId || item.classId === classId))
      .map((item) => publicWrongQuestionExchange(item, req.principal))
      .filter(Boolean)
      .slice(0, 30) : [],
    learningGuilds: settings.learningGuilds ? (store.learningGuilds || [])
      .filter((item) => item.status !== 'deleted' && (!classId || item.classId === classId))
      .map((item) => publicLearningGuild(item, req.principal))
      .slice(0, 20) : [],
    leaderboard: computePeerLearningAnalytics(store).leaderboard.slice(0, 10)
  });
});

app.get('/api/peer-learning/settings', (req, res) => {
  const store = readStore();
  const classId = sanitizeCell(req.query.classId || '');
  res.json(getPeerLearningSettings(store, classId));
});

app.put('/api/peer-learning/settings', requireTeacher, rateLimitMutations, (req, res) => {
  const classId = sanitizeCell(req.body.classId || req.query.classId || '');
  const store = readStore();
  const before = getPeerLearningSettings(store, classId);
  const settings = upsertPeerLearningSettings(store, classId, req.body || {}, req.principal);
  addAudit(store, req.principal, 'UPDATE_PEER_LEARNING_SETTINGS', 'peerLearningSettings', classId || 'global', {
    classId,
    before,
    after: settings
  });
  writeStore(store);
  res.json(settings);
});

app.post('/api/peer-learning/explanations', rateLimitMutations, (req, res) => {
  const store = readStore();
  const feature = ensurePeerFeatureEnabled(store, req.body.classId || '', 'peerExplanations', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  const text = sanitizeCell(req.body.explanationText || req.body.text || '');
  if (text.length < 12) return res.status(400).json({ error: 'Explanation must include a meaningful learning hint or reasoning.' });
  const explanation = {
    id: createId('pexp'),
    questionId: sanitizeCell(req.body.questionId || ''),
    questionBankId: sanitizeCell(req.body.questionBankId || ''),
    activityId: sanitizeCell(req.body.activityId || ''),
    classId: sanitizeCell(req.body.classId || ''),
    questionPrompt: sanitizeCell(req.body.questionPrompt || ''),
    knowledgePoint: sanitizeCell(req.body.knowledgePoint || ''),
    studentId: req.principal.userId,
    studentName: peerIdentity(req.principal, req.body.studentName),
    explanationType: sanitizeCell(req.body.explanationType || 'concept_explanation'),
    explanationText: text.slice(0, 1800),
    status: 'pending_review',
    helpfulCount: 0,
    clearCount: 0,
    needsImprovementCount: 0,
    teacherFeatured: false,
    anonymous: Boolean(req.body.anonymous),
    reportCount: 0,
    votes: [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  store.peerExplanations.unshift(explanation);
  addAudit(store, req.principal, 'SUBMIT_PEER_EXPLANATION', 'peerExplanation', explanation.id, {
    questionId: explanation.questionId,
    questionBankId: explanation.questionBankId,
    status: explanation.status
  });
  writeStore(store);
  res.status(201).json(publicPeerExplanation(explanation, req.principal));
});

app.post('/api/peer-learning/explanations/:id/vote', rateLimitMutations, (req, res) => {
  const store = readStore();
  const explanation = store.peerExplanations.find((item) => item.id === req.params.id && item.status !== 'deleted');
  if (!explanation) return res.status(404).json({ error: 'Peer explanation not found.' });
  const feature = ensurePeerFeatureEnabled(store, explanation.classId || '', 'peerExplanations', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (!visiblePeerExplanation(explanation, req.principal)) return res.status(403).json({ error: 'This explanation is not available.' });
  const voteType = sanitizeCell(req.body.voteType || '');
  if (!['helpful', 'clear', 'needs_improvement'].includes(voteType)) return res.status(400).json({ error: 'Unsupported vote type.' });
  explanation.votes = (explanation.votes || []).filter((vote) => vote.studentId !== req.principal.userId);
  explanation.votes.push({ studentId: req.principal.userId, voteType, createdAt: nowIso() });
  explanation.helpfulCount = explanation.votes.filter((vote) => vote.voteType === 'helpful').length;
  explanation.clearCount = explanation.votes.filter((vote) => vote.voteType === 'clear').length;
  explanation.needsImprovementCount = explanation.votes.filter((vote) => vote.voteType === 'needs_improvement').length;
  explanation.updatedAt = nowIso();
  addAudit(store, req.principal, 'VOTE_PEER_EXPLANATION', 'peerExplanation', explanation.id, { voteType });
  writeStore(store);
  res.json(publicPeerExplanation(explanation, req.principal));
});

app.post('/api/peer-learning/help-requests', rateLimitMutations, (req, res) => {
  const store = readStore();
  const feature = ensurePeerFeatureEnabled(store, req.body.classId || '', 'helpRequests', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  const message = sanitizeCell(req.body.message || '');
  if (message.length < 8) return res.status(400).json({ error: 'Help request must describe where you are stuck.' });
  const request = {
    id: createId('help'),
    studentId: req.principal.userId,
    studentName: peerIdentity(req.principal, req.body.studentName),
    classId: sanitizeCell(req.body.classId || ''),
    questionId: sanitizeCell(req.body.questionId || ''),
    questionBankId: sanitizeCell(req.body.questionBankId || ''),
    activityId: sanitizeCell(req.body.activityId || ''),
    questionPrompt: sanitizeCell(req.body.questionPrompt || ''),
    knowledgePoint: sanitizeCell(req.body.knowledgePoint || ''),
    message: message.slice(0, 1200),
    status: 'open',
    anonymous: Boolean(req.body.anonymous),
    responseCount: 0,
    reportCount: 0,
    createdAt: nowIso(),
    resolvedAt: null
  };
  store.helpRequests.unshift(request);
  addAudit(store, req.principal, 'CREATE_HELP_REQUEST', 'helpRequest', request.id, {
    questionId: request.questionId,
    classId: request.classId,
    knowledgePoint: request.knowledgePoint
  });
  writeStore(store);
  res.status(201).json(publicHelpRequest(request, store, req.principal));
});

app.post('/api/peer-learning/help-requests/:id/responses', rateLimitMutations, (req, res) => {
  const store = readStore();
  const request = store.helpRequests.find((item) => item.id === req.params.id && item.status !== 'deleted');
  if (!request) return res.status(404).json({ error: 'Help request not found.' });
  const feature = ensurePeerFeatureEnabled(store, request.classId || '', 'helpRequests', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (request.status === 'resolved') return res.status(400).json({ error: 'This help request is already resolved.' });
  const content = sanitizeCell(req.body.content || '');
  if (content.length < 8) return res.status(400).json({ error: 'Help response must include a hint, example, or explanation.' });
  const responseType = sanitizeCell(req.body.responseType || 'hint');
  if (!['hint', 'step_explanation', 'example', 'guiding_question', 'concept_reminder'].includes(responseType)) return res.status(400).json({ error: 'Unsupported help response type.' });
  const response = {
    id: createId('hresp'),
    helpRequestId: request.id,
    responderStudentId: req.principal.userId,
    responderName: peerIdentity(req.principal, req.body.responderName),
    responseType,
    content: content.slice(0, 1400),
    status: 'pending_review',
    helpfulMarked: false,
    teacherApproved: false,
    anonymous: Boolean(req.body.anonymous),
    reportCount: 0,
    createdAt: nowIso()
  };
  store.helpResponses.unshift(response);
  request.responseCount = (request.responseCount || 0) + 1;
  request.updatedAt = nowIso();
  addAudit(store, req.principal, 'CREATE_HELP_RESPONSE', 'helpResponse', response.id, {
    helpRequestId: request.id,
    responseType
  });
  writeStore(store);
  res.status(201).json(publicHelpRequest(request, store, req.principal));
});

app.post('/api/peer-learning/help-responses/:id/mark-helpful', rateLimitMutations, (req, res) => {
  const store = readStore();
  const response = store.helpResponses.find((item) => item.id === req.params.id && item.status !== 'deleted');
  if (!response) return res.status(404).json({ error: 'Help response not found.' });
  const request = store.helpRequests.find((item) => item.id === response.helpRequestId);
  if (!request) return res.status(404).json({ error: 'Help request not found.' });
  const feature = ensurePeerFeatureEnabled(store, request.classId || '', 'helpRequests', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (request.studentId !== req.principal.userId && !isTeacherRole(req.principal)) return res.status(403).json({ error: 'Only the requester or teacher can mark a response helpful.' });
  response.helpfulMarked = true;
  request.status = 'resolved';
  request.resolvedAt = nowIso();
  addAudit(store, req.principal, 'MARK_HELP_RESPONSE_HELPFUL', 'helpResponse', response.id, { helpRequestId: request.id });
  writeStore(store);
  res.json(publicHelpRequest(request, store, req.principal));
});

app.get('/api/peer-learning/student-questions', (req, res) => {
  const store = readStore();
  const classId = sanitizeCell(req.query.classId || '');
  const questionBankId = sanitizeCell(req.query.questionBankId || '');
  const questions = (store.studentCreatedQuestions || [])
    .filter((item) => item.status !== 'deleted')
    .filter((item) => !classId || item.classId === classId)
    .filter((item) => !questionBankId || item.questionBankId === questionBankId)
    .filter((item) => visibleStudentQuestion(item, req.principal))
    .slice(0, 100)
    .map((item) => publicStudentQuestion(item, req.principal));
  res.json({ questions });
});

app.post('/api/peer-learning/student-questions', rateLimitMutations, (req, res) => {
  const store = readStore();
  const feature = ensurePeerFeatureEnabled(store, req.body.classId || '', 'studentQuestions', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  const prompt = sanitizeCell(req.body.prompt || req.body.questionPrompt || '');
  const answer = sanitizeCell(req.body.answer || '');
  if (prompt.length < 8) return res.status(400).json({ error: 'Student-created question must include a clear prompt.' });
  if (answer.length < 1) return res.status(400).json({ error: 'Student-created question must include an answer.' });
  const type = sanitizeCell(req.body.type || 'multiple_choice');
  if (!['multiple_choice', 'true_false', 'fill_blank', 'short_answer', 'matching', 'essay'].includes(type)) return res.status(400).json({ error: 'Unsupported student-created question type.' });
  const options = req.body.options && typeof req.body.options === 'object' ? req.body.options : {};
  const studentQuestion = {
    id: createId('scq'),
    creatorStudentId: req.principal.userId,
    creatorName: peerIdentity(req.principal, req.body.creatorName),
    classId: sanitizeCell(req.body.classId || ''),
    questionBankId: sanitizeCell(req.body.questionBankId || ''),
    questionId: sanitizeCell(req.body.questionId || ''),
    prompt,
    type,
    options: {
      A: sanitizeCell(options.A || req.body.optionA || ''),
      B: sanitizeCell(options.B || req.body.optionB || ''),
      C: sanitizeCell(options.C || req.body.optionC || ''),
      D: sanitizeCell(options.D || req.body.optionD || '')
    },
    answer,
    explanation: sanitizeCell(req.body.explanation || ''),
    difficulty: sanitizeCell(req.body.difficulty || 'medium'),
    knowledgePoint: sanitizeCell(req.body.knowledgePoint || ''),
    sourceNote: sanitizeCell(req.body.sourceNote || ''),
    creationReason: sanitizeCell(req.body.creationReason || ''),
    suggestedUse: sanitizeCell(req.body.suggestedUse || ''),
    status: 'pending_review',
    teacherReviewNote: '',
    qualityScore: 0,
    votes: [],
    reportCount: 0,
    anonymous: Boolean(req.body.anonymous),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  store.studentCreatedQuestions.unshift(studentQuestion);
  addAudit(store, req.principal, 'SUBMIT_STUDENT_CREATED_QUESTION', 'studentQuestion', studentQuestion.id, {
    classId: studentQuestion.classId,
    questionBankId: studentQuestion.questionBankId,
    status: studentQuestion.status
  });
  writeStore(store);
  res.status(201).json(publicStudentQuestion(studentQuestion, req.principal));
});

app.post('/api/peer-learning/student-questions/:id/vote', rateLimitMutations, (req, res) => {
  const store = readStore();
  const studentQuestion = store.studentCreatedQuestions.find((item) => item.id === req.params.id && item.status !== 'deleted');
  if (!studentQuestion) return res.status(404).json({ error: 'Student-created question not found.' });
  const feature = ensurePeerFeatureEnabled(store, studentQuestion.classId || '', 'studentQuestions', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (!visibleStudentQuestion(studentQuestion, req.principal)) return res.status(403).json({ error: 'This student-created question is not available.' });
  const clarity = Math.max(0, Math.min(5, Number(req.body.clarity || 0)));
  const correctness = Math.max(0, Math.min(5, Number(req.body.correctness || 0)));
  const helpfulness = Math.max(0, Math.min(5, Number(req.body.helpfulness || 0)));
  const difficultyFit = Math.max(0, Math.min(5, Number(req.body.difficultyFit || 0)));
  if (![clarity, correctness, helpfulness, difficultyFit].every((score) => score > 0)) return res.status(400).json({ error: 'Quality vote must include clarity, correctness, helpfulness, and difficulty fit scores from 1 to 5.' });
  studentQuestion.votes = (studentQuestion.votes || []).filter((vote) => vote.studentId !== req.principal.userId);
  studentQuestion.votes.push({ studentId: req.principal.userId, clarity, correctness, helpfulness, difficultyFit, createdAt: nowIso() });
  const total = studentQuestion.votes.reduce((sum, vote) => sum + vote.clarity + vote.correctness + vote.helpfulness + vote.difficultyFit, 0);
  studentQuestion.qualityScore = Math.round((total / (studentQuestion.votes.length * 20)) * 100);
  studentQuestion.updatedAt = nowIso();
  addAudit(store, req.principal, 'VOTE_STUDENT_CREATED_QUESTION', 'studentQuestion', studentQuestion.id, { qualityScore: studentQuestion.qualityScore });
  writeStore(store);
  res.json(publicStudentQuestion(studentQuestion, req.principal));
});

app.get('/api/peer-learning/challenges', (req, res) => {
  const store = readStore();
  const classId = sanitizeCell(req.query.classId || '');
  const challenges = (store.peerChallenges || [])
    .filter((item) => item.status !== 'deleted')
    .filter((item) => !classId || item.classId === classId)
    .map((item) => publicPeerChallenge(item, req.principal))
    .filter(Boolean)
    .slice(0, 80);
  res.json({ challenges });
});

app.post('/api/peer-learning/challenges', rateLimitMutations, (req, res) => {
  const store = readStore();
  const feature = ensurePeerFeatureEnabled(store, req.body.classId || '', 'peerChallenges', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  const opponentStudentId = sanitizeCell(req.body.opponentStudentId || '');
  const mode = sanitizeCell(req.body.mode || 'one_v_one');
  if (!['one_v_one', 'random', 'rematch', 'weakness'].includes(mode)) return res.status(400).json({ error: 'Unsupported peer challenge mode.' });
  if (mode !== 'random' && !opponentStudentId) return res.status(400).json({ error: 'Opponent student id is required for this challenge mode.' });
  const questionIds = Array.isArray(req.body.questionIds) ? req.body.questionIds.map(sanitizeCell).filter(Boolean).slice(0, 20) : [];
  const challenge = {
    id: createId('pch'),
    classId: sanitizeCell(req.body.classId || ''),
    challengerStudentId: req.principal.userId,
    challengerName: peerIdentity(req.principal, req.body.challengerName),
    opponentStudentId,
    opponentName: sanitizeCell(req.body.opponentName || opponentStudentId || 'Random classmate'),
    mode,
    questionIds,
    status: mode === 'random' ? 'matched' : 'pending',
    winnerId: null,
    scores: {},
    xpAwards: {},
    fairnessNote: 'Challenge XP rewards completion, improvement, and constructive explanations rather than public shaming.',
    reportCount: 0,
    createdAt: nowIso(),
    completedAt: null
  };
  store.peerChallenges.unshift(challenge);
  addAudit(store, req.principal, 'CREATE_PEER_CHALLENGE', 'peerChallenge', challenge.id, {
    classId: challenge.classId,
    opponentStudentId: challenge.opponentStudentId,
    mode: challenge.mode
  });
  writeStore(store);
  res.status(201).json(publicPeerChallenge(challenge, req.principal));
});

app.post('/api/peer-learning/challenges/:id/respond', rateLimitMutations, (req, res) => {
  const store = readStore();
  const challenge = store.peerChallenges.find((item) => item.id === req.params.id && item.status !== 'deleted');
  if (!challenge) return res.status(404).json({ error: 'Peer challenge not found.' });
  const feature = ensurePeerFeatureEnabled(store, challenge.classId || '', 'peerChallenges', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (challenge.opponentStudentId !== req.principal.userId && !isTeacherRole(req.principal)) return res.status(403).json({ error: 'Only the challenged student or teacher can respond.' });
  const action = sanitizeCell(req.body.action || '');
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'Unsupported challenge response.' });
  challenge.status = action === 'accept' ? 'accepted' : 'declined';
  challenge.respondedAt = nowIso();
  addAudit(store, req.principal, `${action === 'accept' ? 'ACCEPT' : 'DECLINE'}_PEER_CHALLENGE`, 'peerChallenge', challenge.id, {});
  writeStore(store);
  res.json(publicPeerChallenge(challenge, req.principal));
});

app.post('/api/peer-learning/challenges/:id/complete', rateLimitMutations, (req, res) => {
  const store = readStore();
  const challenge = store.peerChallenges.find((item) => item.id === req.params.id && item.status !== 'deleted');
  if (!challenge) return res.status(404).json({ error: 'Peer challenge not found.' });
  const feature = ensurePeerFeatureEnabled(store, challenge.classId || '', 'peerChallenges', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  const isParticipant = [challenge.challengerStudentId, challenge.opponentStudentId].includes(req.principal.userId);
  if (!isParticipant && !isTeacherRole(req.principal)) return res.status(403).json({ error: 'Only participants or teacher can complete this challenge.' });
  const scores = req.body.scores && typeof req.body.scores === 'object' ? req.body.scores : {};
  const challengerScore = Number(scores[challenge.challengerStudentId] || scores.challenger || 0);
  const opponentScore = Number(scores[challenge.opponentStudentId] || scores.opponent || 0);
  challenge.scores = {
    [challenge.challengerStudentId]: Number.isFinite(challengerScore) ? challengerScore : 0,
    [challenge.opponentStudentId]: Number.isFinite(opponentScore) ? opponentScore : 0
  };
  challenge.winnerId = challenge.scores[challenge.challengerStudentId] === challenge.scores[challenge.opponentStudentId]
    ? null
    : (challenge.scores[challenge.challengerStudentId] > challenge.scores[challenge.opponentStudentId] ? challenge.challengerStudentId : challenge.opponentStudentId);
  challenge.xpAwards = {
    [challenge.challengerStudentId]: 12 + (challenge.winnerId === challenge.challengerStudentId ? 6 : 0),
    [challenge.opponentStudentId]: 12 + (challenge.winnerId === challenge.opponentStudentId ? 6 : 0)
  };
  challenge.status = 'completed';
  challenge.completedAt = nowIso();
  addAudit(store, req.principal, 'COMPLETE_PEER_CHALLENGE', 'peerChallenge', challenge.id, {
    scores: challenge.scores,
    winnerId: challenge.winnerId
  });
  writeStore(store);
  res.json(publicPeerChallenge(challenge, req.principal));
});

app.get('/api/peer-learning/peer-reviews', (req, res) => {
  const store = readStore();
  const classId = sanitizeCell(req.query.classId || '');
  const reviews = (store.peerReviewAssignments || [])
    .filter((item) => item.status !== 'deleted')
    .filter((item) => !classId || item.classId === classId)
    .map((item) => publicPeerReviewAssignment(item, req.principal))
    .filter(Boolean)
    .slice(0, 100);
  res.json({ reviews });
});

app.post('/api/peer-learning/peer-reviews', rateLimitMutations, (req, res) => {
  const store = readStore();
  const feature = ensurePeerFeatureEnabled(store, req.body.classId || '', 'peerReviews', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  const reviewerStudentId = sanitizeCell(req.body.reviewerStudentId || '');
  const submissionText = sanitizeCell(req.body.submissionText || '');
  if (!reviewerStudentId) return res.status(400).json({ error: 'Reviewer student id is required.' });
  if (submissionText.length < 12) return res.status(400).json({ error: 'Peer review assignment must include a submission to review.' });
  const assignment = {
    id: createId('prev'),
    activityId: sanitizeCell(req.body.activityId || ''),
    classId: sanitizeCell(req.body.classId || ''),
    submissionId: sanitizeCell(req.body.submissionId || createId('sub')),
    submissionText: submissionText.slice(0, 3000),
    reviewerStudentId,
    reviewerName: sanitizeCell(req.body.reviewerName || reviewerStudentId),
    revieweeStudentId: req.principal.userId,
    revieweeName: peerIdentity(req.principal, req.body.revieweeName),
    rubricScores: {},
    feedbackText: '',
    status: 'assigned',
    anonymous: req.body.anonymous !== false,
    reportCount: 0,
    createdAt: nowIso(),
    submittedAt: null
  };
  store.peerReviewAssignments.unshift(assignment);
  addAudit(store, req.principal, 'CREATE_PEER_REVIEW_ASSIGNMENT', 'peerReview', assignment.id, {
    classId: assignment.classId,
    reviewerStudentId
  });
  writeStore(store);
  res.status(201).json(publicPeerReviewAssignment(assignment, req.principal));
});

app.post('/api/peer-learning/peer-reviews/:id/submit', rateLimitMutations, (req, res) => {
  const store = readStore();
  const assignment = store.peerReviewAssignments.find((item) => item.id === req.params.id && item.status !== 'deleted');
  if (!assignment) return res.status(404).json({ error: 'Peer review assignment not found.' });
  const feature = ensurePeerFeatureEnabled(store, assignment.classId || '', 'peerReviews', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (assignment.reviewerStudentId !== req.principal.userId && !isTeacherRole(req.principal)) return res.status(403).json({ error: 'Only the assigned reviewer or teacher can submit this review.' });
  const feedbackText = sanitizeCell(req.body.feedbackText || '');
  if (feedbackText.length < 12) return res.status(400).json({ error: 'Peer review feedback must be constructive and specific.' });
  const rawScores = req.body.rubricScores && typeof req.body.rubricScores === 'object' ? req.body.rubricScores : {};
  const rubricScores = {};
  ['accuracy', 'reasoning', 'clarity', 'evidence', 'completeness'].forEach((key) => {
    const score = Math.max(1, Math.min(5, Number(rawScores[key] || 3)));
    rubricScores[key] = score;
  });
  assignment.rubricScores = rubricScores;
  assignment.feedbackText = feedbackText.slice(0, 2000);
  assignment.status = 'submitted';
  assignment.submittedAt = nowIso();
  addAudit(store, req.principal, 'SUBMIT_PEER_REVIEW', 'peerReview', assignment.id, { rubricScores });
  writeStore(store);
  res.json(publicPeerReviewAssignment(assignment, req.principal));
});

app.get('/api/peer-learning/wrong-exchanges', (req, res) => {
  const store = readStore();
  const classId = sanitizeCell(req.query.classId || '');
  const exchanges = (store.wrongQuestionExchanges || [])
    .filter((item) => item.status !== 'deleted')
    .filter((item) => !classId || item.classId === classId)
    .map((item) => publicWrongQuestionExchange(item, req.principal))
    .filter(Boolean)
    .slice(0, 100);
  res.json({ exchanges });
});

app.post('/api/peer-learning/wrong-exchanges', rateLimitMutations, (req, res) => {
  const store = readStore();
  const feature = ensurePeerFeatureEnabled(store, req.body.classId || '', 'wrongExchanges', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  const studentBId = sanitizeCell(req.body.partnerStudentId || req.body.studentBId || '');
  if (!studentBId) return res.status(400).json({ error: 'Partner student id is required for wrong question exchange.' });
  const exchange = {
    id: createId('wqx'),
    classId: sanitizeCell(req.body.classId || ''),
    studentAId: req.principal.userId,
    studentAName: peerIdentity(req.principal, req.body.studentAName),
    studentBId,
    studentBName: sanitizeCell(req.body.partnerName || req.body.studentBName || studentBId),
    knowledgePoint: sanitizeCell(req.body.knowledgePoint || ''),
    questionAId: sanitizeCell(req.body.questionAId || req.body.questionId || ''),
    questionBId: sanitizeCell(req.body.questionBId || ''),
    status: 'pending',
    reflectionA: '',
    reflectionB: '',
    reportCount: 0,
    createdAt: nowIso(),
    completedAt: null
  };
  store.wrongQuestionExchanges.unshift(exchange);
  addAudit(store, req.principal, 'CREATE_WRONG_QUESTION_EXCHANGE', 'wrongExchange', exchange.id, {
    classId: exchange.classId,
    partnerStudentId: studentBId,
    knowledgePoint: exchange.knowledgePoint
  });
  writeStore(store);
  res.status(201).json(publicWrongQuestionExchange(exchange, req.principal));
});

app.post('/api/peer-learning/wrong-exchanges/:id/complete', rateLimitMutations, (req, res) => {
  const store = readStore();
  const exchange = store.wrongQuestionExchanges.find((item) => item.id === req.params.id && item.status !== 'deleted');
  if (!exchange) return res.status(404).json({ error: 'Wrong question exchange not found.' });
  const feature = ensurePeerFeatureEnabled(store, exchange.classId || '', 'wrongExchanges', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  const isParticipant = [exchange.studentAId, exchange.studentBId].includes(req.principal.userId);
  if (!isParticipant && !isTeacherRole(req.principal)) return res.status(403).json({ error: 'Only participants or teacher can complete this exchange.' });
  const reflection = sanitizeCell(req.body.reflection || '');
  if (reflection.length < 8) return res.status(400).json({ error: 'Reflection is required to complete a wrong question exchange.' });
  if (req.principal.userId === exchange.studentAId) exchange.reflectionA = reflection;
  if (req.principal.userId === exchange.studentBId) exchange.reflectionB = reflection;
  if (isTeacherRole(req.principal)) {
    exchange.reflectionA = exchange.reflectionA || reflection;
    exchange.reflectionB = exchange.reflectionB || reflection;
  }
  exchange.status = exchange.reflectionA && exchange.reflectionB ? 'completed' : 'in_progress';
  exchange.completedAt = exchange.status === 'completed' ? nowIso() : null;
  addAudit(store, req.principal, 'UPDATE_WRONG_QUESTION_EXCHANGE', 'wrongExchange', exchange.id, {
    status: exchange.status
  });
  writeStore(store);
  res.json(publicWrongQuestionExchange(exchange, req.principal));
});

app.get('/api/peer-learning/guilds', (req, res) => {
  const store = readStore();
  const classId = sanitizeCell(req.query.classId || '');
  const guilds = (store.learningGuilds || [])
    .filter((item) => item.status !== 'deleted')
    .filter((item) => !classId || item.classId === classId)
    .map((item) => publicLearningGuild(item, req.principal));
  res.json({ guilds });
});

app.post('/api/peer-learning/guilds', requireTeacher, rateLimitMutations, (req, res) => {
  const store = readStore();
  const feature = ensurePeerFeatureEnabled(store, req.body.classId || '', 'learningGuilds', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  const name = sanitizeCell(req.body.name || '');
  if (name.length < 2) return res.status(400).json({ error: 'Learning guild name is required.' });
  const guild = {
    id: createId('guild'),
    classId: sanitizeCell(req.body.classId || ''),
    name,
    badge: sanitizeCell(req.body.badge || 'Gold Study Guild'),
    weeklyGoal: sanitizeCell(req.body.weeklyGoal || 'Complete one collaborative review mission.'),
    members: [],
    xp: 0,
    status: 'active',
    moderationLocked: false,
    createdBy: req.principal.userId,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  store.learningGuilds.unshift(guild);
  addAudit(store, req.principal, 'CREATE_LEARNING_GUILD', 'learningGuild', guild.id, {
    classId: guild.classId,
    name: guild.name
  });
  writeStore(store);
  res.status(201).json(publicLearningGuild(guild, req.principal));
});

app.post('/api/peer-learning/guilds/:id/join', rateLimitMutations, (req, res) => {
  const store = readStore();
  const guild = store.learningGuilds.find((item) => item.id === req.params.id && item.status !== 'deleted');
  if (!guild) return res.status(404).json({ error: 'Learning guild not found.' });
  const feature = ensurePeerFeatureEnabled(store, guild.classId || '', 'learningGuilds', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (guild.moderationLocked && !isTeacherRole(req.principal)) return res.status(403).json({ error: 'This learning guild is locked by the teacher.' });
  guild.members = guild.members || [];
  if (!guild.members.some((member) => member.studentId === req.principal.userId)) {
    guild.members.push({
      studentId: req.principal.userId,
      studentName: peerIdentity(req.principal, req.body?.studentName),
      role: sanitizeCell(req.body?.role || 'member'),
      xp: 0,
      joinedAt: nowIso()
    });
  }
  guild.updatedAt = nowIso();
  addAudit(store, req.principal, 'JOIN_LEARNING_GUILD', 'learningGuild', guild.id, {});
  writeStore(store);
  res.json(publicLearningGuild(guild, req.principal));
});

app.post('/api/peer-learning/guilds/:id/progress', rateLimitMutations, (req, res) => {
  const store = readStore();
  const guild = store.learningGuilds.find((item) => item.id === req.params.id && item.status !== 'deleted');
  if (!guild) return res.status(404).json({ error: 'Learning guild not found.' });
  const feature = ensurePeerFeatureEnabled(store, guild.classId || '', 'learningGuilds', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  const canModerate = isTeacherRole(req.principal);
  const member = (guild.members || []).find((item) => item.studentId === req.principal.userId);
  if (!member && !canModerate) return res.status(403).json({ error: 'Join this learning guild before adding progress.' });
  const xp = Math.max(0, Math.min(50, Number(req.body?.xp || 5)));
  guild.xp = Number(guild.xp || 0) + xp;
  if (member) member.xp = Number(member.xp || 0) + xp;
  guild.lastProgressNote = sanitizeCell(req.body?.note || '');
  guild.updatedAt = nowIso();
  addAudit(store, req.principal, 'ADD_LEARNING_GUILD_PROGRESS', 'learningGuild', guild.id, { xp });
  writeStore(store);
  res.json(publicLearningGuild(guild, req.principal));
});

app.post('/api/peer-learning/report', rateLimitMutations, (req, res) => {
  const targetType = sanitizeCell(req.body.targetType || '');
  const targetId = sanitizeCell(req.body.targetId || '');
  const store = readStore();
  const target = moderationTarget(store, targetType, targetId);
  if (!target) return res.status(404).json({ error: 'Report target not found.' });
  target.reportCount = (target.reportCount || 0) + 1;
  if (target.reportCount >= 2 && !['approved', 'featured'].includes(target.status)) target.status = 'flagged';
  addModerationLog(store, req.principal, 'REPORT_CONTENT', targetType, targetId, req.body.reason || '');
  writeStore(store);
  res.json({ ok: true, reportCount: target.reportCount, status: target.status });
});

app.get('/api/peer-learning/leaderboard', (req, res) => {
  const store = readStore();
  const analytics = computePeerLearningAnalytics(store);
  res.json({
    generatedAt: analytics.generatedAt,
    boards: {
      teamworkXp: analytics.leaderboard,
      clearExplainers: analytics.badges.clearExplainers,
      helpfulClassmates: analytics.badges.helpfulClassmates
    },
    note: 'This leaderboard rewards help, explanations, and improvement-oriented behaviors rather than raw scores only.'
  });
});

app.get('/api/peer-learning/teacher/queue', requireTeacher, (req, res) => {
  const store = readStore();
  const classId = peerClassId(req.query);
  const explanations = byPeerClass(store.peerExplanations || [], classId)
    .filter((item) => ['pending_review', 'flagged', 'returned_for_revision'].includes(item.status))
    .map((item) => ({ ...publicPeerExplanation(item, req.principal), targetType: 'explanation' }));
  const helpRequests = byPeerClass(store.helpRequests || [], classId)
    .filter((item) => item.status === 'flagged')
    .map((item) => ({ ...publicHelpRequest(item, store, req.principal), targetType: 'helpRequest' }));
  const helpResponses = byPeerClass(store.helpResponses || [], classId)
    .filter((item) => ['pending_review', 'flagged'].includes(item.status))
    .map((item) => ({ ...item, targetType: 'helpResponse' }));
  const studentQuestions = byPeerClass(store.studentCreatedQuestions || [], classId)
    .filter((item) => ['pending_review', 'flagged', 'returned_for_revision'].includes(item.status))
    .map((item) => ({ ...publicStudentQuestion(item, req.principal), targetType: 'studentQuestion' }));
  const peerChallenges = byPeerClass(store.peerChallenges || [], classId)
    .filter((item) => item.status === 'flagged')
    .map((item) => ({ ...publicPeerChallenge(item, req.principal), targetType: 'peerChallenge' }));
  const peerReviews = byPeerClass(store.peerReviewAssignments || [], classId)
    .filter((item) => item.status === 'flagged')
    .map((item) => ({ ...publicPeerReviewAssignment(item, req.principal), targetType: 'peerReview' }));
  const wrongExchanges = byPeerClass(store.wrongQuestionExchanges || [], classId)
    .filter((item) => item.status === 'flagged')
    .map((item) => ({ ...publicWrongQuestionExchange(item, req.principal), targetType: 'wrongExchange' }));
  const learningGuilds = byPeerClass(store.learningGuilds || [], classId)
    .filter((item) => item.status === 'flagged' || item.moderationLocked)
    .map((item) => ({ ...publicLearningGuild(item, req.principal), targetType: 'learningGuild' }));
  res.json({
    classId,
    explanations,
    helpRequests,
    helpResponses,
    studentQuestions,
    peerChallenges,
    peerReviews,
    wrongExchanges,
    learningGuilds,
    moderationLogs: filteredModerationLogs(store, { classId, limit: 120 })
  });
});

app.get('/api/peer-learning/teacher/analytics', requireTeacher, (req, res) => {
  const store = readStore();
  res.json(computePeerLearningAnalytics(store, req.query));
});

app.get('/api/peer-learning/teacher/safety-summary', requireTeacher, (req, res) => {
  const store = readStore();
  res.json(buildPeerLearningSafetySummary(store, req.query));
});

app.get('/api/peer-learning/teacher/analytics/export', requireTeacher, (req, res) => {
  const store = readStore();
  const analytics = computePeerLearningAnalytics(store, req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="peer-learning-analytics-${Date.now()}.csv"`);
  res.send(peerLearningAnalyticsCsv(analytics));
});

app.get('/api/peer-learning/teacher/moderation-logs', requireTeacher, (req, res) => {
  const store = readStore();
  res.json({
    logs: filteredModerationLogs(store, req.query)
  });
});

app.get('/api/peer-learning/teacher/moderation-logs/export', requireTeacher, (req, res) => {
  const store = readStore();
  const logs = filteredModerationLogs(store, req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="peer-learning-moderation-logs-${Date.now()}.csv"`);
  res.send(moderationLogsCsv(logs));
});

app.post('/api/peer-learning/teacher/moderate/batch', requireTeacher, rateLimitMutations, (req, res) => {
  const action = sanitizeCell(req.body.action || '');
  const reason = sanitizeCell(req.body.reason || 'Teacher batch reviewed in peer learning queue.');
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];
  if (!items.length) return res.status(400).json({ error: 'Batch moderation requires at least one target item.' });
  const store = readStore();
  const results = items.map((item) => applyPeerModerationAction(store, req.principal, {
    targetType: item.targetType,
    targetId: item.targetId,
    action: item.action || action,
    reason
  }));
  const succeeded = results.filter((item) => item.ok).length;
  if (succeeded > 0) writeStore(store);
  res.json({
    ok: succeeded === results.length,
    succeeded,
    failed: results.length - succeeded,
    results: results.map((item) => ({
      ok: item.ok,
      status: item.status || 200,
      error: item.error || '',
      targetType: item.targetType,
      targetId: item.targetId,
      action: item.action || action,
      targetStatus: item.target?.status || ''
    }))
  });
});

app.post('/api/peer-learning/teacher/moderate', requireTeacher, rateLimitMutations, (req, res) => {
  const store = readStore();
  const result = applyPeerModerationAction(store, req.principal, req.body);
  if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
  writeStore(store);
  res.json({ ok: true, target: result.target });
});

app.get('/api/admin/question-banks', requireAdmin, (req, res) => {
  const store = readStore();
  res.json(store.questionBanks.map((bank) => publicBank(store, bank, req.principal)));
});

app.get('/api/admin/audit-logs', requireAdmin, (req, res) => {
  const store = readStore();
  res.json(store.auditLogs.slice(0, 1000));
});

app.post('/api/admin/question-banks/:id/status', requireAdmin, rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const nextStatus = sanitizeCell(req.body.status || 'active');
  if (!['active', 'draft', 'locked', 'suspended', 'deleted', 'rights-review-needed'].includes(nextStatus)) return res.status(400).json({ error: 'Unsupported status.' });
  const before = bank.status;
  bank.status = nextStatus;
  bank.deletedAt = nextStatus === 'deleted' ? (bank.deletedAt || nowIso()) : null;
  bank.rightsRiskStatus = nextStatus === 'rights-review-needed' ? 'review_needed' : bank.rightsRiskStatus;
  bank.updatedAt = nowIso();
  bank.updatedBy = req.principal.userId;
  addAudit(store, req.principal, 'ADMIN_UPDATE_QUESTION_BANK_STATUS', 'questionBank', bank.id, {
    targetQuestionBankId: bank.id,
    before,
    after: nextStatus,
    reason: sanitizeCell(req.body.reason || ''),
    note: sanitizeCell(req.body.note || '')
  });
  writeStore(store);
  res.json(publicBank(store, bank, req.principal));
});

// Legacy endpoints retained for older clients.
function getLegacyBanks() {
  try {
    return JSON.parse(fs.readFileSync(legacyBanksFilePath, 'utf8'));
  } catch(e) {
    return [];
  }
}

app.get('/api/banks', (req, res) => {
  const banks = getLegacyBanks();
  res.json(banks.map((bank) => ({ id: bank.id, name: bank.name, date: bank.date, count: bank.questions?.length || 0 })));
});

app.get('/api/banks/:id', (req, res) => {
  const banks = getLegacyBanks();
  const bank = banks.find((item) => item.id === req.params.id);
  if (bank) return res.json(bank);
  res.status(404).json({ error: 'Bank not found' });
});

app.post('/api/upload', excelUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  try {
    const principal = await getPrincipal(req);
    const preview = validateQuestions(await parseWorkbookExcelJs(req.file.buffer), principal, {});
    res.json({ questions: preview.rows.filter((row) => row.valid).map((row) => row.question), preview });
  } catch (err) {
    res.status(400).send(`Error parsing excel file: ${err.message}`);
  }
});

app.post('/api/student-answers/bulk', rateLimitMutations, (req, res) => {
  const answers = Array.isArray(req.body.answers) ? req.body.answers.slice(0, 300) : [];
  if (!answers.length) return res.status(400).json({ error: 'No student answers provided.' });

  const store = readStore();
  const recorded = answers.map((answer) => recordStudentAnswer(store, {
    ...answer,
    studentId: answer.studentId || req.body.studentId,
    studentName: answer.studentName || req.body.studentName,
    teacherUserId: answer.teacherUserId || req.body.teacherUserId,
    classId: answer.classId || req.body.classId,
    activityId: answer.activityId || req.body.activityId,
    questionBankId: answer.questionBankId || req.body.questionBankId
  }));
  writeStore(store);
  res.status(201).json({ ok: true, count: recorded.length });
});

const rooms = {};

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(10000000 + Math.random() * 90000000).toString();
  } while (rooms[code]);
  return code;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_room', ({ questions, limit, teacherUserId, activityId, questionBankId }) => {
    const shuffled = questions.sort(() => 0.5 - Math.random());
    let selected = shuffled.slice(0, limit || 10);

    if (selected.length === 0) {
      socket.emit('error', 'No questions to play.');
      return;
    }

    selected = selected.map((question) => ({
      ...question,
      Answer: String(question.Answer || question.answer || '').trim().toUpperCase()
    }));

    const roomId = generateRoomCode();
    rooms[roomId] = {
      id: roomId,
      teacherId: socket.id,
      teacherUserId: sanitizeCell(teacherUserId || ''),
      activityId: sanitizeCell(activityId || ''),
      questionBankId: sanitizeCell(questionBankId || selected[0]?.questionBankId || ''),
      status: 'waiting',
      questions: selected,
      currentQuestionIndex: -1,
      players: {},
      answeredCount: 0,
      timeLimit: 60,
      timer: null,
      questionStartTime: 0
    };

    socket.join(roomId);
    socket.emit('room_created', roomId);
  });

  socket.on('join_room_student', ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', 'Room not found.');
    if (room.status !== 'waiting') return socket.emit('error', 'Game already started.');

    room.players[socket.id] = {
      id: socket.id,
      nickname,
      score: 0,
      streak: 0,
      answers: []
    };

    socket.join(roomId);
    socket.emit('joined_room', { roomId, nickname });
    io.to(room.teacherId).emit('player_joined', Object.values(room.players));
  });

  socket.on('start_game', (roomId) => {
    const room = rooms[roomId];
    if (room && room.teacherId === socket.id) {
      room.status = 'playing';
      nextQuestion(room);
    }
  });

  socket.on('next_question', (roomId) => {
    const room = rooms[roomId];
    if (room && room.teacherId === socket.id) {
      nextQuestion(room);
    }
  });

  socket.on('submit_answer', ({ roomId, selectedOption }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;
    const player = room.players[socket.id];
    if (!player) return;

    const qIndex = room.currentQuestionIndex;
    if (player.answers.some((answer) => answer.qIndex === qIndex)) return;

    const question = room.questions[qIndex];
    const correctOption = String(question.Answer || question.answer || '').trim().toUpperCase();
    const cleanSelectedOption = String(selectedOption).trim().toUpperCase();
    const isCorrect = cleanSelectedOption === correctOption;
    const timeTaken = (Date.now() - room.questionStartTime) / 1000;
    let points = 0;

    if (isCorrect) {
      player.streak += 1;
      const totalPlayers = Object.keys(room.players).length || 1;
      const timeRatio = Math.max(0, 1 - (timeTaken / room.timeLimit));
      const orderRatio = Math.max(0, 1 - (room.answeredCount / totalPlayers));
      const questionBaseScore = 1000 * (0.5 * timeRatio + 0.5 * orderRatio);
      const streakMultiplier = 1 + (player.streak - 1) * 0.2;
      points = Math.round(questionBaseScore * streakMultiplier);
      points = Math.max(100, points);
      player.score += points;
    } else {
      player.streak = 0;
    }

    player.answers.push({
      qIndex,
      selected: selectedOption,
      correct: isCorrect,
      score: points,
      timeTaken
    });
    try {
      const store = readStore();
      recordStudentAnswer(store, {
        studentId: socket.id,
        studentName: player.nickname,
        teacherUserId: room.teacherUserId,
        classId: room.id,
        roomId: room.id,
        activityId: room.activityId,
        questionBankId: room.questionBankId || question.questionBankId,
        questionId: question.id,
        question,
        selectedAnswer: cleanSelectedOption,
        correctAnswer: correctOption,
        isCorrect,
        timeSpent: timeTaken,
        score: points
      });
      writeStore(store);
    } catch (error) {
      console.error('Unable to record student answer:', error);
    }
    room.answeredCount += 1;

    socket.emit('answer_feedback', {
      isCorrect,
      correctOption,
      points,
      currentScore: player.score,
      streak: player.streak
    });

    io.to(room.teacherId).emit('player_answered_count', room.answeredCount);

    const totalPlayers = Object.keys(room.players).length;
    if (room.answeredCount >= totalPlayers) {
      endQuestion(room);
    }
  });

  function nextQuestion(room) {
    if (room.timerInterval) clearInterval(room.timerInterval);

    room.currentQuestionIndex += 1;
    if (room.currentQuestionIndex >= room.questions.length) {
      room.status = 'game_over';
      io.to(room.id).emit('game_over', {
        players: Object.values(room.players).map((player) => ({
          nickname: player.nickname,
          score: player.score,
          answers: player.answers
        }))
      });
      return;
    }

    room.status = 'playing';
    room.answeredCount = 0;
    room.questionStartTime = Date.now();

    const question = room.questions[room.currentQuestionIndex];
    const payload = {
      qIndex: room.currentQuestionIndex,
      total: room.questions.length,
      question: question.Question || question.prompt,
      options: {
        A: question.OptA || question.options?.A,
        B: question.OptB || question.options?.B,
        C: question.OptC || question.options?.C,
        D: question.OptD || question.options?.D
      },
      timeLimit: room.timeLimit
    };

    io.to(room.teacherId).emit('new_question', payload);
    io.to(room.id).emit('new_question_student', payload);

    let timeLeft = room.timeLimit;
    const interval = setInterval(() => {
      timeLeft -= 1;
      const totalPlayers = Object.keys(room.players).length;
      if (totalPlayers > 0 && room.answeredCount >= totalPlayers / 2) {
        timeLeft -= 1;
      }
      io.to(room.id).emit('tick', timeLeft);

      if (timeLeft <= 0) {
        clearInterval(interval);
        endQuestion(room);
      }
    }, 1000);
    room.timerInterval = interval;
  }

  function endQuestion(room) {
    if (room.timerInterval) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
    }

    room.status = 'question_result';
    const question = room.questions[room.currentQuestionIndex];
    const distribution = { A: 0, B: 0, C: 0, D: 0 };
    Object.values(room.players).forEach((player) => {
      const answer = player.answers.find((item) => item.qIndex === room.currentQuestionIndex);
      if (answer && answer.selected) {
        const selected = answer.selected.toUpperCase();
        if (distribution[selected] !== undefined) distribution[selected] += 1;
      }
    });

    const leaderboard = Object.values(room.players)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((player) => ({ nickname: player.nickname, score: player.score }));

    io.to(room.id).emit('question_result', {
      correctOption: question.Answer || question.answer,
      leaderboard,
      distribution
    });
  }

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
