import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  Flag,
  HandHeart,
  HelpCircle,
  Lightbulb,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Users
} from 'lucide-react';
import { peerLearningApi } from '../peerLearningApi';

const RESPONSE_TYPES = [
  ['hint', '提示'],
  ['step_explanation', '步驟說明'],
  ['example', '範例'],
  ['guiding_question', '引導問題'],
  ['concept_reminder', '概念提醒']
];

const emptyStudentQuestion = {
  prompt: '',
  answer: '',
  explanation: '',
  knowledgePoint: '',
  difficulty: 'medium',
  creationReason: ''
};

const MODERATION_TYPES = [
  ['all', '全部內容'],
  ['explanation', '同儕解析'],
  ['helpRequest', '求助請求'],
  ['helpResponse', '協助回覆'],
  ['studentQuestion', '學生自創題'],
  ['peerChallenge', '同儕挑戰'],
  ['peerReview', '同儕互評'],
  ['wrongExchange', '錯題交換'],
  ['learningGuild', '學習小組']
];

const MODERATION_STATUSES = [
  ['all', '全部狀態'],
  ['pending_review', '待審核'],
  ['flagged', '已檢舉'],
  ['returned_for_revision', '退回修正'],
  ['approved', '已通過'],
  ['hidden', '已隱藏'],
  ['deleted', '已刪除']
];

const STATUS_LABELS = {
  open: '開放中',
  pending: '待接受',
  pending_review: '待審核',
  flagged: '已檢舉',
  returned_for_revision: '退回修正',
  approved: '已通過',
  hidden: '已隱藏',
  rejected: '已拒絕',
  deleted: '已刪除',
  resolved: '已解決',
  assigned: '已指派',
  submitted: '已提交',
  accepted: '已接受',
  matched: '已配對',
  in_progress: '進行中',
  completed: '已完成',
  declined: '已婉拒',
  added_to_teacher_bank: '已加入教師題庫'
};

const TARGET_TYPE_LABELS = {
  explanation: '同儕解析',
  helpRequest: '求助請求',
  helpResponse: '協助回覆',
  studentQuestion: '學生自創題',
  peerChallenge: '同儕挑戰',
  peerReview: '同儕互評',
  wrongExchange: '錯題交換',
  learningGuild: '學習小組'
};

const ACTION_LABELS = {
  REPORT_CONTENT: '收到檢舉',
  MODERATE_APPROVE: '通過',
  MODERATE_FEATURE: '設為精選',
  MODERATE_HIDE: '隱藏',
  MODERATE_DELETE: '刪除',
  MODERATE_LOCK: '鎖定',
  MODERATE_UNLOCK: '解除鎖定',
  MODERATE_REJECT: '拒絕',
  MODERATE_RETURN: '退回修正',
  MODERATE_ADD_TO_TEACHER_BANK: '加入教師題庫'
};

const CHALLENGE_MODE_LABELS = {
  one_v_one: '一對一挑戰',
  random: '隨機挑戰',
  group: '小組挑戰'
};

function moderationKey(targetType, id) {
  return `${targetType}:${id}`;
}

function statusText(status) {
  return STATUS_LABELS[status] || status || '開放中';
}

function targetTypeText(targetType) {
  return TARGET_TYPE_LABELS[targetType] || targetType || '內容';
}

function responseTypeText(responseType) {
  return RESPONSE_TYPES.find(([value]) => value === responseType)?.[1] || responseType || '協助';
}

function challengeModeText(mode) {
  return CHALLENGE_MODE_LABELS[mode] || mode || '同儕挑戰';
}

function formatTimelineEventTitle(event) {
  if (event.actionType === 'REPORT_CONTENT') return `收到${targetTypeText(event.targetType)}檢舉`;
  return `${ACTION_LABELS[event.actionType] || event.actionType}：${targetTypeText(event.targetType)}`;
}

function StatusBadge({ status }) {
  return <span className={`peer-status-badge ${status || 'open'}`}>{statusText(status)}</span>;
}

function SafetyNotice() {
  return (
    <div className="peer-safety-notice">
      <ShieldCheck size={18} />
      <span>同儕學習採結構化設計並可審核。請使用提示、範例、評分規準回饋與建設性語言；教師保有最終審核權。</span>
    </div>
  );
}

function Leaderboard({ items = [] }) {
  return (
    <div className="peer-leaderboard">
      {items.length === 0 && <p className="peer-empty">目前沒有同儕學習紀錄。</p>}
      {items.map((item) => (
        <div className="peer-leader-row" key={item.studentId}>
          <span className="rank">#{item.rank}</span>
          <strong>{item.studentName}</strong>
          <span>{item.teamworkXp} 經驗值</span>
        </div>
      ))}
    </div>
  );
}

