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
require('dotenv').config();
const jwt = require('jsonwebtoken');

// Initialize Firebase Admin (optional for local testing, required for production)
// 統一接受 FIREBASE_SERVICE_ACCOUNT_JSON（render.yaml 使用的名稱）與舊的
// FIREBASE_SERVICE_ACCOUNT，並一併帶入 FIREBASE_PROJECT_ID，避免部署設定與程式碼名稱
// 對不上而導致 db 永遠為 null。
try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!admin.apps.length && (serviceAccountJson || projectId)) {
    const appOptions = {};
    if (serviceAccountJson) {
      appOptions.credential = admin.credential.cert(JSON.parse(serviceAccountJson));
    } else {
      appOptions.credential = admin.credential.applicationDefault();
    }
    if (projectId) appOptions.projectId = projectId;
    admin.initializeApp(appOptions);
    console.log('Firebase Admin initialized.');
  } else if (!admin.apps.length) {
    console.warn('FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_PROJECT_ID not set. Firebase Admin will not connect.');
  }
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
}

const db = admin.apps.length ? admin.firestore() : null;

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

function envList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

// 必要密鑰一律改由環境變數提供；缺少時直接拒絕啟動，避免使用寫死的後備值形成後門。
function requiredSecret(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    console.error(`[FATAL] 缺少必要的環境變數 ${name}。請於 .env 或部署環境設定後再啟動伺服器（可參考 backend/.env.example）。`);
    process.exit(1);
  }
  return value;
}

const JWT_SECRET = requiredSecret('JWT_SECRET');
const ADMIN_PASSWORD = requiredSecret('ADMIN_PASSWORD');

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'teacher' }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false, error: '密碼錯誤' });
});

app.post('/api/admin/become-teacher', async (req, res) => {
  const { password, uid, email } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: '密碼錯誤' });
  }
  
  if (!db) {
    return res.status(500).json({ success: false, error: '伺服器尚未設定 Firebase Admin 憑證，無法連線資料庫。請管理員設定環境變數。' });
  }

  try {
    await db.collection('Users').doc(uid).set({
      role: 'teacher',
      email: email || ''
    }, { merge: true });
    
    // Set custom claims (optional but good for future-proofing rules)
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to upgrade user:', err);
    res.status(500).json({ success: false, error: '授權失敗：' + err.message });
  }
});

app.post('/api/register', async (req, res) => {
  const { email, password, nickname, allowPublicDisplayName, avatarType, playFrequency } = req.body;
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'invalid-email', message: '請輸入有效的電子郵件格式。' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, error: 'weak-password', message: '密碼長度至少需要 6 碼。' });
  }
  
  const adminEmail = String(process.env.GM_TEACHER_ADMIN_EMAIL || '').toLowerCase();
  if (adminEmail && email.trim().toLowerCase() === adminEmail) {
    return res.status(400).json({ success: false, error: 'registration-blocked', message: '該管理員帳號不開放手動註冊。' });
  }

  if (!db) {
    return res.status(503).json({ success: false, error: 'FIREBASE_NOT_CONFIGURED', message: '伺服器未設定 Firebase Admin。' });
  }
  
  const displayNickname = nickname ? nickname.trim() : '';
  
  try {
    const createUserParams = {
      email,
      password
    };
    if (displayNickname) {
      createUserParams.displayName = displayNickname;
    }
    
    const userRecord = await admin.auth().createUser(createUserParams);
    
    const counterRef = db.collection('SystemCounters').doc('user_counter');
    const userRef = db.collection('Users').doc(userRecord.uid);
    
    await db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let currentNumber = 0;
      if (counterDoc.exists) {
        currentNumber = counterDoc.data().currentNumber || 0;
      }
      const nextNumber = currentNumber + 1;
      const anonymizedCode = 'S' + String(nextNumber).padStart(4, '0');
      
      transaction.set(userRef, {
        id: userRecord.uid,
        email: email,
        emailVerified: false,
        anonymizedStudentNumber: nextNumber,
        anonymizedStudentCode: anonymizedCode,
        displayName: displayNickname,
        nickname: displayNickname,
        allowPublicDisplayName: !!allowPublicDisplayName,
        avatarType: avatarType || '🧑‍🚀',
        avatar: avatarType || '🧑‍🚀',
        playFrequency: playFrequency || '每週 3 次',
        role: 'player',
        points: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      transaction.set(counterRef, { currentNumber: nextNumber });
    });
    
    res.json({ success: true, uid: userRecord.uid });
  } catch (err) {
    console.error('Registration failed:', err);
    if (err.code === 'auth/email-already-exists' || err.code === 'auth/email-already-in-use' || err.message?.includes('already exists') || err.message?.includes('already in use')) {
      return res.status(400).json({ success: false, error: 'email-already-in-use', message: '此信箱已註冊，請直接登入或更換信箱。' });
    }
    res.status(500).json({ success: false, error: err.code || 'unknown-error', message: err.message });
  }
});

app.post('/api/admin/migrate-users', verifyAdmin, async (req, res) => {
  if (!db) {
    return res.status(503).json({ success: false, error: 'FIREBASE_NOT_CONFIGURED', message: '伺服器未設定 Firebase Admin。' });
  }
  
  try {
    const usersSnap = await db.collection('Users').get();
    let migratedCount = 0;
    
    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();
      if (!userData.anonymizedStudentCode && userData.role !== 'teacher') {
        await db.runTransaction(async (transaction) => {
          const counterRef = db.collection('SystemCounters').doc('user_counter');
          const counterDoc = await transaction.get(counterRef);
          let currentNumber = 0;
          if (counterDoc.exists) {
            currentNumber = counterDoc.data().currentNumber || 0;
          }
          const nextNumber = currentNumber + 1;
          const anonymizedCode = 'S' + String(nextNumber).padStart(4, '0');
          
          // Query progress documents within the transaction
          const progressQuery = db.collection('PlayerCompetitionProgress').where('playerId', '==', userDoc.id);
          const progressSnap = await transaction.get(progressQuery);
          
          transaction.update(userDoc.ref, {
            anonymizedStudentNumber: nextNumber,
            anonymizedStudentCode: anonymizedCode,
            avatarType: userData.avatar || '🧑‍🚀',
            updatedAt: new Date().toISOString()
          });
          
          progressSnap.forEach((progDoc) => {
            transaction.update(progDoc.ref, {
              anonymizedStudentCode: anonymizedCode,
              allowPublicDisplayName: !!userData.allowPublicDisplayName
            });
          });
          
          transaction.set(counterRef, { currentNumber: nextNumber });
        });
        migratedCount++;
      }
    }
    
    res.json({ success: true, migratedCount });
  } catch (err) {
    console.error('Migration failed:', err);
    res.status(500).json({ success: false, error: err.code || 'unknown-error', message: err.message });
  }
});

app.get('/api/admin/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false });
  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ success: false });
  }
});

function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send('Unauthorized');
  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).send('Unauthorized');
  }
}

// --- Question Bank Persistence Logic ---
const banksFilePath = path.join(__dirname, 'banks.json');
if (!fs.existsSync(banksFilePath)) {
  fs.writeFileSync(banksFilePath, JSON.stringify([]));
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
  if (firebaseAuthClient) return firebaseAuthClient;
  // Firebase Admin 已於檔案頂端統一初始化；這裡只取用同一個 app，不再用不同的環境變數重複初始化。
  firebaseAuthClient = admin.apps.length ? admin.auth() : null;
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
    // 解析失敗代表檔案可能毀損；先把毀損檔備份起來，避免後續 writeStore 直接覆蓋造成資料永久遺失。
    try {
      const backupPath = `${storeFilePath}.corrupt.${Date.now()}.json`;
      fs.renameSync(storeFilePath, backupPath);
      console.error(`[store] 已將毀損的儲存檔備份為 ${backupPath}，本次以空資料回應。`);
    } catch (backupError) {
      console.error('[store] 備份毀損儲存檔失敗：', backupError.message);
    }
    return { questionBanks: [], shares: [], auditLogs: [], activities: [], studentAnswers: [], questionAnalytics: [], peerExplanations: [], helpRequests: [], helpResponses: [], studentCreatedQuestions: [], peerChallenges: [], peerReviewAssignments: [], wrongQuestionExchanges: [], learningGuilds: [], peerLearningSettings: [], moderationLogs: [] };
  }
}