export default function PeerLearningHub({ mode = 'student', user, questionContext = {}, classId = '', compact = false }) {
  const [overview, setOverview] = useState(null);
  const [queue, setQueue] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [safetySummary, setSafetySummary] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [moderationLogs, setModerationLogs] = useState([]);
  const [moderationTimeline, setModerationTimeline] = useState(null);
  const [timelineCaseDetail, setTimelineCaseDetail] = useState(null);
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [settingsClassId, setSettingsClassId] = useState(classId || '');
  const [explanationText, setExplanationText] = useState('');
  const [helpMessage, setHelpMessage] = useState('');
  const [responseDrafts, setResponseDrafts] = useState({});
  const [responseTypes, setResponseTypes] = useState({});
  const [studentQuestionDraft, setStudentQuestionDraft] = useState(emptyStudentQuestion);
  const [challengeDraft, setChallengeDraft] = useState({ opponentStudentId: '', opponentName: '' });
  const [challengeScores, setChallengeScores] = useState({});
  const [peerReviewDraft, setPeerReviewDraft] = useState({ reviewerStudentId: '', reviewerName: '', submissionText: '' });
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [wrongExchangeDraft, setWrongExchangeDraft] = useState({ partnerStudentId: '', partnerName: '', knowledgePoint: '' });
  const [wrongExchangeReflections, setWrongExchangeReflections] = useState({});
  const [guildDraft, setGuildDraft] = useState({ name: '', weeklyGoal: '' });
  const [queueTypeFilter, setQueueTypeFilter] = useState('all');
  const [queueStatusFilter, setQueueStatusFilter] = useState('all');
  const [selectedModeration, setSelectedModeration] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const userId = user?.uid || user?.studentId || 'anonymous-student';

  const query = useMemo(() => ({
    questionId: questionContext.questionId || questionContext.id || '',
    classId: classId || questionContext.classId || ''
  }), [questionContext, classId]);

  const payloadContext = () => ({
    questionId: questionContext.questionId || questionContext.id || questionContext.qIndex || '',
    questionBankId: questionContext.questionBankId || '',
    activityId: questionContext.activityId || '',
    classId: classId || questionContext.classId || '',
    questionPrompt: questionContext.prompt || questionContext.question || questionContext.Question || '',
    knowledgePoint: questionContext.knowledgePoint || questionContext.chapter || questionContext.Chapter || ''
  });

  const loadStudent = useCallback(async () => {
    const data = await peerLearningApi.overview(user, query);
    const board = await peerLearningApi.leaderboard(user);
    setOverview(data);
    setLeaderboard(board);
  }, [user, query]);

  const loadTeacher = useCallback(async () => {
    const teacherFilter = { classId: settingsClassId };
    const [queueData, analyticsData, safetyData, settingsData, logsData, timelineData] = await Promise.all([
      peerLearningApi.teacherQueue(user, teacherFilter),
      peerLearningApi.teacherAnalytics(user, teacherFilter),
      peerLearningApi.safetySummary(user, teacherFilter),
      peerLearningApi.settings(user, { classId: settingsClassId }),
      peerLearningApi.moderationLogs(user, { classId: settingsClassId, limit: 20 }),
      peerLearningApi.moderationTimeline(user, { classId: settingsClassId, limit: 80 })
    ]);
    setQueue(queueData);
    setAnalytics(analyticsData);
    setSafetySummary(safetyData);
    setSettingsDraft(settingsData);
    setModerationLogs(logsData.logs || []);
    setModerationTimeline(timelineData);
    setSelectedModeration({});
    setTimelineCaseDetail(null);
  }, [user, settingsClassId]);

  const load = useCallback(async () => {
    setError('');
    try {
      if (mode === 'teacher') await loadTeacher();
      else await loadStudent();
    } catch (err) {
      setError(err.message);
    }
  }, [mode, loadTeacher, loadStudent]);

  useEffect(() => {
    const timer = setTimeout(() => {
       load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const runStudentAction = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await loadStudent();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitExplanation = () => runStudentAction(async () => {
    await peerLearningApi.submitExplanation(user, { ...payloadContext(), explanationText, explanationType: 'concept_explanation' });
    setExplanationText('');
  });

  const createHelpRequest = () => runStudentAction(async () => {
    await peerLearningApi.createHelpRequest(user, { ...payloadContext(), message: helpMessage });
    setHelpMessage('');
  });

  const respondToHelp = (helpRequestId) => runStudentAction(async () => {
    await peerLearningApi.respondToHelp(user, helpRequestId, {
      content: responseDrafts[helpRequestId] || '',
      responseType: responseTypes[helpRequestId] || 'hint'
    });
    setResponseDrafts({ ...responseDrafts, [helpRequestId]: '' });
  });

  const submitStudentQuestion = () => runStudentAction(async () => {
    await peerLearningApi.submitStudentQuestion(user, {
      ...payloadContext(),
      ...studentQuestionDraft,
      type: 'short_answer',
      sourceNote: '學生自創題'
    });
    setStudentQuestionDraft(emptyStudentQuestion);
  });

  const createChallenge = () => runStudentAction(async () => {
    await peerLearningApi.createChallenge(user, {
      ...payloadContext(),
      opponentStudentId: challengeDraft.opponentStudentId,
      opponentName: challengeDraft.opponentName,
      mode: challengeDraft.opponentStudentId ? 'one_v_one' : 'random',
      questionIds: [query.questionId].filter(Boolean)
    });
    setChallengeDraft({ opponentStudentId: '', opponentName: '' });
  });

  const respondChallenge = (challengeId, action) => runStudentAction(async () => {
    await peerLearningApi.respondChallenge(user, challengeId, action);
  });

  const completeChallenge = (challengeId) => runStudentAction(async () => {
    const scores = challengeScores[challengeId] || {};
    await peerLearningApi.completeChallenge(user, challengeId, {
      challenger: Number(scores.challenger || 0),
      opponent: Number(scores.opponent || 0)
    });
    setChallengeScores({ ...challengeScores, [challengeId]: {} });
  });

  const createPeerReview = () => runStudentAction(async () => {
    await peerLearningApi.createPeerReview(user, {
      ...payloadContext(),
      reviewerStudentId: peerReviewDraft.reviewerStudentId,
      reviewerName: peerReviewDraft.reviewerName,
      submissionText: peerReviewDraft.submissionText
    });
    setPeerReviewDraft({ reviewerStudentId: '', reviewerName: '', submissionText: '' });
  });

  const submitPeerReview = (reviewId) => runStudentAction(async () => {
    const draft = reviewDrafts[reviewId] || {};
    await peerLearningApi.submitPeerReview(user, reviewId, {
      feedbackText: draft.feedbackText || '',
      rubricScores: {
        accuracy: Number(draft.accuracy || 3),
        reasoning: Number(draft.reasoning || 3),
        clarity: Number(draft.clarity || 3),
        evidence: Number(draft.evidence || 3),
        completeness: Number(draft.completeness || 3)
      }
    });
    setReviewDrafts({ ...reviewDrafts, [reviewId]: {} });
  });

  const createWrongExchange = () => runStudentAction(async () => {
    await peerLearningApi.createWrongExchange(user, {
      ...payloadContext(),
      partnerStudentId: wrongExchangeDraft.partnerStudentId,
      partnerName: wrongExchangeDraft.partnerName,
      knowledgePoint: wrongExchangeDraft.knowledgePoint || payloadContext().knowledgePoint
    });
    setWrongExchangeDraft({ partnerStudentId: '', partnerName: '', knowledgePoint: '' });
  });

  const completeWrongExchange = (exchangeId) => runStudentAction(async () => {
    await peerLearningApi.completeWrongExchange(user, exchangeId, {
      reflection: wrongExchangeReflections[exchangeId] || ''
    });
    setWrongExchangeReflections({ ...wrongExchangeReflections, [exchangeId]: '' });
  });

  const joinGuild = (guildId) => runStudentAction(async () => {
    await peerLearningApi.joinGuild(user, guildId);
  });

  const addGuildProgress = (guildId) => runStudentAction(async () => {
    await peerLearningApi.addGuildProgress(user, guildId, { xp: 8, note: '完成一項結構化同儕學習任務。' });
  });

  const reportContent = (targetType, targetId) => runStudentAction(async () => {
    await peerLearningApi.report(user, { targetType, targetId, reason: '學生安全檢舉' });
  });

  const createGuild = async () => {
    setBusy(true);
    setError('');
    try {
      await peerLearningApi.createGuild(user, { classId: query.classId, name: guildDraft.name, weeklyGoal: guildDraft.weeklyGoal });
      setGuildDraft({ name: '', weeklyGoal: '' });
      await loadTeacher();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const updateSettings = async (patch = settingsDraft) => {
    setBusy(true);
    setError('');
    try {
      const next = await peerLearningApi.updateSettings(user, {
        ...(patch || {}),
        classId: settingsClassId
      });
      setSettingsDraft(next);
      await loadTeacher();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const exportModerationLogs = async () => {
    setBusy(true);
    setError('');
    try {
      const csv = await peerLearningApi.exportModerationLogs(user, { classId: settingsClassId, limit: 1000 });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `同儕學習審核紀錄-${settingsClassId || '預設班級'}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const exportAnalytics = async () => {
    setBusy(true);
    setError('');
    try {
      const csv = await peerLearningApi.exportAnalytics(user, { classId: settingsClassId });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `同儕學習分析-${settingsClassId || '預設班級'}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const moderate = async (targetType, targetId, action) => {
    setBusy(true);
    setError('');
    try {
      await peerLearningApi.moderate(user, { targetType, targetId, action, reason: '教師已在同儕學習審核佇列中處理。' });
      await loadTeacher();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const batchModerate = async (action, items) => {
    const targets = (items || []).map((item) => ({ targetType: item.targetType, targetId: item.id }));
    if (!targets.length) return;
    setBusy(true);
    setError('');
    try {
      const result = await peerLearningApi.moderateBatch(user, {
        action,
        items: targets,
        reason: `教師在同儕學習審核佇列中批次處理：${action}。`
      });
      if (result.failed > 0) setError(`${result.succeeded} 筆已更新；${result.failed} 筆需要人工確認。`);
      await loadTeacher();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openTimelineCase = async (item) => {
    setBusy(true);
    setError('');
    try {
      const detail = await peerLearningApi.moderationTimelineCase(user, {
        classId: settingsClassId,
        targetType: item.targetType,
        targetId: item.targetId
      });
      setTimelineCaseDetail(detail);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'teacher') {
    const queueGroups = [
      ['explanations', '同儕解析', 'explanation'],
      ['helpRequests', '求助請求', 'helpRequest'],
      ['helpResponses', '協助回覆', 'helpResponse'],
      ['studentQuestions', '學生自創題', 'studentQuestion'],
      ['peerChallenges', '已檢舉挑戰', 'peerChallenge'],
      ['peerReviews', '已檢舉互評', 'peerReview'],
      ['wrongExchanges', '已檢舉錯題交換', 'wrongExchange'],
      ['learningGuilds', '學習小組', 'learningGuild']
    ];
    const allQueueItems = queueGroups.flatMap(([key, label, targetType]) => (
      (queue?.[key] || []).map((item) => ({ ...item, queueLabel: label, targetType }))
    ));
    const filteredQueueItems = allQueueItems.filter((item) => (
      (queueTypeFilter === 'all' || item.targetType === queueTypeFilter) &&
      (queueStatusFilter === 'all' || item.status === queueStatusFilter)
    ));
    const selectedItems = filteredQueueItems.filter((item) => selectedModeration[moderationKey(item.targetType, item.id)]);
    const selectedCount = selectedItems.length;
    const pendingCount = allQueueItems.length;
    const itemsForType = (targetType) => filteredQueueItems.filter((item) => item.targetType === targetType);
    const toggleModerationSelection = (item) => {
      const key = moderationKey(item.targetType, item.id);
      setSelectedModeration((previous) => ({ ...previous, [key]: !previous[key] }));
    };
    const selectVisible = () => {
      const next = {};
      filteredQueueItems.forEach((item) => {
        next[moderationKey(item.targetType, item.id)] = true;
      });
      setSelectedModeration(next);
    };
    const selectionControl = (item) => (
      <label className="peer-select-item">
        <input
          type="checkbox"
          checked={Boolean(selectedModeration[moderationKey(item.targetType, item.id)])}
          onChange={() => toggleModerationSelection(item)}
        />
        <span>選取</span>
      </label>
    );

    return (
      <section className="peer-learning-hub teacher-mode">
        <div className="peer-hub-header">
          <div>
            <span className="peer-eyebrow"><Users size={16} /> 學生互助學習</span>
            <h3>同儕學習治理</h3>
            <p>審核同儕解析、協助回覆、學生自創題、互評檢舉、錯題交換與學習小組活動。</p>
          </div>
          <button className="secondary-gold-outline-btn" onClick={load} disabled={busy}>重新整理</button>
        </div>
        <SafetyNotice />
        {error && <div className="peer-error"><AlertTriangle size={16} /> {error}</div>}

        <div className="peer-panel">
          <h4><ShieldCheck size={18} /> 同儕學習控制</h4>
          <div className="peer-form-row">
            <input value={settingsClassId} onChange={(event) => setSettingsClassId(event.target.value)} placeholder="班級 ID 或課堂代碼；留空代表預設" />
            <button disabled={busy} onClick={() => updateSettings(settingsDraft)}>儲存控制設定</button>
          </div>
          <div className="peer-settings-grid">
            {[
              ['peerExplanations', '同儕解析'],
              ['helpRequests', '求助請求'],
              ['studentQuestions', '學生自創題'],
              ['peerChallenges', '同儕挑戰'],
              ['peerReviews', '同儕互評'],
              ['wrongExchanges', '錯題交換'],
              ['learningGuilds', '學習小組'],
              ['allowAnonymous', '允許匿名顯示']
            ].map(([key, label]) => (
              <label key={key} className="peer-toggle">
                <input
                  type="checkbox"
                  checked={settingsDraft?.[key] !== false}
                  onChange={(event) => setSettingsDraft({ ...(settingsDraft || {}), [key]: event.target.checked })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p className="peer-muted">這些控制由後端 API 強制執行。停用的功能會在學生端隱藏，並在伺服器端拒絕請求。</p>
        </div>

        <div className="peer-analytics-grid">
          <div><strong>{analytics?.totals?.peerExplanations || 0}</strong><span>解析</span></div>
          <div><strong>{analytics?.totals?.helpRequests || 0}</strong><span>求助</span></div>
          <div><strong>{analytics?.totals?.studentCreatedQuestions || 0}</strong><span>學生出題</span></div>
          <div><strong>{analytics?.totals?.peerChallenges || 0}</strong><span>挑戰</span></div>
          <div><strong>{analytics?.totals?.peerReviewAssignments || 0}</strong><span>互評</span></div>
          <div><strong>{analytics?.totals?.wrongQuestionExchanges || 0}</strong><span>錯題交換</span></div>
          <div><strong>{analytics?.totals?.learningGuilds || 0}</strong><span>小組</span></div>
          <div><strong>{pendingCount}</strong><span>待審核</span></div>
        </div>

        <div className="peer-panel peer-safety-summary">
          <div className="peer-summary-heading">
            <div>
              <h4><ShieldCheck size={18} /> 安全摘要</h4>
              <p className="peer-muted">僅供教師查看的檢舉、鎖定小組與後續審核摘要。匯出功能可保留學生協作分析紀錄，不會把管理控制項暴露給學生。</p>
            </div>
            <button disabled={busy} onClick={exportAnalytics}>匯出分析 CSV</button>
          </div>
          <div className="peer-summary-grid">
            <div><strong>{safetySummary?.riskIndicators?.recentReports || 0}</strong><span>近期檢舉</span></div>
            <div><strong>{safetySummary?.riskIndicators?.pendingModeration || 0}</strong><span>待審核</span></div>
            <div><strong>{safetySummary?.riskIndicators?.lockedGuilds || 0}</strong><span>已鎖定小組</span></div>
            <div><strong>{safetySummary?.riskIndicators?.reportRate || 0}</strong><span>檢舉訊號</span></div>
          </div>
          <div className="peer-summary-columns">
            <div>
              <h5>被檢舉內容類型</h5>
              <div className="peer-chip-list">
                {(safetySummary?.topReportedTypes || []).length === 0 && <span>無</span>}
                {(safetySummary?.topReportedTypes || []).map((item) => (
                  <span key={item.targetType}>{targetTypeText(item.targetType)}：{item.count}</span>
                ))}
              </div>
            </div>
            <div>
              <h5>建議處置</h5>
              <ul className="peer-summary-actions">
                {(safetySummary?.recommendedActions || []).map((action) => <li key={action}>{action}</li>)}
              </ul>
            </div>
          </div>
        </div>

        <div className="peer-two-column">
          <div className="peer-panel">
            <h4><ShieldCheck size={18} /> 審核佇列</h4>
            <div className="peer-moderation-toolbar">
              <select value={queueTypeFilter} onChange={(event) => setQueueTypeFilter(event.target.value)}>
                {MODERATION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select value={queueStatusFilter} onChange={(event) => setQueueStatusFilter(event.target.value)}>
                {MODERATION_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button disabled={busy || filteredQueueItems.length === 0} onClick={selectVisible}>選取目前可見</button>
              <button disabled={busy || selectedCount === 0} onClick={() => setSelectedModeration({})}>清除</button>
            </div>
            <div className="peer-batch-bar">
              <span>{selectedCount} 筆已選取 / {filteredQueueItems.length} 筆可見</span>
              <button disabled={busy || selectedCount === 0} onClick={() => batchModerate('approve', selectedItems)}>批次通過</button>
              <button disabled={busy || selectedCount === 0} onClick={() => batchModerate('return', selectedItems)}>批次退回</button>
              <button className="danger" disabled={busy || selectedCount === 0} onClick={() => batchModerate('hide', selectedItems)}>批次隱藏</button>
            </div>
            {pendingCount === 0 && <p className="peer-empty">目前沒有待審核項目。</p>}
            {pendingCount > 0 && filteredQueueItems.length === 0 && <p className="peer-empty">目前篩選條件沒有符合的審核項目。</p>}

            {itemsForType('explanation').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.explanationText}</p>
                <small>{item.studentName} · {item.questionPrompt || item.questionId}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('explanation', item.id, 'approve')}>通過</button>
                  <button onClick={() => moderate('explanation', item.id, 'feature')}>設為精選</button>
                  <button onClick={() => moderate('explanation', item.id, 'return')}>退回</button>
                  <button className="danger" onClick={() => moderate('explanation', item.id, 'hide')}>隱藏</button>
                </div>
              </div>
            ))}

            {itemsForType('helpRequest').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.message}</p>
                <small>{item.studentName} · {item.knowledgePoint || item.questionId}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('helpRequest', item.id, 'approve')}>解除檢舉</button>
                  <button className="danger" onClick={() => moderate('helpRequest', item.id, 'hide')}>隱藏</button>
                </div>
              </div>
            ))}

            {itemsForType('helpResponse').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.content}</p>
                <small>{item.responderName} · {responseTypeText(item.responseType)}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('helpResponse', item.id, 'approve')}>通過</button>
                  <button className="danger" onClick={() => moderate('helpResponse', item.id, 'hide')}>隱藏</button>
                </div>
              </div>
            ))}

            {itemsForType('studentQuestion').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.prompt}</p>
                <small>{item.creatorName} · {item.knowledgePoint || '未分類'} · 答案：{item.answer}</small>
                {item.explanation && <p className="peer-muted">{item.explanation}</p>}
                <div className="peer-action-row">
                  <button onClick={() => moderate('studentQuestion', item.id, 'approve')}>通過</button>
                  {item.questionBankId && <button onClick={() => moderate('studentQuestion', item.id, 'add_to_teacher_bank')}>加入題庫</button>}
                  <button onClick={() => moderate('studentQuestion', item.id, 'return')}>退回</button>
                  <button className="danger" onClick={() => moderate('studentQuestion', item.id, 'hide')}>隱藏</button>
                </div>
              </div>
            ))}

            {itemsForType('peerChallenge').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.challengerName} 對 {item.opponentName}</p>
                <small>{challengeModeText(item.mode)} · 檢舉：{item.reportCount || 0}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('peerChallenge', item.id, 'approve')}>解除檢舉</button>
                  <button className="danger" onClick={() => moderate('peerChallenge', item.id, 'hide')}>隱藏</button>
                  <button className="danger" onClick={() => moderate('peerChallenge', item.id, 'delete')}>刪除</button>
                </div>
              </div>
            ))}

            {itemsForType('peerReview').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.feedbackText || item.submissionText}</p>
                <small>{item.reviewerName} → {item.revieweeName} · 檢舉：{item.reportCount || 0}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('peerReview', item.id, 'approve')}>解除檢舉</button>
                  <button className="danger" onClick={() => moderate('peerReview', item.id, 'hide')}>隱藏</button>
                  <button className="danger" onClick={() => moderate('peerReview', item.id, 'delete')}>刪除</button>
                </div>
              </div>
            ))}

            {itemsForType('wrongExchange').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.knowledgePoint || '複習概念'}</p>
                <small>{item.studentAName} 與 {item.studentBName} · 檢舉：{item.reportCount || 0}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('wrongExchange', item.id, 'approve')}>解除檢舉</button>
                  <button className="danger" onClick={() => moderate('wrongExchange', item.id, 'hide')}>隱藏</button>
                  <button className="danger" onClick={() => moderate('wrongExchange', item.id, 'delete')}>刪除</button>
                </div>
              </div>
            ))}

            {itemsForType('learningGuild').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.name} · {item.weeklyGoal}</p>
                <small>{(item.members || []).length} 位成員 · 鎖定：{item.moderationLocked ? '是' : '否'}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('learningGuild', item.id, item.moderationLocked ? 'unlock' : 'lock')}>{item.moderationLocked ? '解除鎖定' : '鎖定'}</button>
                  <button onClick={() => moderate('learningGuild', item.id, 'approve')}>解除檢舉</button>
                  <button className="danger" onClick={() => moderate('learningGuild', item.id, 'delete')}>刪除</button>
                </div>
              </div>
            ))}
          </div>

          <div className="peer-panel">
            <h4><Trophy size={18} /> 健康協作</h4>
            <Leaderboard items={analytics?.leaderboard || []} />
            <h4><Lightbulb size={18} /> 熱門求助概念</h4>
            <div className="peer-chip-list">
              {(analytics?.conceptHotspots || []).map((item) => (
                <span key={item.knowledgePoint}>{item.knowledgePoint}: {(item.helpRequests || 0) + (item.explanations || 0) + (item.studentQuestions || 0) + (item.wrongExchanges || 0)}</span>
              ))}
            </div>
            <h4><BookOpenCheck size={18} /> 出題設計者</h4>
            <Leaderboard items={analytics?.badges?.questionDesigners || []} />
            <h4><MessageSquareText size={18} /> 同儕互評者</h4>
            <Leaderboard items={analytics?.badges?.peerReviewers || []} />
            <h4><HandHeart size={18} /> 錯題修復</h4>
            <Leaderboard items={analytics?.badges?.wrongQuestionRepair || []} />
            <h4><Users size={18} /> 建立學習小組</h4>
            <input value={guildDraft.name} onChange={(event) => setGuildDraft({ ...guildDraft, name: event.target.value })} placeholder="小組名稱" />
            <input value={guildDraft.weeklyGoal} onChange={(event) => setGuildDraft({ ...guildDraft, weeklyGoal: event.target.value })} placeholder="每週目標" />
            <button disabled={busy || guildDraft.name.trim().length < 2} onClick={createGuild}>建立小組</button>
            <h4><ShieldCheck size={18} /> 事件時間線</h4>
            <div className="peer-timeline-summary">
              <div><strong>{moderationTimeline?.summary?.totalEvents || 0}</strong><span>事件</span></div>
              <div><strong>{moderationTimeline?.summary?.reportEvents || 0}</strong><span>檢舉</span></div>
              <div><strong>{moderationTimeline?.summary?.activeCases || 0}</strong><span>待追蹤案件</span></div>
            </div>
            <div className="peer-timeline-list">
              {(moderationTimeline?.events || []).length === 0 && <p className="peer-empty">此篩選目前沒有時間線事件。</p>}
              {(moderationTimeline?.events || []).slice(0, 10).map((event) => (
                <div className={`peer-timeline-event ${event.severity}`} key={event.id}>
                  <span className="peer-timeline-dot" />
                  <div>
                    <strong>{formatTimelineEventTitle(event)}</strong>
                    <small>{new Date(event.createdAt).toLocaleString()} · {event.actorRole} · {statusText(event.targetStatus)}</small>
                    <p>{event.targetSummary || event.reason || event.targetId}</p>
                  </div>
                </div>
              ))}
            </div>
            <h4><Flag size={18} /> 時間線案件</h4>
            <div className="peer-log-list">
              {(moderationTimeline?.cases || []).slice(0, 6).map((item) => (
                <button className="peer-case-row" key={item.key} disabled={busy} onClick={() => openTimelineCase(item)}>
                  <strong>{targetTypeText(item.targetType)} · {statusText(item.targetStatus)}</strong>
                  <span>{item.eventCount} 件事件 · {item.reportCount} 件檢舉 · {item.moderationCount} 次處置</span>
                  <small>{item.targetSummary || item.targetId}</small>
                </button>
              ))}
            </div>
            {timelineCaseDetail && (
              <div className="peer-case-detail">
                <div className="peer-item-top">
                  <strong>{targetTypeText(timelineCaseDetail.case.targetType)}案件詳情</strong>
                  <StatusBadge status={timelineCaseDetail.case.targetStatus} />
                </div>
                <p>{timelineCaseDetail.case.targetSummary || timelineCaseDetail.case.targetId}</p>
                <div className="peer-summary-grid compact">
                  <div><strong>{timelineCaseDetail.summary.totalEvents}</strong><span>事件</span></div>
                  <div><strong>{timelineCaseDetail.summary.reportEvents}</strong><span>檢舉</span></div>
                  <div><strong>{timelineCaseDetail.summary.moderationEvents}</strong><span>處置</span></div>
                </div>
                <div className="peer-case-content">
                  <small>學生／行動者：{timelineCaseDetail.target.studentName || '未提供'}</small>
                  <small>知識點：{timelineCaseDetail.target.knowledgePoint || '未分類'}</small>
                  {timelineCaseDetail.target.prompt && <p>{timelineCaseDetail.target.prompt}</p>}
                  {timelineCaseDetail.target.content && <p>{timelineCaseDetail.target.content}</p>}
                  {timelineCaseDetail.case.teacherReviewNote && <small>教師備註：{timelineCaseDetail.case.teacherReviewNote}</small>}
                </div>
                <div className="peer-timeline-list">
                  {timelineCaseDetail.events.map((event) => (
                    <div className={`peer-timeline-event ${event.severity}`} key={event.id}>
                      <span className="peer-timeline-dot" />
                      <div>
                        <strong>{formatTimelineEventTitle(event)}</strong>
                        <small>{new Date(event.createdAt).toLocaleString()} | {event.actorUserId}</small>
                        {event.reason && <p>{event.reason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <h4><ShieldCheck size={18} /> 審核紀錄</h4>
            <div className="peer-action-row">
              <button disabled={busy} onClick={exportModerationLogs}>匯出 CSV</button>
              <button disabled={busy} onClick={load}>重新整理紀錄</button>
            </div>
            <div className="peer-log-list">
              {moderationLogs.length === 0 && <p className="peer-empty">此篩選目前沒有審核紀錄。</p>}
              {moderationLogs.map((log) => (
                <div className="peer-log-row" key={log.id}>
                  <strong>{ACTION_LABELS[log.actionType] || log.actionType}</strong>
                  <span>{targetTypeText(log.targetType)} · {statusText(log.targetStatus)}</span>
                  <small>{new Date(log.createdAt).toLocaleString()} · {log.actorUserId}</small>
                  {log.reason && <small>{log.reason}</small>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const studentSettings = overview?.settings || {};
  const featureEnabled = (key) => studentSettings[key] !== false;

  return (
    <section className={`peer-learning-hub student-mode ${compact ? 'compact' : ''}`}>
      <div className="peer-hub-header">
        <div>
          <span className="peer-eyebrow"><Sparkles size={16} /> 同儕學習</span>
          <h3>結構化同儕學習</h3>
          <p>提交解析、提出求助、設計題目、挑戰同學、互評開放式回答、交換錯題並參與學習小組任務。</p>
        </div>
      </div>
      <SafetyNotice />
      {error && <div className="peer-error"><AlertTriangle size={16} /> {error}</div>}

      <div className="peer-student-grid">
        {featureEnabled('peerExplanations') && (
        <div className="peer-panel">
          <h4><MessageSquareText size={18} /> 同儕解析</h4>
          <textarea value={explanationText} onChange={(event) => setExplanationText(event.target.value)} placeholder="用提示、範例或步驟說明核心概念。" />
          <button className="primary-btn" disabled={busy || explanationText.trim().length < 12} onClick={submitExplanation}>提交審核</button>
        </div>
        )}
        {featureEnabled('helpRequests') && (
        <div className="peer-panel">
          <h4><HelpCircle size={18} /> 提出求助</h4>
          <textarea value={helpMessage} onChange={(event) => setHelpMessage(event.target.value)} placeholder="描述你卡住的地方。請尋求提示，而不是直接要答案。" />
          <button className="secondary-gold-outline-btn" disabled={busy || helpMessage.trim().length < 8} onClick={createHelpRequest}>建立求助請求</button>
        </div>
        )}
      </div>

      <div className="peer-student-grid">
        {featureEnabled('studentQuestions') && (
        <div className="peer-panel">
          <h4><BookOpenCheck size={18} /> 學生自創題</h4>
          <input value={studentQuestionDraft.prompt} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, prompt: event.target.value })} placeholder="題目內容" />
          <input value={studentQuestionDraft.answer} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, answer: event.target.value })} placeholder="正確答案" />
          <textarea value={studentQuestionDraft.explanation} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, explanation: event.target.value })} placeholder="解析" />
          <div className="peer-form-row">
            <input value={studentQuestionDraft.knowledgePoint} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, knowledgePoint: event.target.value })} placeholder="知識點" />
            <select value={studentQuestionDraft.difficulty} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, difficulty: event.target.value })}>
              <option value="easy">簡單</option>
              <option value="medium">中等</option>
              <option value="hard">困難</option>
            </select>
          </div>
          <textarea value={studentQuestionDraft.creationReason} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, creationReason: event.target.value })} placeholder="你為什麼設計這題？" />
          <button disabled={busy || studentQuestionDraft.prompt.trim().length < 8 || studentQuestionDraft.answer.trim().length < 1} onClick={submitStudentQuestion}>提交審核</button>
        </div>
        )}

        {featureEnabled('peerChallenges') && (
        <div className="peer-panel">
          <h4><Trophy size={18} /> 同儕挑戰</h4>
          <input value={challengeDraft.opponentStudentId} onChange={(event) => setChallengeDraft({ ...challengeDraft, opponentStudentId: event.target.value })} placeholder="對手學生 ID；留空則隨機配對" />
          <input value={challengeDraft.opponentName} onChange={(event) => setChallengeDraft({ ...challengeDraft, opponentName: event.target.value })} placeholder="對手顯示名稱" />
          <button disabled={busy} onClick={createChallenge}>建立健康挑戰</button>
          {(overview?.challenges || []).slice(0, 4).map((item) => (
            <div className="peer-review-item" key={item.id}>
              <div className="peer-item-top"><strong>{challengeModeText(item.mode)}</strong><StatusBadge status={item.status} /></div>
              <small>{item.challengerName} 對 {item.opponentName}</small>
              <p className="peer-muted">{item.fairnessNote}</p>
              <div className="peer-action-row">
                <button onClick={() => reportContent('peerChallenge', item.id)}><Flag size={14} /> 檢舉</button>
              </div>
              {item.status === 'pending' && item.opponentStudentId === userId && (
                <div className="peer-action-row">
                  <button onClick={() => respondChallenge(item.id, 'accept')}>接受</button>
                  <button className="danger" onClick={() => respondChallenge(item.id, 'decline')}>婉拒</button>
                </div>
              )}
              {['accepted', 'matched'].includes(item.status) && (
                <div className="peer-response-composer">
                  <input type="number" min="0" value={challengeScores[item.id]?.challenger || ''} onChange={(event) => setChallengeScores({ ...challengeScores, [item.id]: { ...(challengeScores[item.id] || {}), challenger: event.target.value } })} placeholder="挑戰者分數" />
                  <input type="number" min="0" value={challengeScores[item.id]?.opponent || ''} onChange={(event) => setChallengeScores({ ...challengeScores, [item.id]: { ...(challengeScores[item.id] || {}), opponent: event.target.value } })} placeholder="對手分數" />
                  <button onClick={() => completeChallenge(item.id)}>完成</button>
                </div>
              )}
              {item.status === 'completed' && <p>已完成：{Object.values(item.scores || {}).join(' : ')}</p>}
            </div>
          ))}
        </div>
        )}
      </div>

      <div className="peer-student-grid">
        {featureEnabled('peerReviews') && (
        <div className="peer-panel">
          <h4><MessageSquareText size={18} /> 同儕互評</h4>
          <input value={peerReviewDraft.reviewerStudentId} onChange={(event) => setPeerReviewDraft({ ...peerReviewDraft, reviewerStudentId: event.target.value })} placeholder="評閱者學生 ID" />
          <input value={peerReviewDraft.reviewerName} onChange={(event) => setPeerReviewDraft({ ...peerReviewDraft, reviewerName: event.target.value })} placeholder="評閱者顯示名稱" />
          <textarea value={peerReviewDraft.submissionText} onChange={(event) => setPeerReviewDraft({ ...peerReviewDraft, submissionText: event.target.value })} placeholder="要互評的開放式回答或專題內容" />
          <button disabled={busy || peerReviewDraft.reviewerStudentId.trim().length < 1 || peerReviewDraft.submissionText.trim().length < 12} onClick={createPeerReview}>指派同儕互評</button>
          {(overview?.peerReviews || []).slice(0, 4).map((item) => (
            <div className="peer-review-item" key={item.id}>
              <div className="peer-item-top"><strong>互評對象：{item.revieweeName}</strong><StatusBadge status={item.status} /></div>
              <p>{item.submissionText}</p>
              {item.reviewerStudentId === userId && item.status !== 'submitted' && (
                <div className="peer-response-composer">
                  <textarea value={reviewDrafts[item.id]?.feedbackText || ''} onChange={(event) => setReviewDrafts({ ...reviewDrafts, [item.id]: { ...(reviewDrafts[item.id] || {}), feedbackText: event.target.value } })} placeholder="依評分規準撰寫建設性回饋" />
                  <button disabled={(reviewDrafts[item.id]?.feedbackText || '').trim().length < 12} onClick={() => submitPeerReview(item.id)}>提交互評</button>
                </div>
              )}
              {item.status === 'submitted' && <p className="peer-muted">{item.feedbackText}</p>}
              <div className="peer-action-row">
                <button onClick={() => reportContent('peerReview', item.id)}><Flag size={14} /> 檢舉</button>
              </div>
            </div>
          ))}
        </div>
        )}

        {featureEnabled('wrongExchanges') && (
        <div className="peer-panel">
          <h4><HandHeart size={18} /> 錯題交換</h4>
          <input value={wrongExchangeDraft.partnerStudentId} onChange={(event) => setWrongExchangeDraft({ ...wrongExchangeDraft, partnerStudentId: event.target.value })} placeholder="夥伴學生 ID" />
          <input value={wrongExchangeDraft.partnerName} onChange={(event) => setWrongExchangeDraft({ ...wrongExchangeDraft, partnerName: event.target.value })} placeholder="夥伴顯示名稱" />
          <input value={wrongExchangeDraft.knowledgePoint} onChange={(event) => setWrongExchangeDraft({ ...wrongExchangeDraft, knowledgePoint: event.target.value })} placeholder="知識點" />
          <button disabled={busy || wrongExchangeDraft.partnerStudentId.trim().length < 1} onClick={createWrongExchange}>建立交換</button>
          {(overview?.wrongExchanges || []).slice(0, 4).map((item) => (
            <div className="peer-review-item" key={item.id}>
              <div className="peer-item-top"><strong>{item.knowledgePoint || '複習概念'}</strong><StatusBadge status={item.status} /></div>
              <small>{item.studentAName} 與 {item.studentBName}</small>
              <div className="peer-action-row">
                <button onClick={() => reportContent('wrongExchange', item.id)}><Flag size={14} /> 檢舉</button>
              </div>
              {item.status !== 'completed' && (
                <div className="peer-response-composer">
                  <textarea value={wrongExchangeReflections[item.id] || ''} onChange={(event) => setWrongExchangeReflections({ ...wrongExchangeReflections, [item.id]: event.target.value })} placeholder="交換後你修正或理解了什麼？" />
                  <button disabled={(wrongExchangeReflections[item.id] || '').trim().length < 8} onClick={() => completeWrongExchange(item.id)}>提交反思</button>
                </div>
              )}
            </div>
          ))}
        </div>
        )}
      </div>

      <div className="peer-two-column">
        {featureEnabled('learningGuilds') && (
        <div className="peer-panel">
          <h4><Users size={18} /> 學習小組</h4>
          {(overview?.learningGuilds || []).length === 0 && <p className="peer-empty">目前沒有學習小組。</p>}
          {(overview?.learningGuilds || []).map((guild) => (
            <div className="peer-review-item" key={guild.id}>
              <div className="peer-item-top"><strong>{guild.name}</strong><span>{guild.xp || 0} 經驗值</span></div>
              <p>{guild.weeklyGoal}</p>
              <small>{(guild.members || []).length} 位成員</small>
              <div className="peer-action-row">
                <button onClick={() => joinGuild(guild.id)}>加入</button>
                <button onClick={() => addGuildProgress(guild.id)}>新增進度</button>
                <button onClick={() => reportContent('learningGuild', guild.id)}><Flag size={14} /> 檢舉</button>
              </div>
            </div>
          ))}
        </div>
        )}

        {featureEnabled('peerExplanations') && (
        <div className="peer-panel">
          <h4><Star size={18} /> 精選解析</h4>
          {(overview?.explanations || []).length === 0 && <p className="peer-empty">這題目前沒有解析。</p>}
          {(overview?.explanations || []).map((item) => (
            <div className="peer-review-item" key={item.id}>
              <div className="peer-item-top"><strong>{item.studentName}</strong><StatusBadge status={item.status} /></div>
              <p>{item.explanationText}</p>
              <div className="peer-action-row">
                <button onClick={() => peerLearningApi.voteExplanation(user, item.id, 'helpful').then(loadStudent)}>有幫助 {item.helpfulCount}</button>
                <button onClick={() => peerLearningApi.voteExplanation(user, item.id, 'clear').then(loadStudent)}>清楚 {item.clearCount}</button>
                <button onClick={() => peerLearningApi.report(user, { targetType: 'explanation', targetId: item.id, reason: '學生檢舉' }).then(loadStudent)}><Flag size={14} /> 檢舉</button>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      <div className="peer-two-column">
        {featureEnabled('helpRequests') && (
        <div className="peer-panel">
          <h4><HandHeart size={18} /> 求助請求</h4>
          {(overview?.helpRequests || []).length === 0 && <p className="peer-empty">這題目前沒有求助請求。</p>}
          {(overview?.helpRequests || []).map((item) => (
            <div className="peer-review-item" key={item.id}>
              <div className="peer-item-top"><strong>{item.studentName}</strong><StatusBadge status={item.status} /></div>
              <p>{item.message}</p>
              {(item.responses || []).map((response) => (
                <div className="peer-help-response" key={response.id}>
                  <small>{response.responderName} · {responseTypeText(response.responseType)}</small>
                  <p>{response.content}</p>
                  <div className="peer-action-row">
                    {item.studentId === userId && <button onClick={() => peerLearningApi.markHelpful(user, response.id).then(loadStudent)}>標記有幫助</button>}
                    <button onClick={() => reportContent('helpResponse', response.id)}><Flag size={14} /> 檢舉</button>
                  </div>
                </div>
              ))}
              <div className="peer-action-row">
                <button onClick={() => reportContent('helpRequest', item.id)}><Flag size={14} /> 檢舉請求</button>
              </div>
              {item.status !== 'resolved' && (
                <div className="peer-response-composer">
                  <select value={responseTypes[item.id] || 'hint'} onChange={(event) => setResponseTypes({ ...responseTypes, [item.id]: event.target.value })}>
                    {RESPONSE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <textarea value={responseDrafts[item.id] || ''} onChange={(event) => setResponseDrafts({ ...responseDrafts, [item.id]: event.target.value })} placeholder="提供提示或引導問題，不要只給答案。" />
                  <button disabled={busy || (responseDrafts[item.id] || '').trim().length < 8} onClick={() => respondToHelp(item.id)}>送出協助</button>
                </div>
              )}
            </div>
          ))}
        </div>
        )}

        <div className="peer-panel">
          <h4><Trophy size={18} /> 健康協作排行榜</h4>
          <Leaderboard items={leaderboard?.boards?.teamworkXp || overview?.leaderboard || []} />
        </div>
      </div>
    </section>
  );
}