// 原子化寫入：先寫到唯一暫存檔並 fsync 落盤，再以 rename 覆蓋目標檔。
// rename 在同一檔案系統為原子操作，可避免「寫到一半當機」導致儲存檔毀損。
// Node 為單執行緒且各處理器在 readStore→writeStore 之間沒有 await，
// 故 read-modify-write 在 JS 層即天然序列化，不會互相覆寫。
function writeStore(store) {
  const data = JSON.stringify(store, null, 2);
  const dir = path.dirname(storeFilePath);
  const tmpPath = path.join(dir, `.${path.basename(storeFilePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, storeFilePath);
  } catch (error) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* 忽略暫存檔清理失敗 */ }
    throw error;
  }
}

async function getPrincipal(req) {
  const decodedToken = await verifyFirebaseToken(req);
  let role = 'player';
  let userId = 'anonymous-player';
  let email = '';
  let displayName = '';
  let authVerified = false;

  if (decodedToken) {
    userId = decodedToken.uid;
    email = decodedToken.email || '';
    displayName = decodedToken.name || '';
    authVerified = true;

    // Check token claims
    if (decodedToken.role === 'gm_teacher_admin') {
      role = 'gm_teacher_admin';
    } else {
      // Check database role as fallback
      if (db) {
        try {
          const userDoc = await db.collection('Users').doc(userId).get();
          if (userDoc.exists && userDoc.data().role === 'gm_teacher_admin') {
            role = 'gm_teacher_admin';
          } else if (userDoc.exists) {
            role = userDoc.data().role || 'player';
          }
        } catch (dbErr) {
          console.error('[getPrincipal] Failed to read user doc:', dbErr);
        }
      }
    }
  } else {
    // 僅在「非正式環境」且未強制 Firebase 驗證時，才允許用 HTTP header 模擬身分（本機開發用）。
    // 正式環境（NODE_ENV=production）一律禁止，避免任何人送 x-user-role 就變成管理員。
    const allowHeaderIdentity =
      process.env.NODE_ENV !== 'production' &&
      String(process.env.REQUIRE_FIREBASE_AUTH || '').toLowerCase() !== 'true';
    if (allowHeaderIdentity) {
      role = req.header('x-user-role') || 'player';
      userId = req.header('x-user-id') || 'anonymous-player';
      email = req.header('x-user-email') || '';
      displayName = req.header('x-user-name') || '';
    }
  }

  // Force single admin check（管理員信箱僅來自環境變數，未設定則略過此自動授權）
  const adminEmail = String(process.env.GM_TEACHER_ADMIN_EMAIL || '').toLowerCase();
  if (adminEmail && email && email.toLowerCase() === adminEmail) {
    role = 'gm_teacher_admin';
  }

  // Map legacy roles to player
  if (role !== 'gm_teacher_admin') {
    role = 'player';
  }

  return {
    userId,
    role,
    requestedRole: role,
    trustedAdmin: role === 'gm_teacher_admin',
    authVerified,
    authSource: decodedToken ? 'firebase_id_token' : 'headers',
    email,
    displayName,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || ''
  };
}

function isAdmin(principal) {
  return principal && principal.role === 'gm_teacher_admin';
}

async function requirePrincipal(req, res, next) {
  req.principal = await getPrincipal(req);
  if (String(process.env.REQUIRE_FIREBASE_AUTH || '').toLowerCase() === 'true' && !req.principal.authVerified) {
    return res.status(401).json({ error: '需要登入驗證。' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.principal)) return res.status(403).json({ error: '需要管理員權限 (gm_teacher_admin)。' });
  next();
}

function isTeacherRole(principal) {
  return principal && principal.role === 'gm_teacher_admin';
}

function requireTeacher(req, res, next) {
  if (!isTeacherRole(req.principal)) return res.status(403).json({ error: '需要管理員權限 (gm_teacher_admin)。' });
  next();
}

async function rateLimitMutations(req, res, next) {
  const principal = req.principal || await getPrincipal(req);
  const key = `${principal.userId}:${Math.floor(Date.now() / MUTATION_WINDOW_MS)}`;
  const count = (mutationBuckets.get(key) || 0) + 1;
  mutationBuckets.set(key, count);
  if (count > MUTATION_LIMIT) return res.status(429).json({ error: '題庫請求過於頻繁，請稍後再試。' });
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
    res.status(404).json({ error: '找不到題庫。' });
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
    disclaimer: '此報告為 AI 輔助與規則式檢查，可能標示潛在權利疑慮，但不是法律結論。上傳、分享、匯出或複製內容前，請確認你已取得必要授權。',
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
    disclaimer: 'AI 輔助建議僅供預覽。任何變更儲存前，都必須由老師檢視並確認。',
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
  if (!worksheet) throw new Error('Excel 檔案中沒有可讀取的工作表。');

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
    throw new Error('無法在 Excel 檔案中辨識必要的題目與答案欄位。');
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
    const error = new Error('沒有符合所選活動設定的可用題目。');
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

function moderationTimelineEvent(log) {
  const isReport = log.actionType === 'REPORT_CONTENT';
  const isRestrictive = ['MODERATE_HIDE', 'MODERATE_DELETE', 'MODERATE_LOCK', 'MODERATE_REJECT'].includes(log.actionType);
  const isResolution = ['MODERATE_APPROVE', 'MODERATE_FEATURE', 'MODERATE_UNLOCK'].includes(log.actionType);
  return {
    id: log.id,
    createdAt: log.createdAt,
    actorUserId: log.actorUserId,
    actorRole: log.actorRole,
    actionType: log.actionType,
    targetType: log.targetType,
    targetId: log.targetId,
    targetStatus: log.targetStatus,
    targetClassId: log.targetClassId,
    targetSummary: log.targetSummary,
    reason: log.reason,
    eventKind: isReport ? 'report' : 'moderation',
    severity: isRestrictive ? 'high' : (isReport ? 'medium' : (isResolution ? 'resolved' : 'review')),
    title: isReport
      ? `Report received for ${log.targetType}`
      : `${log.actionType.replace('MODERATE_', '').toLowerCase()} ${log.targetType}`
  };
}

function peerModerationTimeline(store, query = {}) {
  const logs = filteredModerationLogs(store, { ...query, limit: Math.min(500, Number(query.limit || 120)) });
  const events = logs.map(moderationTimelineEvent);
  const cases = Object.values(events.reduce((acc, event) => {
    const key = `${event.targetType}:${event.targetId}`;
    if (!acc[key]) {
      acc[key] = {
        key,
        targetType: event.targetType,
        targetId: event.targetId,
        targetClassId: event.targetClassId,
        targetSummary: event.targetSummary,
        targetStatus: event.targetStatus,
        eventCount: 0,
        reportCount: 0,
        moderationCount: 0,
        firstEventAt: event.createdAt,
        lastEventAt: event.createdAt,
        lastActionType: event.actionType,
        lastReason: event.reason,
        severity: event.severity
      };
    }
    const item = acc[key];
    item.eventCount += 1;
    if (event.eventKind === 'report') item.reportCount += 1;
    else item.moderationCount += 1;
    item.firstEventAt = event.createdAt < item.firstEventAt ? event.createdAt : item.firstEventAt;
    item.lastEventAt = event.createdAt > item.lastEventAt ? event.createdAt : item.lastEventAt;
    if (event.createdAt >= item.lastEventAt) {
      item.lastActionType = event.actionType;
      item.lastReason = event.reason;
      item.targetStatus = event.targetStatus;
      item.severity = event.severity;
    }
    return acc;
  }, {}))
    .sort((a, b) => String(b.lastEventAt).localeCompare(String(a.lastEventAt)))
    .slice(0, 40);
  return {
    generatedAt: nowIso(),
    classId: peerClassId(query),
    events,
    cases,
    summary: {
      totalEvents: events.length,
      reportEvents: events.filter((event) => event.eventKind === 'report').length,
      moderationEvents: events.filter((event) => event.eventKind === 'moderation').length,
      activeCases: cases.filter((item) => !['approved', 'hidden', 'deleted'].includes(item.targetStatus)).length
    }
  };
}

function peerModerationCaseDetail(store, query = {}) {
  const targetType = sanitizeCell(query.targetType || '');
  const targetId = sanitizeCell(query.targetId || '');
  if (!targetType || !targetId) return { ok: false, status: 400, error: '需要目標類型與目標 ID。' };
  const target = moderationTarget(store, targetType, targetId);
  if (!target) return { ok: false, status: 404, error: '找不到時間線案件目標。' };
  const logs = filteredModerationLogs(store, { ...query, targetType, limit: 1000 })
    .filter((log) => log.targetId === targetId);
  const events = logs.map(moderationTimelineEvent);
  const targetSummary = sanitizeCell(target.name || target.prompt || target.message || target.content || target.knowledgePoint || target.mode || '');
  return {
    ok: true,
    generatedAt: nowIso(),
    case: {
      key: `${targetType}:${targetId}`,
      targetType,
      targetId,
      targetStatus: target.status || '',
      targetClassId: target.classId || '',
      targetSummary,
      reportCount: Number(target.reportCount || 0),
      teacherReviewNote: target.teacherReviewNote || '',
      moderationLocked: Boolean(target.moderationLocked),
      createdAt: target.createdAt || '',
      updatedAt: target.updatedAt || ''
    },
    target: {
      id: target.id,
      status: target.status || '',
      classId: target.classId || '',
      questionId: target.questionId || '',
      knowledgePoint: target.knowledgePoint || '',
      studentName: target.studentName || target.creatorName || target.responderName || target.challengerName || '',
      prompt: sanitizeCell(target.prompt || target.questionPrompt || ''),
      content: sanitizeCell(target.explanationText || target.message || target.content || target.feedbackText || target.submissionText || target.weeklyGoal || ''),
      reason: sanitizeCell(target.creationReason || target.reflection || target.teacherReviewNote || '')
    },
    events,
    summary: {
      totalEvents: events.length,
      reportEvents: events.filter((event) => event.eventKind === 'report').length,
      moderationEvents: events.filter((event) => event.eventKind === 'moderation').length,
      lastActionType: events[0]?.actionType || '',
      lastEventAt: events[0]?.createdAt || ''
    }
  };
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
    studentName: explanation.anonymous && !canModerate ? '匿名同學' : explanation.studentName,
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
      responderName: response.anonymous && !canModerate ? '匿名協助者' : response.responderName
    }));
  return {
    ...request,
    studentId: canModerate || request.studentId === principal.userId ? request.studentId : undefined,
    studentName: request.anonymous && !canModerate ? '匿名同學' : request.studentName,
    responses
  };
}

function publicStudentQuestion(question, principal) {
  const canModerate = isTeacherRole(principal);
  return {
    ...question,
    creatorStudentId: canModerate || question.creatorStudentId === principal.userId ? question.creatorStudentId : undefined,
    creatorName: question.anonymous && !canModerate ? '匿名出題者' : question.creatorName,
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
    reviewerName: assignment.anonymous && !canModerate && assignment.revieweeStudentId === principal.userId ? '匿名評閱者' : assignment.reviewerName,
    revieweeName: assignment.anonymous && !canModerate && assignment.reviewerStudentId === principal.userId ? '匿名同學' : assignment.revieweeName
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

const PEER_FEATURE_LABELS = {
  peerExplanations: '同儕解析',
  helpRequests: '互助求救',
  studentQuestions: '學生自創題',
  peerChallenges: '同儕挑戰',
  peerReviews: '同儕互評',
  wrongExchanges: '錯題交換',
  learningGuilds: '學習小組',
  allowAnonymous: '匿名模式',
  moderationRequired: '教師審核'
};

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
    safetyNote: '同儕學習以題目、解析、互評、錯題修復與小組任務為核心進行結構化互動。教師保有最終審核控制權。'
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
    error: `${PEER_FEATURE_LABELS[feature] || '此功能'}已由本班教師停用。`,
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
  if (!target) return { ok: false, status: 404, error: '找不到審核目標。', targetType, targetId };
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
  if (!statusByAction[action]) return { ok: false, status: 400, error: '不支援的審核操作。', targetType, targetId };
  if (targetType === 'studentQuestion' && action === 'add_to_teacher_bank') {
    const bank = (store.questionBanks || []).find((item) => item.id === target.questionBankId && !item.deletedAt);
    if (!bank) return { ok: false, status: 400, error: '加入學生自創題前，需要指定教師題庫。', targetType, targetId };
    const permission = getPermission(store, bank, principal);
    if (!permission.canEdit) return { ok: false, status: 403, error: '只有題庫擁有者或管理員可以將學生自創題加入題庫。', targetType, targetId };
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
    if (ext !== '.xlsx') return cb(new Error('不支援的檔案格式，請上傳 .xlsx 檔案。'));
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
  if (!permission.canView) return res.status(403).json({ error: '你沒有存取此題庫的權限。' });
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
    if (!req.file) return res.status(400).json({ error: '尚未上傳檔案。' });

    try {
      const defaults = req.body.defaults ? JSON.parse(req.body.defaults) : {};
      res.json(validateQuestions(await parseWorkbookExcelJs(req.file.buffer), req.principal, defaults));
    } catch (parseError) {
      res.status(400).json({ error: parseError.message });
    }
  });
});

app.post('/api/question-banks/import/commit', rateLimitMutations, (req, res) => {
  const { metadata = {}, rows = [], legalAcknowledged, importValidOnly } = req.body;
  if (!legalAcknowledged) return res.status(400).json({ error: '匯入前必須完成權利確認。' });

  const preview = validateQuestions(rows.map((row) => row.question || row), req.principal, metadata);
  
  let finalQuestions = [];
  if (importValidOnly) {
    finalQuestions = preview.rows.filter(r => r.valid).map(r => r.question);
  } else {
    if (preview.summary.invalidRows > 0) {
      return res.status(422).json({ error: '匯入內容包含驗證錯誤。', preview });
    }
    finalQuestions = preview.rows.map(r => r.question);
  }

  if (finalQuestions.length === 0) {
    return res.status(400).json({ error: '沒有可匯入的有效題目。' });
  }

  const store = readStore();
  const bank = createQuestionBank({ principal: req.principal, metadata, questions: finalQuestions, legalAcknowledged });
  store.questionBanks.push(bank);

  if (req.principal.role === 'gm_teacher_admin') {
    logGMAction(req.principal, 'import_question_bank', 'questionBank', bank.id, `Imported question bank ${bank.title} (${finalQuestions.length} rows)`, { targetQuestionBankId: bank.id, count: finalQuestions.length });
  }

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
  if (!legalAcknowledged) return res.status(400).json({ error: '必須完成權利確認。' });

  const preview = validateQuestions(questions, req.principal, metadata);
  if (preview.summary.invalidRows > 0) return res.status(422).json({ error: '題庫包含驗證錯誤。', preview });

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
  if (!permission.canEdit) return res.status(403).json({ error: '只有擁有者或管理員可以編輯此題庫。' });

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
  if (!getPermission(store, bank, req.principal).canEdit) return res.status(403).json({ error: '只有擁有者或管理員可以新增題目。' });

  const preview = validateQuestions([req.body], req.principal, bank);
  if (preview.summary.invalidRows > 0) return res.status(422).json({ error: '題目包含驗證錯誤。', preview });
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
  if (!getPermission(store, bank, req.principal).canEdit) return res.status(403).json({ error: '只有擁有者或管理員可以編輯題目。' });

  const questionIndex = (bank.questions || []).findIndex((question) => question.id === req.params.questionId && !question.deletedAt);
  if (questionIndex === -1) return res.status(404).json({ error: '找不到題目。' });
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
  if (!getPermission(store, bank, req.principal).canEdit) return res.status(403).json({ error: '只有擁有者或管理員可以刪除題目。' });

  const question = (bank.questions || []).find((item) => item.id === req.params.questionId && !item.deletedAt);
  if (!question) return res.status(404).json({ error: '找不到題目。' });
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
  if (!getPermission(store, bank, req.principal).canDelete) return res.status(403).json({ error: '只有擁有者或管理員可以刪除此題庫。' });

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
  if (!canRestore) return res.status(403).json({ error: '只有擁有者或管理員可以還原此題庫。' });
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
  if (!getPermission(store, bank, req.principal).canShare) return res.status(403).json({ error: '只有擁有者可以分享此題庫。' });
  if (!req.body.legalAcknowledged) return res.status(400).json({ error: '分享前必須完成權利確認。' });

  const sharedWithTeacherId = sanitizeCell(req.body.sharedWithTeacherId || req.body.email);
  if (!sharedWithTeacherId) return res.status(400).json({ error: '需要老師 ID 或電子郵件。' });

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
  if (!getPermission(store, bank, req.principal).canShare) return res.status(403).json({ error: '只有擁有者可以收回分享。' });

  const share = store.shares.find((item) => item.id === req.params.shareId && item.questionBankId === bank.id && !item.revokedAt);
  if (!share) return res.status(404).json({ error: '找不到分享紀錄。' });
  share.revokedAt = nowIso();
  addAudit(store, req.principal, 'REVOKE_QUESTION_BANK_SHARE', 'questionBankShare', share.id, { targetQuestionBankId: bank.id, share });
  writeStore(store);
  res.json({ ok: true });
});

app.post('/api/question-banks/:id/export', rateLimitMutations, async (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  if (!getPermission(store, bank, req.principal).canExport) return res.status(403).json({ error: '此題庫未允許匯出。' });

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
  if (!getPermission(store, source, req.principal).canCopy) return res.status(403).json({ error: '此題庫未允許複製。' });

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
  if (!getPermission(store, bank, req.principal).canUse) return res.status(403).json({ error: '你不能在課堂或任務中使用此題庫。' });
  addAudit(store, req.principal, 'SCHEDULE_QUESTION_BANK', 'questionBank', bank.id, { targetQuestionBankId: bank.id, context: req.body || {} });
  writeStore(store);
  res.json({ ok: true });
});

app.post('/api/question-banks/:id/activities', rateLimitMutations, (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const permission = getPermission(store, bank, req.principal);
  if (!permission.canUse) return res.status(403).json({ error: '你不能使用此題庫建立課堂活動。' });

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
  if (!getPermission(store, bank, req.principal).canUse) return res.status(403).json({ error: '你不能查看此題庫的活動。' });
  res.json((store.activities || []).filter((activity) => activity.questionBankId === bank.id && activity.createdBy === req.principal.userId));
});

app.get('/api/question-banks/:id/weakness-report', (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  if (!getPermission(store, bank, req.principal).canUse) return res.status(403).json({ error: '你不能查看此題庫的學習報告。' });
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
  if (!getPermission(store, bank, req.principal).canUse) return res.status(403).json({ error: '你不能查看此題庫的錯題紀錄。' });
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
  if (!permission.canView) return res.status(403).json({ error: '你沒有存取此題庫的權限。' });

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
  if (!permission.canEdit) return res.status(403).json({ error: '只有擁有者可以對此題庫執行 AI 修改預覽。' });

  const actionType = sanitizeCell(req.body.actionType || '');
  const allowedActions = ['auto_tag', 'generate_explanations', 'improve_clarity', 'check_rights_risk'];
  if (!allowedActions.includes(actionType)) return res.status(400).json({ error: '不支援的 AI 預覽操作。' });

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
  if (!permission.canEdit) return res.status(403).json({ error: '只有擁有者可以將 AI 輔助變更套用到此題庫。' });
  if (!req.body.teacherConfirmed) return res.status(400).json({ error: '套用 AI 輔助變更前需要老師確認。' });
  if (!req.body.legalAcknowledged) return res.status(400).json({ error: '套用 AI 輔助變更前需要完成權利與政策確認。' });

  const actionType = sanitizeCell(req.body.actionType || '');
  const allowedActions = ['auto_tag', 'generate_explanations', 'improve_clarity', 'check_rights_risk'];
  if (!allowedActions.includes(actionType)) return res.status(400).json({ error: '不支援的 AI 預覽操作。' });

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
  if (!permission.isOwner && !permission.isAdmin) return res.status(403).json({ error: '只有擁有者或管理員可以查看版本歷史。' });
  ensureVersionHistory(bank, req.principal);
  writeStore(store);
  res.json(bank.versions || []);
});

app.get('/api/question-banks/:id/versions/:versionId/compare', (req, res) => {
  const store = readStore();
  const bank = findBankOr404(store, req.params.id, res);
  if (!bank) return;
  const permission = getPermission(store, bank, req.principal);
  if (!permission.isOwner && !permission.isAdmin) return res.status(403).json({ error: '只有擁有者或管理員可以比較版本歷史。' });
  ensureVersionHistory(bank, req.principal);
  const version = (bank.versions || []).find((item) => item.id === req.params.versionId);
  if (!version) return res.status(404).json({ error: '找不到版本。' });
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
  if (!canRestore) return res.status(403).json({ error: '只有擁有者或管理員可以還原題庫版本。' });
  ensureVersionHistory(bank, req.principal);
  const version = (bank.versions || []).find((item) => item.id === req.params.versionId);
  if (!version) return res.status(404).json({ error: '找不到版本。' });

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
  if (!permission.isOwner && !permission.isAdmin) return res.status(403).json({ error: '只有擁有者或管理員可以查看操作紀錄。' });
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
  if (text.length < 12) return res.status(400).json({ error: '解析必須包含有意義的學習提示或推理。' });
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
  if (!explanation) return res.status(404).json({ error: '找不到同儕解析。' });
  const feature = ensurePeerFeatureEnabled(store, explanation.classId || '', 'peerExplanations', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (!visiblePeerExplanation(explanation, req.principal)) return res.status(403).json({ error: '此解析目前不可用。' });
  const voteType = sanitizeCell(req.body.voteType || '');
  if (!['helpful', 'clear', 'needs_improvement'].includes(voteType)) return res.status(400).json({ error: '不支援的投票類型。' });
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
  if (message.length < 8) return res.status(400).json({ error: '求助請描述你卡住的地方。' });
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
  if (!request) return res.status(404).json({ error: '找不到求助請求。' });
  const feature = ensurePeerFeatureEnabled(store, request.classId || '', 'helpRequests', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (request.status === 'resolved') return res.status(400).json({ error: '此求助請求已解決。' });
  const content = sanitizeCell(req.body.content || '');
  if (content.length < 8) return res.status(400).json({ error: '協助回覆必須包含提示、範例或解釋。' });
  const responseType = sanitizeCell(req.body.responseType || 'hint');
  if (!['hint', 'step_explanation', 'example', 'guiding_question', 'concept_reminder'].includes(responseType)) return res.status(400).json({ error: '不支援的協助回覆類型。' });
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
  if (!response) return res.status(404).json({ error: '找不到協助回覆。' });
  const request = store.helpRequests.find((item) => item.id === response.helpRequestId);
  if (!request) return res.status(404).json({ error: '找不到求助請求。' });
  const feature = ensurePeerFeatureEnabled(store, request.classId || '', 'helpRequests', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (request.studentId !== req.principal.userId && !isTeacherRole(req.principal)) return res.status(403).json({ error: '只有求助者或老師可以將回覆標記為有幫助。' });
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
  if (prompt.length < 8) return res.status(400).json({ error: '學生自創題必須包含清楚題目。' });
  if (answer.length < 1) return res.status(400).json({ error: '學生自創題必須包含答案。' });
  const type = sanitizeCell(req.body.type || 'multiple_choice');
  if (!['multiple_choice', 'true_false', 'fill_blank', 'short_answer', 'matching', 'essay'].includes(type)) return res.status(400).json({ error: '不支援的學生自創題型。' });
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
  if (!studentQuestion) return res.status(404).json({ error: '找不到學生自創題。' });
  const feature = ensurePeerFeatureEnabled(store, studentQuestion.classId || '', 'studentQuestions', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (!visibleStudentQuestion(studentQuestion, req.principal)) return res.status(403).json({ error: '此學生自創題目前不可用。' });
  const clarity = Math.max(0, Math.min(5, Number(req.body.clarity || 0)));
  const correctness = Math.max(0, Math.min(5, Number(req.body.correctness || 0)));
  const helpfulness = Math.max(0, Math.min(5, Number(req.body.helpfulness || 0)));
  const difficultyFit = Math.max(0, Math.min(5, Number(req.body.difficultyFit || 0)));
  if (![clarity, correctness, helpfulness, difficultyFit].every((score) => score > 0)) return res.status(400).json({ error: '品質投票必須包含清楚度、正確性、幫助度與難度適配，分數介於 1 到 5。' });
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
  if (!['one_v_one', 'random', 'rematch', 'weakness'].includes(mode)) return res.status(400).json({ error: '不支援的同儕挑戰模式。' });
  if (mode !== 'random' && !opponentStudentId) return res.status(400).json({ error: '此挑戰模式需要對手學生 ID。' });
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
  if (!challenge) return res.status(404).json({ error: '找不到同儕挑戰。' });
  const feature = ensurePeerFeatureEnabled(store, challenge.classId || '', 'peerChallenges', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (challenge.opponentStudentId !== req.principal.userId && !isTeacherRole(req.principal)) return res.status(403).json({ error: '只有被挑戰學生或老師可以回應。' });
  const action = sanitizeCell(req.body.action || '');
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: '不支援的挑戰回應。' });
  challenge.status = action === 'accept' ? 'accepted' : 'declined';
  challenge.respondedAt = nowIso();
  addAudit(store, req.principal, `${action === 'accept' ? 'ACCEPT' : 'DECLINE'}_PEER_CHALLENGE`, 'peerChallenge', challenge.id, {});
  writeStore(store);
  res.json(publicPeerChallenge(challenge, req.principal));
});

app.post('/api/peer-learning/challenges/:id/complete', rateLimitMutations, (req, res) => {
  const store = readStore();
  const challenge = store.peerChallenges.find((item) => item.id === req.params.id && item.status !== 'deleted');
  if (!challenge) return res.status(404).json({ error: '找不到同儕挑戰。' });
  const feature = ensurePeerFeatureEnabled(store, challenge.classId || '', 'peerChallenges', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  const isParticipant = [challenge.challengerStudentId, challenge.opponentStudentId].includes(req.principal.userId);
  if (!isParticipant && !isTeacherRole(req.principal)) return res.status(403).json({ error: '只有參與者或老師可以完成此挑戰。' });
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
  if (!reviewerStudentId) return res.status(400).json({ error: '需要評閱者學生 ID。' });
  if (submissionText.length < 12) return res.status(400).json({ error: '同儕互評任務必須包含要評閱的提交內容。' });
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
  if (!assignment) return res.status(404).json({ error: '找不到同儕互評任務。' });
  const feature = ensurePeerFeatureEnabled(store, assignment.classId || '', 'peerReviews', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (assignment.reviewerStudentId !== req.principal.userId && !isTeacherRole(req.principal)) return res.status(403).json({ error: '只有被指派的評閱者或老師可以提交此互評。' });
  const feedbackText = sanitizeCell(req.body.feedbackText || '');
  if (feedbackText.length < 12) return res.status(400).json({ error: '同儕互評回饋必須具體且具建設性。' });
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
  if (!studentBId) return res.status(400).json({ error: '錯題交換需要夥伴學生 ID。' });
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
  if (!exchange) return res.status(404).json({ error: '找不到錯題交換。' });
  const feature = ensurePeerFeatureEnabled(store, exchange.classId || '', 'wrongExchanges', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  const isParticipant = [exchange.studentAId, exchange.studentBId].includes(req.principal.userId);
  if (!isParticipant && !isTeacherRole(req.principal)) return res.status(403).json({ error: '只有參與者或老師可以完成此交換。' });
  const reflection = sanitizeCell(req.body.reflection || '');
  if (reflection.length < 8) return res.status(400).json({ error: '完成錯題交換需要填寫反思。' });
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
  if (name.length < 2) return res.status(400).json({ error: '需要學習小組名稱。' });
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
  if (!guild) return res.status(404).json({ error: '找不到學習小組。' });
  const feature = ensurePeerFeatureEnabled(store, guild.classId || '', 'learningGuilds', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  if (guild.moderationLocked && !isTeacherRole(req.principal)) return res.status(403).json({ error: '此學習小組已被老師鎖定。' });
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
  if (!guild) return res.status(404).json({ error: '找不到學習小組。' });
  const feature = ensurePeerFeatureEnabled(store, guild.classId || '', 'learningGuilds', req.principal);
  if (!feature.ok) return res.status(feature.status).json({ error: feature.error, settings: feature.settings });
  const canModerate = isTeacherRole(req.principal);
  const member = (guild.members || []).find((item) => item.studentId === req.principal.userId);
  if (!member && !canModerate) return res.status(403).json({ error: '加入此學習小組後才能新增進度。' });
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
  if (!target) return res.status(404).json({ error: '找不到檢舉目標。' });
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
    note: '此排行榜獎勵協助、解析與進步導向行為，而不只看原始分數。'
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

app.get('/api/peer-learning/teacher/timeline', requireTeacher, (req, res) => {
  const store = readStore();
  res.json(peerModerationTimeline(store, req.query));
});

app.get('/api/peer-learning/teacher/timeline/case', requireTeacher, (req, res) => {
  const store = readStore();
  const detail = peerModerationCaseDetail(store, req.query);
  if (!detail.ok) return res.status(detail.status || 400).json({ error: detail.error });
  res.json(detail);
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
  if (!items.length) return res.status(400).json({ error: '批次審核至少需要一個目標項目。' });
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
  if (!['active', 'draft', 'locked', 'suspended', 'deleted', 'rights-review-needed'].includes(nextStatus)) return res.status(400).json({ error: '不支援的狀態。' });
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

// --- GM Action Logging Helper ---
async function logGMAction(principal, actionType, targetType, targetId, description, metadata = {}) {
  if (!db) return;
  try {
    const id = `gmlog_${crypto.randomUUID()}`;
    const logDoc = {
      id,
      actorUserId: principal.userId,
      actorEmail: principal.email || 'unknown',
      actionType,
      targetType,
      targetId: targetId || null,
      description,
      metadata,
      createdAt: new Date().toISOString()
    };
    await db.collection('GMTeacherAdminActionLog').doc(id).set(logDoc);
  } catch (error) {
    console.error('[GM Audit Log] failed to write:', error);
  }
}

// GM Audit logs list
app.get('/api/admin/gm-logs', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const snap = await db.collection('GMTeacherAdminActionLog').orderBy('createdAt', 'desc').limit(200).get();
    const logs = [];
    snap.forEach(doc => logs.push(doc.data()));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all students (emails masked by default)
app.get('/api/admin/all-users', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const snap = await db.collection('Users').get();
    const users = [];
    snap.forEach(doc => {
      const data = doc.data();
      if (data.role !== 'gm_teacher_admin') {
        const maskedEmail = data.email ? data.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : '無信箱';
        users.push({
          ...data,
          email: maskedEmail,
          rawEmailHidden: true
        });
      }
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reveal student email with audit log
app.post('/api/admin/users/:userId/reveal-email', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const userDoc = await db.collection('Users').doc(req.params.userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: '找不到該用戶。' });
    const userData = userDoc.data();
    
    // Log GM action
    await logGMAction(
      req.principal,
      'reveal_student_email',
      'user',
      userData.id,
      `GM revealed email of student ${userData.anonymizedStudentCode || userData.id}`,
      { studentId: userData.id, studentNickname: userData.nickname || userData.displayName }
    );

    res.json({ success: true, email: userData.email || '無信箱' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rewards granting
app.post('/api/admin/rewards', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const { playerIds, target, rewardType, amount, badge, token, outfit, item, stageUnlock, reason } = req.body;
  try {
    let targets = [];
    if (target === 'all') {
      const usersSnap = await db.collection('Users').where('role', '==', 'player').get();
      usersSnap.forEach(d => targets.push(d.data()));
    } else if (Array.isArray(playerIds)) {
      for (const id of playerIds) {
        const docSnap = await db.collection('Users').doc(id).get();
        if (docSnap.exists) targets.push(docSnap.data());
      }
    }

    const updates = [];
    for (const t of targets) {
      const userRef = db.collection('Users').doc(t.id);
      const updateData = { updatedAt: new Date().toISOString() };

      if (rewardType === 'points' && amount) {
        updateData.points = admin.firestore.FieldValue.increment(Number(amount));
        // Also record transaction
        const txId = `tx_${crypto.randomUUID()}`;
        await db.collection('PointTransactions').doc(txId).set({
          id: txId,
          playerId: t.id,
          amount: Number(amount),
          reason: reason || 'GM 獎勵贈送',
          createdAt: new Date().toISOString()
        });
      } else if (rewardType === 'badges' && badge) {
        updateData.badges = admin.firestore.FieldValue.arrayUnion(badge);
      } else if (rewardType === 'tokens' && token) {
        updateData.tokens = admin.firestore.FieldValue.arrayUnion(token);
      } else if (rewardType === 'outfits' && outfit) {
        updateData.outfits = admin.firestore.FieldValue.arrayUnion(outfit);
      } else if (rewardType === 'items' && item) {
        updateData.items = admin.firestore.FieldValue.arrayUnion(item);
      } else if (rewardType === 'stage_unlock' && stageUnlock) {
        updateData.stageUnlockPermissions = admin.firestore.FieldValue.arrayUnion(stageUnlock);
      }

      await userRef.set(updateData, { merge: true });
      updates.push(t.anonymizedStudentCode || t.id);
    }

    await logGMAction(
      req.principal,
      'grant_reward',
      'rewards',
      null,
      `GM granted ${rewardType} reward to ${target === 'all' ? 'all players' : updates.join(', ')}`,
      { rewardType, amount, badge, token, outfit, item, stageUnlock, reason, targetCount: updates.length }
    );

    res.json({ success: true, count: updates.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Grant points to players
app.post('/api/admin/points', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const { playerIds, target, amount, reason } = req.body;
  try {
    let targets = [];
    if (target === 'all') {
      const usersSnap = await db.collection('Users').where('role', '==', 'player').get();
      usersSnap.forEach(d => targets.push(d.data()));
    } else if (Array.isArray(playerIds)) {
      for (const id of playerIds) {
        const docSnap = await db.collection('Users').doc(id).get();
        if (docSnap.exists) targets.push(docSnap.data());
      }
    }

    const updates = [];
    for (const t of targets) {
      const userRef = db.collection('Users').doc(t.id);
      await userRef.set({
        points: admin.firestore.FieldValue.increment(Number(amount)),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      const txId = `tx_${crypto.randomUUID()}`;
      await db.collection('PointTransactions').doc(txId).set({
        id: txId,
        playerId: t.id,
        amount: Number(amount),
        reason: reason || 'GM 點數調整',
        createdAt: new Date().toISOString()
      });
      updates.push(t.anonymizedStudentCode || t.id);
    }

    await logGMAction(
      req.principal,
      'grant_points',
      'points',
      null,
      `GM granted ${amount} points to ${target === 'all' ? 'all players' : updates.join(', ')}`,
      { amount, reason, targetCount: updates.length }
    );

    res.json({ success: true, count: updates.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get player points transactions history
app.get('/api/points/transactions', requirePrincipal, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    let q = db.collection('PointTransactions');
    if (req.principal.role !== 'gm_teacher_admin') {
      q = q.where('playerId', '==', req.principal.userId);
    }
    const snap = await q.orderBy('createdAt', 'desc').get();
    const txs = [];
    snap.forEach(d => txs.push(d.data()));
    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CRUD - Images Library
app.get('/api/admin/images-library', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const snap = await db.collection('UploadedImages').orderBy('createdAt', 'desc').get();
    const images = [];
    snap.forEach(d => images.push(d.data()));
    res.json(images);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/images-library', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const { imageUrl, name, type } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'Missing imageUrl' });
    
    // Check if the image already exists in the collection to avoid duplicates
    const existingSnap = await db.collection('UploadedImages')
      .where('imageUrl', '==', imageUrl)
      .limit(1)
      .get();
      
    if (!existingSnap.empty) {
      let existingDoc = null;
      existingSnap.forEach(d => { existingDoc = d.data(); });
      return res.json(existingDoc);
    }
    
    const imageDoc = {
      id: `img_${crypto.randomUUID()}`,
      name: sanitizeCell(name || '未命名圖片'),
      type: sanitizeCell(type || 'general'), // 'character' | 'scene' | 'general'
      imageUrl,
      createdAt: new Date().toISOString()
    };
    
    await db.collection('UploadedImages').doc(imageDoc.id).set(imageDoc);
    res.status(201).json(imageDoc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CRUD - Characters
app.get('/api/admin/characters', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const snap = await db.collection('Characters').get();
    const chars = [];
    snap.forEach(d => chars.push(d.data()));
    res.json(chars);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/characters', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const char = {
      id: `char_${crypto.randomUUID()}`,
      name: sanitizeCell(req.body.name || ''),
      description: sanitizeCell(req.body.description || ''),
      unlockConditions: sanitizeCell(req.body.unlockConditions || ''),
      avatarSymbol: sanitizeCell(req.body.avatarSymbol || '🧑‍🚀'),
      imageUrl: req.body.imageUrl || '',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.collection('Characters').doc(char.id).set(char);
    await logGMAction(req.principal, 'create_character', 'character', char.id, `Created character ${char.name}`, char);
    res.status(201).json(char);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/characters/:id', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const updateData = {
      name: sanitizeCell(req.body.name || ''),
      description: sanitizeCell(req.body.description || ''),
      unlockConditions: sanitizeCell(req.body.unlockConditions || ''),
      avatarSymbol: sanitizeCell(req.body.avatarSymbol || '🧑‍🚀'),
      imageUrl: req.body.imageUrl || '',
      status: sanitizeCell(req.body.status || 'active'),
      updatedAt: new Date().toISOString()
    };
    await db.collection('Characters').doc(req.params.id).set(updateData, { merge: true });
    await logGMAction(req.principal, 'edit_character', 'character', req.params.id, `Updated character ${updateData.name}`, updateData);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/characters/:id', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    await db.collection('Characters').doc(req.params.id).set({ status: 'archived', updatedAt: new Date().toISOString() }, { merge: true });
    await logGMAction(req.principal, 'archive_character', 'character', req.params.id, `Archived character id ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CRUD - Scenes
app.get('/api/admin/scenes', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const snap = await db.collection('Scenes').get();
    const scenes = [];
    snap.forEach(d => scenes.push(d.data()));
    res.json(scenes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/scenes', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const scene = {
      id: `scene_${crypto.randomUUID()}`,
      name: sanitizeCell(req.body.name || ''),
      description: sanitizeCell(req.body.description || ''),
      linkedWorldId: sanitizeCell(req.body.linkedWorldId || ''),
      imageUrl: req.body.imageUrl || '',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.collection('Scenes').doc(scene.id).set(scene);
    await logGMAction(req.principal, 'create_scene', 'scene', scene.id, `Created scene ${scene.name}`, scene);
    res.status(201).json(scene);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/scenes/:id', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const updateData = {
      name: sanitizeCell(req.body.name || ''),
      description: sanitizeCell(req.body.description || ''),
      linkedWorldId: sanitizeCell(req.body.linkedWorldId || ''),
      imageUrl: req.body.imageUrl || '',
      status: sanitizeCell(req.body.status || 'active'),
      updatedAt: new Date().toISOString()
    };
    await db.collection('Scenes').doc(req.params.id).set(updateData, { merge: true });
    await logGMAction(req.principal, 'edit_scene', 'scene', req.params.id, `Updated scene ${updateData.name}`, updateData);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/scenes/:id', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    await db.collection('Scenes').doc(req.params.id).set({ status: 'archived', updatedAt: new Date().toISOString() }, { merge: true });
    await logGMAction(req.principal, 'archive_scene', 'scene', req.params.id, `Archived scene id ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CRUD - Items
app.get('/api/admin/items', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const snap = await db.collection('Items').get();
    const items = [];
    snap.forEach(d => items.push(d.data()));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/items', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const item = {
      id: `item_${crypto.randomUUID()}`,
      name: sanitizeCell(req.body.name || ''),
      description: sanitizeCell(req.body.description || ''),
      effect: sanitizeCell(req.body.effect || ''),
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.collection('Items').doc(item.id).set(item);
    await logGMAction(req.principal, 'create_item', 'item', item.id, `Created item ${item.name}`, item);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/items/:id', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const updateData = {
      name: sanitizeCell(req.body.name || ''),
      description: sanitizeCell(req.body.description || ''),
      effect: sanitizeCell(req.body.effect || ''),
      status: sanitizeCell(req.body.status || 'active'),
      updatedAt: new Date().toISOString()
    };
    await db.collection('Items').doc(req.params.id).set(updateData, { merge: true });
    await logGMAction(req.principal, 'edit_item', 'item', req.params.id, `Updated item ${updateData.name}`, updateData);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/items/:id', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    await db.collection('Items').doc(req.params.id).set({ status: 'archived', updatedAt: new Date().toISOString() }, { merge: true });
    await logGMAction(req.principal, 'archive_item', 'item', req.params.id, `Archived item id ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CRUD - Introductions
app.get('/api/admin/introductions', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const snap = await db.collection('Introductions').get();
    const intros = [];
    snap.forEach(d => intros.push(d.data()));
    res.json(intros);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/introductions', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const intro = {
      id: `intro_${crypto.randomUUID()}`,
      targetType: sanitizeCell(req.body.targetType || 'general'),
      targetId: sanitizeCell(req.body.targetId || ''),
      title: sanitizeCell(req.body.title || ''),
      content: sanitizeCell(req.body.content || ''),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.collection('Introductions').doc(intro.id).set(intro);
    await logGMAction(req.principal, 'create_introduction', 'introduction', intro.id, `Created introduction ${intro.title}`, intro);
    res.status(201).json(intro);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/introductions/:id', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const updateData = {
      targetType: sanitizeCell(req.body.targetType || 'general'),
      targetId: sanitizeCell(req.body.targetId || ''),
      title: sanitizeCell(req.body.title || ''),
      content: sanitizeCell(req.body.content || ''),
      updatedAt: new Date().toISOString()
    };
    await db.collection('Introductions').doc(req.params.id).set(updateData, { merge: true });
    await logGMAction(req.principal, 'edit_introduction', 'introduction', req.params.id, `Updated introduction ${updateData.title}`, updateData);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/introductions/:id', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    await db.collection('Introductions').doc(req.params.id).delete();
    await logGMAction(req.principal, 'delete_introduction', 'introduction', req.params.id, `Deleted introduction id ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CRUD - Announcements
app.get('/api/admin/announcements', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const snap = await db.collection('Announcements').get();
    const list = [];
    snap.forEach(d => list.push(d.data()));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/announcements', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const ann = {
      id: `ann_${crypto.randomUUID()}`,
      title: sanitizeCell(req.body.title || ''),
      content: sanitizeCell(req.body.content || ''),
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.collection('Announcements').doc(ann.id).set(ann);
    await logGMAction(req.principal, 'publish_announcement', 'announcement', ann.id, `Published announcement ${ann.title}`, ann);
    res.status(201).json(ann);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/announcements/:id', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const updateData = {
      title: sanitizeCell(req.body.title || ''),
      content: sanitizeCell(req.body.content || ''),
      status: sanitizeCell(req.body.status || 'active'),
      updatedAt: new Date().toISOString()
    };
    await db.collection('Announcements').doc(req.params.id).set(updateData, { merge: true });
    await logGMAction(req.principal, 'edit_announcement', 'announcement', req.params.id, `Updated announcement ${updateData.title}`, updateData);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/announcements/:id', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    await db.collection('Announcements').doc(req.params.id).set({ status: 'archived', updatedAt: new Date().toISOString() }, { merge: true });
    await logGMAction(req.principal, 'archive_announcement', 'announcement', req.params.id, `Archived announcement id ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public announcements
app.get('/api/announcements', async (req, res) => {
  if (!db) return res.json([]);
  try {
    const snap = await db.collection('Announcements').where('status', '==', 'active').get();
    const list = [];
    snap.forEach(d => list.push(d.data()));
    res.json(list);
  } catch (err) {
    res.json([]);
  }
});

// Worlds & Levels API (Duplicate / Restart / Archive / Open progress)
app.post('/api/admin/worlds/restart', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const { worldId, roundId } = req.body;
  try {
    const roundRef = db.collection('ChallengeRounds').doc(roundId);
    const roundSnap = await roundRef.get();
    if (roundSnap.exists) {
      const currentVer = Number(roundSnap.data().roundVersion || 1);
      const nextVer = currentVer + 1;
      await roundRef.set({ roundVersion: nextVer, updatedAt: new Date().toISOString() }, { merge: true });
      
      await logGMAction(req.principal, 'restart_world', 'world', worldId, `Restarted world ${worldId} as new round version ${nextVer}`, { worldId, roundId, roundVersion: nextVer });
      res.json({ success: true, roundVersion: nextVer });
    } else {
      res.status(404).json({ error: '找不到該挑戰輪次' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/worlds/duplicate', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const { srcWorldId, newWorldId, newWorldName } = req.body;
  try {
    const srcDoc = await db.collection('Worlds').doc(srcWorldId).get();
    if (!srcDoc.exists) return res.status(404).json({ error: '來源世界不存在' });
    const srcData = srcDoc.data();
    
    const duplicated = {
      ...srcData,
      id: newWorldId,
      name: newWorldName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.collection('Worlds').doc(newWorldId).set(duplicated);
    
    await logGMAction(req.principal, 'duplicate_world', 'world', newWorldId, `Duplicated world ${srcWorldId} to new world ${newWorldId} (${newWorldName})`, { srcWorldId, newWorldId, newWorldName });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/worlds/archive', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const { worldId } = req.body;
  try {
    await db.collection('Worlds').doc(worldId).set({ status: 'archived', updatedAt: new Date().toISOString() }, { merge: true });
    await logGMAction(req.principal, 'archive_world', 'world', worldId, `Archived world ${worldId} without deleting historical data`, { worldId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/worlds/open', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const { worldId, stageId, checkpointId, perfectClearRequired, targetProgress } = req.body;
  try {
    await db.collection('WorldSettings').doc(`world_${worldId}`).set({
      worldId,
      stageId: stageId || null,
      checkpointId: checkpointId || null,
      perfectClearRequired: !!perfectClearRequired,
      targetProgress: targetProgress || null,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    await logGMAction(req.principal, 'open_new_progress', 'world', worldId, `Opened progress for world ${worldId}, stage ${stageId}, checkpoint ${checkpointId}`, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manually adjust student progress
app.post('/api/admin/users/:userId/adjust-progress', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const { roundId, worldId, stageId, checkpointId, isPerfect } = req.body;
  const playerId = req.params.userId;
  try {
    const progressId = `${playerId}_${worldId}_${stageId}_${checkpointId}_${roundId}`;
    const clearedAt = new Date().toISOString();
    await db.collection('UserStageProgress').doc(progressId).set({
      playerId,
      worldId,
      stageId: Number(stageId),
      checkpointId,
      roundId,
      isPerfect: !!isPerfect,
      clearedAt,
      firstClearedAt: clearedAt,
      failedAttempts: 0,
      retryCount: 0
    }, { merge: true });

    const profileDocRef = db.collection('PlayerCompetitionProgress').doc(`${playerId}_${roundId}`);
    await profileDocRef.set({
      playerId,
      roundId,
      worldId,
      farthestWorldOrder: Number(worldId.replace(/\D/g, '') || 0),
      farthestStageIndex: Number(stageId),
      lastUpdatedAt: clearedAt
    }, { merge: true });

    await logGMAction(req.principal, 'manually_adjust_student_progress', 'user', playerId, `Manually adjusted student ${playerId} progress to world ${worldId}, stage ${stageId}`, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Log GM login action
app.post('/api/admin/login-audit', requireAdmin, async (req, res) => {
  await logGMAction(
    req.principal,
    'login',
    'auth',
    null,
    `GM logged in from IP ${req.ip} using email ${req.principal.email}`
  );
  res.json({ success: true });
});

// Custom GM action logging from client
app.post('/api/admin/log-action', requireAdmin, async (req, res) => {
  const { actionType, targetType, targetId, description, metadata } = req.body;
  try {
    await logGMAction(req.principal, actionType, targetType, targetId, description, metadata);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// CHARACTER EVOLUTION & PLAYER PROFILE SYSTEM
// ==========================================

// Global register player routes middleware
app.use('/api/player', requirePrincipal);

// Database Helper: Validate Evolution Chain Integrity
async function validateEvolutionChainIntegrity(evolutionChainId) {
  if (!db) return { valid: false, errors: ['Firestore not configured'] };
  
  const errors = [];
  try {
    const charSnap = await db.collection('Characters')
      .where('evolutionChainId', '==', evolutionChainId)
      .limit(1)
      .get();
      
    if (charSnap.empty) {
      errors.push(`找不到與 evolutionChainId "${evolutionChainId}" 關聯的角色。`);
      return { valid: false, errors };
    }
    
    let character = null;
    charSnap.forEach(d => { character = d.data(); });
    
    const stagesSnap = await db.collection('CharacterEvolutionStages')
      .where('evolutionChainId', '==', evolutionChainId)
      .get();
      
    const stages = [];
    stagesSnap.forEach(d => {
      const data = d.data();
      if (data.isActive !== false) {
        stages.push(data);
      }
    });
    
    if (stages.length !== 6) {
      errors.push(`該進化鏈目前有 ${stages.length} 個啟用的階段，發布前必須剛好有 6 個。`);
    }
    
    const numbers = stages.map(s => Number(s.stageNumber)).sort((a, b) => a - b);
    for (let i = 1; i <= 6; i++) {
      if (!numbers.includes(i)) {
        errors.push(`缺少階段編號 ${i}。`);
      }
    }
    
    const counts = {};
    numbers.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
    Object.keys(counts).forEach(n => {
      if (counts[n] > 1) {
        errors.push(`階段編號 ${n} 重複出現。`);
      }
    });
    
    stages.forEach(stage => {
      if (stage.characterId !== character.id) {
        errors.push(`階段 ${stage.stageNumber} 的 characterId (${stage.characterId}) 與主資料角色 ID (${character.id}) 不符。`);
      }
      if (stage.characterCode !== character.characterCode) {
        errors.push(`階段 ${stage.stageNumber} 的 characterCode (${stage.characterCode}) 與主資料代碼 (${character.characterCode}) 不符。`);
      }
      if (!stage.imageUrl) {
        errors.push(`階段 ${stage.stageNumber} 的圖片路徑為空值。`);
      }
      
      if (stage.stageNumber > 1) {
        if (!stage.evolutionConditionId) {
          errors.push(`階段 ${stage.stageNumber} 缺少進化條件關聯。`);
        }
      }
    });
    
    if (stages.length > 0) {
      const condSnap = await db.collection('EvolutionConditions')
        .where('evolutionChainId', '==', evolutionChainId)
        .get();
      const conditions = {};
      condSnap.forEach(d => {
        conditions[d.id] = d.data();
      });
      
      stages.forEach(stage => {
        if (stage.stageNumber > 1 && stage.evolutionConditionId) {
          const cond = conditions[stage.evolutionConditionId];
          if (!cond || cond.isActive === false) {
            errors.push(`階段 ${stage.stageNumber} 關聯的進化條件 ID (${stage.evolutionConditionId}) 找不到或已被停用。`);
          }
        }
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  } catch (err) {
    return { valid: false, errors: [err.message] };
  }
}

// Database Helper: Check and Resolve Next Evolution Stage
async function resolveNextEvolutionStage(playerId) {
  if (!db) return { status: 'error', reason: 'Firestore not configured' };
  
  try {
    const profileRef = db.collection('PlayerProfiles').doc(playerId);
    const profileSnap = await profileRef.get();
    
    if (!profileSnap.exists) {
      return { status: 'error', reason: '找不到學員個人檔案。' };
    }
    
    const profile = profileSnap.data();
    const { selectedEvolutionChainId, currentEvolutionStage } = profile;
    
    if (!selectedEvolutionChainId) {
      return { status: 'no_character', reason: '學員尚未選擇角色。' };
    }
    
    if (Number(currentEvolutionStage) >= 6) {
      return { status: 'max_stage', reason: '已達最終進化階段！' };
    }
    
    const nextStageNumber = Number(currentEvolutionStage) + 1;
    
    const stageSnap = await db.collection('CharacterEvolutionStages')
      .where('evolutionChainId', '==', selectedEvolutionChainId)
      .where('stageNumber', '==', nextStageNumber)
      .limit(1)
      .get();
      
    if (stageSnap.empty) {
      return { status: 'stage_not_found', reason: `在進化鏈內找不到下一階段編號 ${nextStageNumber}。` };
    }
    
    let nextStage = null;
    stageSnap.forEach(d => { nextStage = d.data(); });
    
    if (nextStage.isActive === false) {
      return { status: 'stage_inactive', reason: `下一階段編號 ${nextStageNumber} 目前處於停用狀態。` };
    }
    
    if (!nextStage.evolutionConditionId) {
      return { status: 'condition_missing', reason: `下一階段 ${nextStageNumber} 尚未設定進化條件。` };
    }
    
    const conditionSnap = await db.collection('EvolutionConditions')
      .doc(nextStage.evolutionConditionId)
      .get();
      
    if (!conditionSnap.exists) {
      return { status: 'condition_not_found', reason: `下一階段的進化條件 ${nextStage.evolutionConditionId} 不存在。` };
    }
    
    const condition = conditionSnap.data();
    if (condition.isActive === false) {
      return { status: 'condition_inactive', reason: '此階段的進化條件已被停用。' };
    }
    
    const checks = {
      points: { met: true, required: condition.requiredPoints || 0, current: profile.points || 0 },
      perfectClears: { met: true, required: condition.requiredPerfectClears || 0, current: 0 },
      checkpointClears: { met: true, required: condition.requiredCheckpointClears || 0, current: 0 },
      worldClear: { met: true, required: condition.requiredWorldId || null, current: false },
      stageClear: { met: true, required: condition.requiredStageIndex || null, current: false },
      checkpointClear: { met: true, required: condition.requiredCheckpointIndex || null, current: false },
      badges: { met: true, required: condition.requiredBadgeIds || [], missing: [] },
      tokens: { met: true, required: condition.requiredTokenIds || [], missing: [] },
      items: { met: true, required: condition.requiredItemIds || [], missing: [] },
      loginDays: { met: true, required: condition.requiredLoginDays || 0, current: profile.loginDates?.length || 0 },
      learningDaysThisWeek: { met: true, required: condition.requiredLearningDaysThisWeek || 0, current: 0 },
      targetReached: { met: true, required: !!condition.requiredTargetReached, current: false }
    };
    
    let isSatisfied = true;
    
    if (condition.requiredPoints && (profile.points || 0) < condition.requiredPoints) {
      checks.points.met = false;
      isSatisfied = false;
    }
    
    const progressSnap = await db.collection('UserStageProgress')
      .where('playerId', '==', playerId)
      .get();
      
    const progressList = [];
    progressSnap.forEach(d => progressList.push(d.data()));
    
    const perfectCount = progressList.filter(p => p.isPerfect).length;
    checks.perfectClears.current = perfectCount;
    if (condition.requiredPerfectClears && perfectCount < condition.requiredPerfectClears) {
      checks.perfectClears.met = false;
      isSatisfied = false;
    }
    
    const clearCount = progressList.filter(p => p.clearedAt).length;
    checks.checkpointClears.current = clearCount;
    if (condition.requiredCheckpointClears && clearCount < condition.requiredCheckpointClears) {
      checks.checkpointClears.met = false;
      isSatisfied = false;
    }
    
    if (condition.requiredWorldId) {
      const worldCleared = progressList.some(p => p.worldId === condition.requiredWorldId && p.clearedAt);
      checks.worldClear.current = worldCleared;
      if (!worldCleared) {
        checks.worldClear.met = false;
        isSatisfied = false;
      }
    }
    
    if (condition.requiredStageIndex) {
      let stageCleared = false;
      if (condition.requiredWorldId) {
        stageCleared = progressList.some(p => p.worldId === condition.requiredWorldId && Number(p.stageId) === Number(condition.requiredStageIndex) && p.clearedAt);
      } else {
        stageCleared = progressList.some(p => Number(p.stageId) === Number(condition.requiredStageIndex) && p.clearedAt);
      }
      checks.stageClear.current = stageCleared;
      if (!stageCleared) {
        checks.stageClear.met = false;
        isSatisfied = false;
      } else {
        checks.stageClear.met = true;
      }
    }
    
    if (condition.requiredCheckpointIndex) {
      let cpCleared = false;
      const cpVal = `cp_${condition.requiredCheckpointIndex}`;
      if (condition.requiredWorldId && condition.requiredStageIndex) {
        cpCleared = progressList.some(p => p.worldId === condition.requiredWorldId && Number(p.stageId) === Number(condition.requiredStageIndex) && p.checkpointId === cpVal && p.clearedAt);
      } else {
        cpCleared = progressList.some(p => p.checkpointId === cpVal && p.clearedAt);
      }
      checks.checkpointClear.current = cpCleared;
      if (!cpCleared) {
        checks.checkpointClear.met = false;
        isSatisfied = false;
      } else {
        checks.checkpointClear.met = true;
      }
    }
    
    if (condition.requiredBadgeIds && condition.requiredBadgeIds.length > 0) {
      const userBadges = profile.badges || [];
      const missing = condition.requiredBadgeIds.filter(b => !userBadges.includes(b));
      checks.badges.missing = missing;
      if (missing.length > 0) {
        checks.badges.met = false;
        isSatisfied = false;
      }
    }
    
    if (condition.requiredTokenIds && condition.requiredTokenIds.length > 0) {
      const userTokens = profile.tokens || [];
      const missing = condition.requiredTokenIds.filter(t => !userTokens.includes(t));
      checks.tokens.missing = missing;
      if (missing.length > 0) {
        checks.tokens.met = false;
        isSatisfied = false;
      }
    }
    
    if (condition.requiredItemIds && condition.requiredItemIds.length > 0) {
      const userItems = profile.items || [];
      const missing = condition.requiredItemIds.filter(i => !userItems.includes(i));
      checks.items.missing = missing;
      if (missing.length > 0) {
        checks.items.met = false;
        isSatisfied = false;
      }
    }
    
    if (condition.requiredLoginDays && (profile.loginDates?.length || 0) < condition.requiredLoginDays) {
      checks.loginDays.met = false;
      isSatisfied = false;
    }
    
    if (condition.requiredLearningDaysThisWeek && condition.requiredLearningDaysThisWeek > 0) {
      const now = new Date();
      const currentDay = now.getDay();
      const distance = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(now);
      monday.setDate(now.getDate() + distance);
      monday.setHours(0, 0, 0, 0);
      
      const userLoginDates = profile.loginDates || [];
      const daysThisWeek = userLoginDates.filter(dStr => {
        const d = new Date(dStr);
        return d >= monday;
      }).length;
      
      checks.learningDaysThisWeek.current = daysThisWeek;
      if (daysThisWeek < condition.requiredLearningDaysThisWeek) {
        checks.learningDaysThisWeek.met = false;
        isSatisfied = false;
      }
    }
    
    if (condition.requiredTargetReached) {
      const compSnap = await db.collection('PlayerCompetitionProgress')
        .where('playerId', '==', playerId)
        .get();
      let targetReached = false;
      compSnap.forEach(d => {
        if (d.data().targetReachedAt) targetReached = true;
      });
      checks.targetReached.current = targetReached;
      if (!targetReached) {
        checks.targetReached.met = false;
        isSatisfied = false;
      }
    }
    
    return {
      status: isSatisfied ? 'satisfied' : 'not_satisfied',
      nextStage,
      condition,
      checks
    };
    
  } catch (err) {
    return { status: 'error', reason: err.message };
  }
}

// Helper: Get or Create Player Profile
async function getOrCreatePlayerProfile(uid, email = '', displayName = '') {
  if (!db) return null;
  const profileRef = db.collection('PlayerProfiles').doc(uid);
  const snap = await profileRef.get();
  
  if (snap.exists) {
    const data = snap.data();
    const userDoc = await db.collection('Users').doc(uid).get();
    if (userDoc.exists) {
      const user = userDoc.data();
      const updatedProfile = {
        ...data,
        points: user.points || 0,
        displayName: user.displayName || user.nickname || data.displayName || '',
        email: user.email || data.email || email || '',
        anonymizedStudentCode: user.anonymizedStudentCode || data.anonymizedStudentCode || ''
      };
      await profileRef.set(updatedProfile, { merge: true });
      return updatedProfile;
    }
    return data;
  }
  
  const userDoc = await db.collection('Users').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data() : {};
  
  const newProfile = {
    id: uid,
    playerId: uid,
    email: userData.email || email || '',
    anonymizedStudentCode: userData.anonymizedStudentCode || '',
    displayName: userData.displayName || userData.nickname || displayName || '',
    selectedCharacterId: '',
    selectedEvolutionChainId: '',
    currentEvolutionStage: 1,
    currentCharacterStageAssetId: '',
    characterSelectedAt: '',
    lastEvolutionAt: '',
    points: userData.points || 0,
    badges: [],
    tokens: [],
    items: [],
    loginDates: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  await profileRef.set(newProfile);
  return newProfile;
}

// ------------------------------------------
// PLAYER PROFILE & EVOLUTION CLIENT API ENDPOINTS
// ------------------------------------------

app.get('/api/player/character-stages/:evolutionChainId', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const evolutionChainId = req.params.evolutionChainId;
  try {
    const stagesSnap = await db.collection('CharacterEvolutionStages')
      .where('evolutionChainId', '==', evolutionChainId)
      .get();
      
    const stages = [];
    stagesSnap.forEach(d => {
      const data = d.data();
      if (data.isActive !== false) {
        stages.push(data);
      }
    });
    
    stages.sort((a, b) => Number(a.stageNumber) - Number(b.stageNumber));
    
    const condSnap = await db.collection('EvolutionConditions')
      .where('evolutionChainId', '==', evolutionChainId)
      .get();
      
    const conditions = {};
    condSnap.forEach(d => {
      conditions[d.id] = d.data();
    });
    
    const result = stages.map(s => {
      const cond = conditions[s.evolutionConditionId] || null;
      return {
        ...s,
        conditions: cond ? {
          conditionName: cond.conditionName,
          conditionDescription: cond.conditionDescription,
          requiredPoints: cond.requiredPoints,
          requiredPerfectClears: cond.requiredPerfectClears,
          requiredCheckpointClears: cond.requiredCheckpointClears,
          requiredWorldId: cond.requiredWorldId,
          requiredStageIndex: cond.requiredStageIndex,
          requiredCheckpointIndex: cond.requiredCheckpointIndex,
          requiredBadgeIds: cond.requiredBadgeIds,
          requiredTokenIds: cond.requiredTokenIds,
          requiredItemIds: cond.requiredItemIds,
          requiredLoginDays: cond.requiredLoginDays,
          requiredLearningDaysThisWeek: cond.requiredLearningDaysThisWeek,
          requiredTargetReached: cond.requiredTargetReached
        } : null
      };
    });
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/player/profile', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const uid = req.principal.userId;
  try {
    const profile = await getOrCreatePlayerProfile(uid, req.principal.email, req.principal.displayName);
    if (!profile) return res.status(500).json({ error: 'Failed to retrieve profile' });
    
    const todayStr = new Date().toISOString().split('T')[0];
    const loginDates = profile.loginDates || [];
    if (!loginDates.includes(todayStr)) {
      loginDates.push(todayStr);
      await db.collection('PlayerProfiles').doc(uid).set({
        loginDates,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      profile.loginDates = loginDates;
    }
    
    let activeCharacter = null;
    let currentStage = null;
    
    if (profile.selectedCharacterId) {
      const charDoc = await db.collection('Characters').doc(profile.selectedCharacterId).get();
      if (charDoc.exists) {
        activeCharacter = charDoc.data();
      }
      
      const stageSnap = await db.collection('CharacterEvolutionStages')
        .where('evolutionChainId', '==', profile.selectedEvolutionChainId)
        .where('stageNumber', '==', profile.currentEvolutionStage)
        .limit(1)
        .get();
      if (!stageSnap.empty) {
        stageSnap.forEach(d => { currentStage = d.data(); });
      }
    }
    
    res.json({
      profile,
      activeCharacter,
      currentStage
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/player/starters', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const snap = await db.collection('Characters')
      .where('isActive', '==', true)
      .where('isStarterAvailable', '==', true)
      .get();
      
    const starters = [];
    for (const doc of snap.docs) {
      const char = doc.data();
      const stageSnap = await db.collection('CharacterEvolutionStages')
        .where('evolutionChainId', '==', char.evolutionChainId)
        .where('stageNumber', '==', 1)
        .limit(1)
        .get();
        
      let stage1 = null;
      stageSnap.forEach(d => { stage1 = d.data(); });
      
      starters.push({
        character: char,
        stage1
      });
    }
    res.json(starters);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/player/select-starter', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const { characterId } = req.body;
  const uid = req.principal.userId;
  
  if (!characterId) return res.status(400).json({ error: '缺少 characterId' });
  
  try {
    const profile = await getOrCreatePlayerProfile(uid, req.principal.email, req.principal.displayName);
    if (profile.selectedCharacterId) {
      const settingsDoc = await db.collection('SystemSettings').doc('character_settings').get();
      const allowCharacterChange = settingsDoc.exists ? !!settingsDoc.data().allowCharacterChange : false;
      
      if (!allowCharacterChange) {
        return res.status(400).json({ error: '您已經選擇過角色，不可重複選擇。' });
      }
    }
    
    const charDoc = await db.collection('Characters').doc(characterId).get();
    if (!charDoc.exists) return res.status(404).json({ error: '找不到該角色資料。' });
    
    const char = charDoc.data();
    if (char.isActive === false || char.isStarterAvailable === false) {
      return res.status(400).json({ error: '該角色目前不可被選為初始角色。' });
    }
    
    const stageSnap = await db.collection('CharacterEvolutionStages')
      .where('evolutionChainId', '==', char.evolutionChainId)
      .where('stageNumber', '==', 1)
      .limit(1)
      .get();
      
    if (stageSnap.empty) {
      return res.status(404).json({ error: '找不到該角色的第一階段資料。' });
    }
    
    let stage1 = null;
    stageSnap.forEach(d => { stage1 = d.data(); });
    
    const now = new Date().toISOString();
    const updatedFields = {
      selectedCharacterId: char.id,
      selectedEvolutionChainId: char.evolutionChainId,
      currentEvolutionStage: 1,
      currentCharacterStageAssetId: stage1.id,
      characterSelectedAt: now,
      updatedAt: now
    };
    
    await db.collection('PlayerProfiles').doc(uid).set(updatedFields, { merge: true });
    
    res.json({ success: true, profile: { ...profile, ...updatedFields } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/player/check-evolution', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const uid = req.principal.userId;
  
  try {
    const profile = await getOrCreatePlayerProfile(uid, req.principal.email, req.principal.displayName);
    if (!profile.selectedCharacterId) {
      return res.status(400).json({ error: '尚未選擇角色' });
    }
    
    const nextResult = await resolveNextEvolutionStage(uid);
    if (nextResult.status !== 'satisfied') {
      return res.json({
        success: true,
        evolved: false,
        status: nextResult.status,
        reason: nextResult.reason,
        checks: nextResult.checks
      });
    }
    
    const { nextStage, condition } = nextResult;
    const fromStageNumber = Number(profile.currentEvolutionStage);
    const toStageNumber = Number(nextStage.stageNumber);
    const fromStageAssetId = profile.currentCharacterStageAssetId;
    const toStageAssetId = nextStage.id;
    const now = new Date().toISOString();
    
    const updatedProfile = {
      currentEvolutionStage: toStageNumber,
      currentCharacterStageAssetId: toStageAssetId,
      lastEvolutionAt: now,
      updatedAt: now
    };
    await db.collection('PlayerProfiles').doc(uid).set(updatedProfile, { merge: true });
    
    const logId = `evolog_${crypto.randomUUID()}`;
    const evolutionLog = {
      id: logId,
      playerId: uid,
      evolutionChainId: profile.selectedEvolutionChainId,
      characterId: profile.selectedCharacterId,
      characterCode: nextStage.characterCode,
      fromStageNumber,
      toStageNumber,
      fromStageAssetId,
      toStageAssetId,
      triggerType: 'gameplay',
      satisfiedConditions: nextResult.checks,
      evolvedAt: now
    };
    await db.collection('CharacterEvolutionLogs').doc(logId).set(evolutionLog);
    
    const charDoc = await db.collection('Characters').doc(profile.selectedCharacterId).get();
    const characterName = charDoc.exists ? charDoc.data().name : '';
    
    res.json({
      success: true,
      evolved: true,
      fromStage: fromStageNumber,
      toStage: toStageNumber,
      fromStageName: fromStageNumber === 1 ? '蛋 (Egg)' : `階段 ${fromStageNumber}`,
      toStageName: nextStage.stageName,
      toStageTitle: nextStage.stageTitle,
      characterName,
      fromImageUrl: '',
      toImageUrl: nextStage.imageUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/system-settings/character', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const docSnap = await db.collection('SystemSettings').doc('character_settings').get();
    const data = docSnap.exists ? docSnap.data() : { allowCharacterChange: false };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------
// GM CHARACTER EVOLUTION MANAGEMENT APIS
// ------------------------------------------

app.get('/api/admin/evolution-chains', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const charSnap = await db.collection('Characters').get();
    const characters = [];
    charSnap.forEach(d => {
      const data = d.data();
      if (data.isActive !== false) {
        characters.push(data);
      }
    });
    
    const stagesSnap = await db.collection('CharacterEvolutionStages').get();
    const stages = [];
    stagesSnap.forEach(d => {
      const data = d.data();
      if (data.isActive !== false) {
        stages.push(data);
      }
    });
    
    const condSnap = await db.collection('EvolutionConditions').get();
    const conditions = [];
    condSnap.forEach(d => {
      const data = d.data();
      if (data.isActive !== false) {
        conditions.push(data);
      }
    });
    
    const chains = characters.map(char => {
      const chainStages = stages
        .filter(s => s.evolutionChainId === char.evolutionChainId)
        .sort((a, b) => Number(a.stageNumber) - Number(b.stageNumber));
        
      const assembledStages = chainStages.map(s => {
        const cond = conditions.find(c => c.id === s.evolutionConditionId) || null;
        return {
          ...s,
          conditions: cond
        };
      });
      
      return {
        character: char,
        stages: assembledStages
      };
    });
    
    res.json(chains);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/evolution-chains', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const { character, stages } = req.body;
  
  if (!character || !stages) return res.status(400).json({ error: '缺少角色主資料或階段資料。' });
  if (stages.length !== 6) return res.status(400).json({ error: '角色發布前必須剛好有 6 個階段。' });
  
  const charCode = sanitizeCell(character.characterCode || '').trim();
  if (!charCode) return res.status(400).json({ error: '必須填寫 characterCode。' });
  
  try {
    const duplicateCodeSnap = await db.collection('Characters')
      .where('characterCode', '==', charCode)
      .limit(1)
      .get();
      
    if (!duplicateCodeSnap.empty) {
      return res.status(400).json({ error: `角色代碼 (characterCode) "${charCode}" 已被其他角色使用，請更換一個唯一的代碼。` });
    }
    
    const characterId = `char_${crypto.randomUUID()}`;
    const evolutionChainId = `chain_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    
    const charDoc = {
      id: characterId,
      evolutionChainId,
      characterCode: charCode,
      name: sanitizeCell(character.name || ''),
      type: sanitizeCell(character.type || 'Indicator'),
      rarity: sanitizeCell(character.rarity || 'Normal'),
      description: sanitizeCell(character.description || ''),
      isStarterAvailable: !!character.isStarterAvailable,
      isActive: character.isActive !== false,
      createdBy: req.principal.email || 'unknown',
      createdAt: now,
      updatedAt: now
    };
    
    const batch = db.batch();
    const createdStages = [];
    const createdConditions = [];
    
    for (let i = 0; i < 6; i++) {
      const s = stages[i];
      const stageNum = Number(s.stageNumber || (i + 1));
      const stageAssetId = `stage_${evolutionChainId}_${stageNum}`;
      const stageCode = `${charCode}_STAGE_0${stageNum}_${s.stageName ? sanitizeCell(s.stageName).toUpperCase().replace(/\s+/g, '_') : 'STAGE'}`;
      
      let evolutionConditionId = '';
      if (stageNum > 1) {
        evolutionConditionId = `cond_${evolutionChainId}_to_${stageNum}`;
        const rawCond = s.conditions || {};
        const condDoc = {
          id: evolutionConditionId,
          evolutionChainId,
          fromStageNumber: stageNum - 1,
          toStageNumber: stageNum,
          conditionName: sanitizeCell(rawCond.conditionName || `進化至 ${s.stageName || '下一階段'}`),
          conditionDescription: sanitizeCell(rawCond.conditionDescription || ''),
          requiredPoints: rawCond.requiredPoints ? Number(rawCond.requiredPoints) : null,
          requiredPerfectClears: rawCond.requiredPerfectClears ? Number(rawCond.requiredPerfectClears) : null,
          requiredCheckpointClears: rawCond.requiredCheckpointClears ? Number(rawCond.requiredCheckpointClears) : null,
          requiredWorldId: rawCond.requiredWorldId || null,
          requiredStageIndex: rawCond.requiredStageIndex ? Number(rawCond.requiredStageIndex) : null,
          requiredCheckpointIndex: rawCond.requiredCheckpointIndex ? Number(rawCond.requiredCheckpointIndex) : null,
          requiredBadgeIds: Array.isArray(rawCond.requiredBadgeIds) ? rawCond.requiredBadgeIds : [],
          requiredTokenIds: Array.isArray(rawCond.requiredTokenIds) ? rawCond.requiredTokenIds : [],
          requiredItemIds: Array.isArray(rawCond.requiredItemIds) ? rawCond.requiredItemIds : [],
          requiredLoginDays: rawCond.requiredLoginDays ? Number(rawCond.requiredLoginDays) : null,
          requiredLearningDaysThisWeek: rawCond.requiredLearningDaysThisWeek ? Number(rawCond.requiredLearningDaysThisWeek) : null,
          requiredTargetReached: !!rawCond.requiredTargetReached,
          customRuleJson: rawCond.customRuleJson || null,
          isActive: true,
          createdAt: now,
          updatedAt: now
        };
        batch.set(db.collection('EvolutionConditions').doc(evolutionConditionId), condDoc);
        createdConditions.push(condDoc);
      }
      
      const stageDoc = {
        id: stageAssetId,
        evolutionChainId,
        characterId,
        characterCode: charCode,
        stageNumber: stageNum,
        stageCode,
        stageName: sanitizeCell(s.stageName || ''),
        stageTitle: sanitizeCell(s.stageTitle || ''),
        imageUrl: s.imageUrl || '',
        thumbnailUrl: s.thumbnailUrl || null,
        description: sanitizeCell(s.description || ''),
        evolutionConditionId,
        sortOrder: stageNum,
        isActive: true,
        createdAt: now,
        updatedAt: now
      };
      
      batch.set(db.collection('CharacterEvolutionStages').doc(stageAssetId), stageDoc);
      createdStages.push(stageDoc);
    }
    
    batch.set(db.collection('Characters').doc(characterId), charDoc);
    
    await batch.commit();
    
    const check = await validateEvolutionChainIntegrity(evolutionChainId);
    
    await logGMAction(req.principal, 'create_character_chain', 'character', characterId, `Created character chain for ${charDoc.name} (${charDoc.characterCode})`, { characterId, evolutionChainId });
    
    res.status(201).json({
      success: true,
      character: charDoc,
      stages: createdStages,
      conditions: createdConditions,
      validation: check
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/evolution-chains/:characterId', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const { character, stages } = req.body;
  const characterId = req.params.characterId;
  
  try {
    const charDocRef = db.collection('Characters').doc(characterId);
    const charSnap = await charDocRef.get();
    if (!charSnap.exists) return res.status(404).json({ error: '找不到該角色。' });
    
    const oldChar = charSnap.data();
    const evolutionChainId = oldChar.evolutionChainId;
    const now = new Date().toISOString();
    
    const batch = db.batch();
    
    const updatedChar = {
      name: sanitizeCell(character.name || oldChar.name),
      type: sanitizeCell(character.type || oldChar.type),
      rarity: sanitizeCell(character.rarity || oldChar.rarity),
      description: sanitizeCell(character.description || oldChar.description),
      isStarterAvailable: character.isStarterAvailable !== undefined ? !!character.isStarterAvailable : oldChar.isStarterAvailable,
      isActive: character.isActive !== undefined ? !!character.isActive : oldChar.isActive,
      updatedAt: now
    };
    batch.set(charDocRef, updatedChar, { merge: true });
    
    if (stages && Array.isArray(stages)) {
      for (const s of stages) {
        const stageNum = Number(s.stageNumber);
        const stageAssetId = `stage_${evolutionChainId}_${stageNum}`;
        
        const stageUpdate = {
          stageName: sanitizeCell(s.stageName || ''),
          stageTitle: sanitizeCell(s.stageTitle || ''),
          imageUrl: s.imageUrl || '',
          description: sanitizeCell(s.description || ''),
          updatedAt: now
        };
        batch.set(db.collection('CharacterEvolutionStages').doc(stageAssetId), stageUpdate, { merge: true });
        
        if (stageNum > 1 && s.conditions) {
          const conditionId = `cond_${evolutionChainId}_to_${stageNum}`;
          const rawCond = s.conditions;
          
          const condUpdate = {
            conditionName: sanitizeCell(rawCond.conditionName || `進化至 ${s.stageName || '下一階段'}`),
            conditionDescription: sanitizeCell(rawCond.conditionDescription || ''),
            requiredPoints: rawCond.requiredPoints !== undefined ? (rawCond.requiredPoints ? Number(rawCond.requiredPoints) : null) : undefined,
            requiredPerfectClears: rawCond.requiredPerfectClears !== undefined ? (rawCond.requiredPerfectClears ? Number(rawCond.requiredPerfectClears) : null) : undefined,
            requiredCheckpointClears: rawCond.requiredCheckpointClears !== undefined ? (rawCond.requiredCheckpointClears ? Number(rawCond.requiredCheckpointClears) : null) : undefined,
            requiredWorldId: rawCond.requiredWorldId !== undefined ? rawCond.requiredWorldId : undefined,
            requiredStageIndex: rawCond.requiredStageIndex !== undefined ? (rawCond.requiredStageIndex ? Number(rawCond.requiredStageIndex) : null) : undefined,
            requiredCheckpointIndex: rawCond.requiredCheckpointIndex !== undefined ? (rawCond.requiredCheckpointIndex ? Number(rawCond.requiredCheckpointIndex) : null) : undefined,
            requiredBadgeIds: Array.isArray(rawCond.requiredBadgeIds) ? rawCond.requiredBadgeIds : undefined,
            requiredTokenIds: Array.isArray(rawCond.requiredTokenIds) ? rawCond.requiredTokenIds : undefined,
            requiredItemIds: Array.isArray(rawCond.requiredItemIds) ? rawCond.requiredItemIds : undefined,
            requiredLoginDays: rawCond.requiredLoginDays !== undefined ? (rawCond.requiredLoginDays ? Number(rawCond.requiredLoginDays) : null) : undefined,
            requiredLearningDaysThisWeek: rawCond.requiredLearningDaysThisWeek !== undefined ? (rawCond.requiredLearningDaysThisWeek ? Number(rawCond.requiredLearningDaysThisWeek) : null) : undefined,
            requiredTargetReached: rawCond.requiredTargetReached !== undefined ? !!rawCond.requiredTargetReached : undefined,
            updatedAt: now
          };
          
          Object.keys(condUpdate).forEach(key => condUpdate[key] === undefined && delete condUpdate[key]);
          
          batch.set(db.collection('EvolutionConditions').doc(conditionId), condUpdate, { merge: true });
        }
      }
    }
    
    await batch.commit();
    
    const check = await validateEvolutionChainIntegrity(evolutionChainId);
    await logGMAction(req.principal, 'edit_character_chain', 'character', characterId, `Updated character chain ${oldChar.name}`, { characterId });
    
    res.json({ success: true, validation: check });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/evolution-chains/:characterId', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const characterId = req.params.characterId;
  try {
    const charDocRef = db.collection('Characters').doc(characterId);
    const charSnap = await charDocRef.get();
    if (!charSnap.exists) return res.status(404).json({ error: '找不到該角色' });
    
    const char = charSnap.data();
    const now = new Date().toISOString();
    
    await charDocRef.set({ isActive: false, isStarterAvailable: false, updatedAt: now }, { merge: true });
    
    const stagesSnap = await db.collection('CharacterEvolutionStages')
      .where('evolutionChainId', '==', char.evolutionChainId)
      .get();
      
    const batch = db.batch();
    stagesSnap.forEach(d => {
      batch.set(d.ref, { isActive: false, updatedAt: now }, { merge: true });
    });
    
    const condSnap = await db.collection('EvolutionConditions')
      .where('evolutionChainId', '==', char.evolutionChainId)
      .get();
    condSnap.forEach(d => {
      batch.set(d.ref, { isActive: false, updatedAt: now }, { merge: true });
    });
    
    await batch.commit();
    await logGMAction(req.principal, 'archive_character_chain', 'character', characterId, `Archived character chain ${char.name} (${char.characterCode})`);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/evolution-chains/:evolutionChainId/validate', requireAdmin, async (req, res) => {
  const check = await validateEvolutionChainIntegrity(req.params.evolutionChainId);
  await logGMAction(req.principal, 'validate_character_chain', 'character', null, `Validated character evolution chain ID ${req.params.evolutionChainId}, Result: ${check.valid ? 'Valid' : 'Invalid'}`);
  res.json(check);
});

app.get('/api/admin/player-character-progress', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  try {
    const snap = await db.collection('PlayerProfiles').get();
    const profiles = [];
    snap.forEach(d => profiles.push(d.data()));
    
    const charSnap = await db.collection('Characters').get();
    const charMap = {};
    charSnap.forEach(d => { charMap[d.id] = d.data(); });
    
    const result = profiles.map(p => {
      const char = charMap[p.selectedCharacterId] || null;
      return {
        ...p,
        characterName: char ? char.name : '未選擇',
        characterCode: char ? char.characterCode : ''
      };
    });
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/player-character-progress/:playerId/trigger-evolution', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const playerId = req.params.playerId;
  try {
    const profileRef = db.collection('PlayerProfiles').doc(playerId);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) return res.status(404).json({ error: '找不到學員檔案。' });
    
    const profile = profileSnap.data();
    if (!profile.selectedEvolutionChainId) {
      return res.status(400).json({ error: '該學員尚未選擇角色。' });
    }
    
    const fromStageNumber = Number(profile.currentEvolutionStage);
    if (fromStageNumber >= 6) {
      return res.status(400).json({ error: '學員已達最終階段。' });
    }
    
    const toStageNumber = fromStageNumber + 1;
    
    const stageSnap = await db.collection('CharacterEvolutionStages')
      .where('evolutionChainId', '==', profile.selectedEvolutionChainId)
      .where('stageNumber', '==', toStageNumber)
      .limit(1)
      .get();
      
    if (stageSnap.empty) {
      return res.status(404).json({ error: `找不到下一階段編號 ${toStageNumber} 的設定。` });
    }
    
    let nextStage = null;
    stageSnap.forEach(d => { nextStage = d.data(); });
    
    const now = new Date().toISOString();
    
    const updatedFields = {
      currentEvolutionStage: toStageNumber,
      currentCharacterStageAssetId: nextStage.id,
      lastEvolutionAt: now,
      updatedAt: now
    };
    await profileRef.set(updatedFields, { merge: true });
    
    const logId = `evolog_${crypto.randomUUID()}`;
    const evolutionLog = {
      id: logId,
      playerId,
      evolutionChainId: profile.selectedEvolutionChainId,
      characterId: profile.selectedCharacterId,
      characterCode: nextStage.characterCode,
      fromStageNumber,
      toStageNumber,
      fromStageAssetId: profile.currentCharacterStageAssetId,
      toStageAssetId: nextStage.id,
      triggerType: 'manual_admin',
      satisfiedConditions: { manual_bypass: true },
      evolvedAt: now
    };
    await db.collection('CharacterEvolutionLogs').doc(logId).set(evolutionLog);
    
    await logGMAction(req.principal, 'manual_trigger_evolution', 'user', playerId, `Manually evolved player ${playerId} character to stage ${toStageNumber}`, { playerId, toStageNumber });
    
    res.json({ success: true, toStageNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/player-character-progress/:playerId/reset-character', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const playerId = req.params.playerId;
  try {
    const profileRef = db.collection('PlayerProfiles').doc(playerId);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) return res.status(404).json({ error: '找不到學員檔案。' });
    
    const profile = profileSnap.data();
    if (!profile.selectedEvolutionChainId) {
      return res.status(400).json({ error: '該學員尚未選擇角色。' });
    }
    
    const stageSnap = await db.collection('CharacterEvolutionStages')
      .where('evolutionChainId', '==', profile.selectedEvolutionChainId)
      .where('stageNumber', '==', 1)
      .limit(1)
      .get();
      
    if (stageSnap.empty) {
      return res.status(404).json({ error: '找不到第一階段設定。' });
    }
    
    let stage1 = null;
    stageSnap.forEach(d => { stage1 = d.data(); });
    
    const now = new Date().toISOString();
    
    const updatedFields = {
      currentEvolutionStage: 1,
      currentCharacterStageAssetId: stage1.id,
      lastEvolutionAt: '',
      updatedAt: now
    };
    await profileRef.set(updatedFields, { merge: true });
    
    await logGMAction(req.principal, 'reset_player_character', 'user', playerId, `Manually reset player ${playerId} character back to stage 1`, { playerId });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/system-settings/character', requireAdmin, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Firestore not configured' });
  const { allowCharacterChange } = req.body;
  try {
    await db.collection('SystemSettings').doc('character_settings').set({
      allowCharacterChange: !!allowCharacterChange,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    
    await logGMAction(req.principal, 'update_character_system_settings', 'system', 'character_settings', `Set allowCharacterChange to ${!!allowCharacterChange}`, { allowCharacterChange: !!allowCharacterChange });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  res.status(404).json({ error: '找不到題庫' });
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
    if (!answers.length) return res.status(400).json({ error: '未提供學生作答資料。' });

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
const MAX_PLAYERS_PER_ROOM = 100;
const MAX_NICKNAME_LENGTH = 24;
const ROOM_IDLE_TIMEOUT_MS = 60 * 60 * 1000;     // 1 小時無任何活動即清除房間
const FINISHED_ROOM_GRACE_MS = 10 * 60 * 1000;   // 遊戲結束後保留 10 分鐘供查看結果

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(10000000 + Math.random() * 90000000).toString();
  } while (rooms[code]);
  return code;
}

// Fisher–Yates 洗牌：回傳新陣列，不就地改動傳入的原始陣列。
function shuffleArray(input) {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function connectedPlayers(room) {
  return Object.values(room.players).filter((player) => !player.disconnected);
}

function broadcastPlayerList(room) {
  io.to(room.teacherId).emit('player_joined', connectedPlayers(room));
}

function clearRoomTimer(room) {
  if (room && room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

function cleanupRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  clearRoomTimer(room);
  delete rooms[roomId];
}

function touchRoom(room) {
  if (room) room.lastActivityAt = Date.now();
}

function nextQuestion(room) {
  if (!room) return;
  clearRoomTimer(room);
  touchRoom(room);

  room.currentQuestionIndex += 1;
  if (room.currentQuestionIndex >= room.questions.length) {
    room.status = 'game_over';
    room.finishedAt = Date.now();
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
  room.timerInterval = setInterval(() => {
    timeLeft -= 1;
    const total = connectedPlayers(room).length;
    if (total > 0 && room.answeredCount >= total / 2) {
      timeLeft -= 1;
    }
    io.to(room.id).emit('tick', timeLeft);

    if (timeLeft <= 0) {
      endQuestion(room);
    }
  }, 1000);
}

function endQuestion(room) {
  if (!room || room.status !== 'playing') return; // 防止計時器與「全員答完」重複觸發
  clearRoomTimer(room);

  room.status = 'question_result';
  const question = room.questions[room.currentQuestionIndex];
  const distribution = { A: 0, B: 0, C: 0, D: 0 };
  Object.values(room.players).forEach((player) => {
    const answer = player.answers.find((item) => item.qIndex === room.currentQuestionIndex);
    if (answer && answer.selected) {
      const selected = String(answer.selected).toUpperCase();
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

// 若目前所有「在線」玩家都已作答本題，提前結束（避免斷線玩家拖住進度）。
function maybeEndQuestion(room) {
  if (!room || room.status !== 'playing') return;
  const active = connectedPlayers(room);
  if (active.length === 0) return; // 無在線玩家時交給計時器收尾
  const everyoneAnswered = active.every((player) =>
    player.answers.some((answer) => answer.qIndex === room.currentQuestionIndex));
  if (everyoneAnswered) endQuestion(room);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_room', ({ questions, limit, teacherUserId, activityId, questionBankId }) => {
    if (!Array.isArray(questions) || questions.length === 0) {
      socket.emit('error', '目前沒有可進行的題目。');
      return;
    }

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), questions.length);
    const selected = shuffleArray(questions).slice(0, safeLimit).map((question) => ({
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
      timerInterval: null,
      questionStartTime: 0,
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    };

    socket.join(roomId);
    socket.emit('room_created', roomId);
  });

  socket.on('join_room_student', ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', '找不到房間。');
    if (room.status === 'game_over') return socket.emit('error', '遊戲已經結束。');

    const cleanNickname = sanitizeCell(nickname).slice(0, MAX_NICKNAME_LENGTH);
    if (!cleanNickname) return socket.emit('error', '請輸入有效的暱稱。');

    touchRoom(room);

    // 斷線重連：沿用同暱稱、已離線的玩家紀錄，恢復其分數與作答進度。
    const previous = Object.values(room.players).find(
      (player) => player.nickname === cleanNickname && player.disconnected
    );
    if (previous) {
      delete room.players[previous.id];
      previous.id = socket.id;
      previous.disconnected = false;
      room.players[socket.id] = previous;
      socket.join(roomId);
      socket.emit('joined_room', { roomId, nickname: cleanNickname, reconnected: true, score: previous.score });
      broadcastPlayerList(room);
      return;
    }

    // 新玩家：僅允許在等待階段加入，並檢查暱稱重複與人數上限。
    if (room.status !== 'waiting') return socket.emit('error', '遊戲已經開始，無法加入。');
    if (connectedPlayers(room).some((player) => player.nickname === cleanNickname)) {
      return socket.emit('error', '此暱稱已被使用，請換一個。');
    }
    if (connectedPlayers(room).length >= MAX_PLAYERS_PER_ROOM) {
      return socket.emit('error', '房間人數已滿。');
    }

    room.players[socket.id] = {
      id: socket.id,
      nickname: cleanNickname,
      score: 0,
      streak: 0,
      answers: [],
      disconnected: false
    };

    socket.join(roomId);
    socket.emit('joined_room', { roomId, nickname: cleanNickname });
    broadcastPlayerList(room);
  });

  socket.on('start_game', (roomId) => {
    const room = rooms[roomId];
    if (room && room.teacherId === socket.id && room.status === 'waiting') {
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
    touchRoom(room);

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
      const totalPlayers = connectedPlayers(room).length || 1;
      const timeRatio = Math.max(0, 1 - (timeTaken / room.timeLimit));
      const orderRatio = Math.max(0, 1 - (room.answeredCount / totalPlayers));
      const questionBaseScore = 1000 * (0.5 * timeRatio + 0.5 * orderRatio);
      const streakMultiplier = 1 + (player.streak - 1) * 0.2;
      points = Math.max(100, Math.round(questionBaseScore * streakMultiplier));
      player.score += points;
    } else {
      player.streak = 0;
    }

    player.answers.push({
      qIndex,
      selected: cleanSelectedOption,
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
    maybeEndQuestion(room);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const roomId of Object.keys(rooms)) {
      const room = rooms[roomId];
      if (room.teacherId === socket.id) {
        // 主持人離線：通知房內學生並關閉房間，避免孤兒房間殘留。
        io.to(room.id).emit('room_closed', '主持人已離線，本場遊戲結束。');
        cleanupRoom(roomId);
        continue;
      }
      const player = room.players[socket.id];
      if (player) {
        // 學生離線：標記為離線（保留分數供重連），更新名單並視情況提前結束本題。
        player.disconnected = true;
        broadcastPlayerList(room);
        maybeEndQuestion(room);
      }
    }
  });
});

// 定期清理閒置與已結束的房間，避免 rooms 物件無限累積造成記憶體洩漏。
const roomSweepInterval = setInterval(() => {
  const now = Date.now();
  for (const roomId of Object.keys(rooms)) {
    const room = rooms[roomId];
    const idleFor = now - (room.lastActivityAt || room.createdAt || now);
    const finishedFor = room.finishedAt ? now - room.finishedAt : 0;
    if (idleFor > ROOM_IDLE_TIMEOUT_MS || (room.status === 'game_over' && finishedFor > FINISHED_ROOM_GRACE_MS)) {
      cleanupRoom(roomId);
    }
  }
}, 5 * 60 * 1000);
if (typeof roomSweepInterval.unref === 'function') roomSweepInterval.unref();

// Seed unique admin account
async function seedAdminAccount() {
  const adminEmail = process.env.GM_TEACHER_ADMIN_EMAIL;
  const adminPassword = process.env.GM_TEACHER_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log('[Admin Seeding] 未設定 GM_TEACHER_ADMIN_EMAIL / GM_TEACHER_ADMIN_PASSWORD，略過管理員種子建立。');
    return;
  }

  if (!admin.apps.length) {
    console.log("Firebase Admin is not initialized. Admin seeding is skipped.");
    return;
  }
  
  try {
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(adminEmail);
      console.log(`[Admin Seeding] Unique GM account already exists: ${userRecord.uid}`);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        console.log(`[Admin Seeding] Unique GM account does not exist. Creating...`);
        userRecord = await admin.auth().createUser({
          email: adminEmail,
          password: adminPassword,
          displayName: 'GM Teacher Admin',
          emailVerified: true
        });
        console.log(`[Admin Seeding] Unique GM account created: ${userRecord.uid}`);
      } else {
        throw err;
      }
    }

    // Set custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'gm_teacher_admin' });
    console.log(`[Admin Seeding] Custom claim role: "gm_teacher_admin" set successfully.`);

    // Write to Firestore Users collection
    if (db) {
      await db.collection('Users').doc(userRecord.uid).set({
        id: userRecord.uid,
        email: adminEmail,
        role: 'gm_teacher_admin',
        displayName: 'GM Teacher Admin',
        nickname: 'GM Teacher Admin',
        anonymizedStudentCode: 'GM0000',
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log(`[Admin Seeding] Firestore Users doc updated.`);
    }
  } catch (error) {
    console.error(`[Admin Seeding] Failed to seed unique admin account:`, error);
  }
}
seedAdminAccount();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

