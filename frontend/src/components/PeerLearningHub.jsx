import React, { useEffect, useMemo, useState } from 'react';
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
  ['hint', 'Hint'],
  ['step_explanation', 'Step explanation'],
  ['example', 'Example'],
  ['guiding_question', 'Guiding question'],
  ['concept_reminder', 'Concept reminder']
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
  ['all', 'All content'],
  ['explanation', 'Peer explanations'],
  ['helpRequest', 'Help requests'],
  ['helpResponse', 'Help responses'],
  ['studentQuestion', 'Student questions'],
  ['peerChallenge', 'Peer challenges'],
  ['peerReview', 'Peer reviews'],
  ['wrongExchange', 'Wrong exchanges'],
  ['learningGuild', 'Learning guilds']
];

const MODERATION_STATUSES = [
  ['all', 'All statuses'],
  ['pending_review', 'Pending review'],
  ['flagged', 'Flagged'],
  ['returned_for_revision', 'Returned'],
  ['approved', 'Approved'],
  ['hidden', 'Hidden'],
  ['deleted', 'Deleted']
];

function moderationKey(targetType, id) {
  return `${targetType}:${id}`;
}

function StatusBadge({ status }) {
  return <span className={`peer-status-badge ${status || 'open'}`}>{status || 'open'}</span>;
}

function SafetyNotice() {
  return (
    <div className="peer-safety-notice">
      <ShieldCheck size={18} />
      <span>Peer learning is structured and reviewable. Use hints, examples, rubric feedback, and constructive language. Teachers keep final moderation control.</span>
    </div>
  );
}

function Leaderboard({ items = [] }) {
  return (
    <div className="peer-leaderboard">
      {items.length === 0 && <p className="peer-empty">No peer learning records yet.</p>}
      {items.map((item) => (
        <div className="peer-leader-row" key={item.studentId}>
          <span className="rank">#{item.rank}</span>
          <strong>{item.studentName}</strong>
          <span>{item.teamworkXp} XP</span>
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

  const loadStudent = async () => {
    const data = await peerLearningApi.overview(user, query);
    const board = await peerLearningApi.leaderboard(user);
    setOverview(data);
    setLeaderboard(board);
  };

  const loadTeacher = async () => {
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
  };

  const load = async () => {
    setError('');
    try {
      if (mode === 'teacher') await loadTeacher();
      else await loadStudent();
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, [mode, query.questionId, query.classId, settingsClassId]);

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
      sourceNote: 'Student-created question'
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
    await peerLearningApi.addGuildProgress(user, guildId, { xp: 8, note: 'Completed a structured peer learning mission.' });
  });

  const reportContent = (targetType, targetId) => runStudentAction(async () => {
    await peerLearningApi.report(user, { targetType, targetId, reason: 'Student safety report' });
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
      link.download = `peer-learning-moderation-logs-${settingsClassId || 'default'}.csv`;
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
      link.download = `peer-learning-analytics-${settingsClassId || 'default'}.csv`;
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
      await peerLearningApi.moderate(user, { targetType, targetId, action, reason: 'Teacher reviewed in peer learning queue.' });
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
        reason: `Teacher batch ${action} in peer learning queue.`
      });
      if (result.failed > 0) setError(`${result.succeeded} items updated; ${result.failed} items need manual review.`);
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
      ['explanations', 'Peer explanation', 'explanation'],
      ['helpRequests', 'Help request', 'helpRequest'],
      ['helpResponses', 'Help response', 'helpResponse'],
      ['studentQuestions', 'Student-created question', 'studentQuestion'],
      ['peerChallenges', 'Flagged challenge', 'peerChallenge'],
      ['peerReviews', 'Flagged peer review', 'peerReview'],
      ['wrongExchanges', 'Flagged wrong-question exchange', 'wrongExchange'],
      ['learningGuilds', 'Learning guild', 'learningGuild']
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
        <span>Select</span>
      </label>
    );

    return (
      <section className="peer-learning-hub teacher-mode">
        <div className="peer-hub-header">
          <div>
            <span className="peer-eyebrow"><Users size={16} /> Student-to-Student Learning</span>
            <h3>Peer Learning Governance</h3>
            <p>Review explanations, help responses, student-created questions, peer review flags, wrong-question exchanges, and guild activity.</p>
          </div>
          <button className="secondary-gold-outline-btn" onClick={load} disabled={busy}>Refresh</button>
        </div>
        <SafetyNotice />
        {error && <div className="peer-error"><AlertTriangle size={16} /> {error}</div>}

        <div className="peer-panel">
          <h4><ShieldCheck size={18} /> Peer Learning Controls</h4>
          <div className="peer-form-row">
            <input value={settingsClassId} onChange={(event) => setSettingsClassId(event.target.value)} placeholder="Class ID or room code; blank means default" />
            <button disabled={busy} onClick={() => updateSettings(settingsDraft)}>Save controls</button>
          </div>
          <div className="peer-settings-grid">
            {[
              ['peerExplanations', 'Peer explanations'],
              ['helpRequests', 'Help requests'],
              ['studentQuestions', 'Student-created questions'],
              ['peerChallenges', 'Peer challenges'],
              ['peerReviews', 'Peer reviews'],
              ['wrongExchanges', 'Wrong question exchange'],
              ['learningGuilds', 'Learning guilds'],
              ['allowAnonymous', 'Allow anonymous display']
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
          <p className="peer-muted">These controls are enforced by backend APIs. Disabled features are hidden from students and rejected server-side.</p>
        </div>

        <div className="peer-analytics-grid">
          <div><strong>{analytics?.totals?.peerExplanations || 0}</strong><span>Explanations</span></div>
          <div><strong>{analytics?.totals?.helpRequests || 0}</strong><span>Help requests</span></div>
          <div><strong>{analytics?.totals?.studentCreatedQuestions || 0}</strong><span>Student questions</span></div>
          <div><strong>{analytics?.totals?.peerChallenges || 0}</strong><span>Challenges</span></div>
          <div><strong>{analytics?.totals?.peerReviewAssignments || 0}</strong><span>Peer reviews</span></div>
          <div><strong>{analytics?.totals?.wrongQuestionExchanges || 0}</strong><span>Wrong exchanges</span></div>
          <div><strong>{analytics?.totals?.learningGuilds || 0}</strong><span>Guilds</span></div>
          <div><strong>{pendingCount}</strong><span>Needs review</span></div>
        </div>

        <div className="peer-panel peer-safety-summary">
          <div className="peer-summary-heading">
            <div>
              <h4><ShieldCheck size={18} /> Safety Summary</h4>
              <p className="peer-muted">Teacher-only snapshot for reports, locked guilds, and moderation follow-up. Export keeps student collaboration analytics reviewable without exposing admin controls to students.</p>
            </div>
            <button disabled={busy} onClick={exportAnalytics}>Export analytics CSV</button>
          </div>
          <div className="peer-summary-grid">
            <div><strong>{safetySummary?.riskIndicators?.recentReports || 0}</strong><span>Recent reports</span></div>
            <div><strong>{safetySummary?.riskIndicators?.pendingModeration || 0}</strong><span>Pending review</span></div>
            <div><strong>{safetySummary?.riskIndicators?.lockedGuilds || 0}</strong><span>Locked guilds</span></div>
            <div><strong>{safetySummary?.riskIndicators?.reportRate || 0}</strong><span>Report signal</span></div>
          </div>
          <div className="peer-summary-columns">
            <div>
              <h5>Reported content types</h5>
              <div className="peer-chip-list">
                {(safetySummary?.topReportedTypes || []).length === 0 && <span>None</span>}
                {(safetySummary?.topReportedTypes || []).map((item) => (
                  <span key={item.targetType}>{item.targetType}: {item.count}</span>
                ))}
              </div>
            </div>
            <div>
              <h5>Recommended actions</h5>
              <ul className="peer-summary-actions">
                {(safetySummary?.recommendedActions || []).map((action) => <li key={action}>{action}</li>)}
              </ul>
            </div>
          </div>
        </div>

        <div className="peer-two-column">
          <div className="peer-panel">
            <h4><ShieldCheck size={18} /> Moderation Queue</h4>
            <div className="peer-moderation-toolbar">
              <select value={queueTypeFilter} onChange={(event) => setQueueTypeFilter(event.target.value)}>
                {MODERATION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select value={queueStatusFilter} onChange={(event) => setQueueStatusFilter(event.target.value)}>
                {MODERATION_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button disabled={busy || filteredQueueItems.length === 0} onClick={selectVisible}>Select visible</button>
              <button disabled={busy || selectedCount === 0} onClick={() => setSelectedModeration({})}>Clear</button>
            </div>
            <div className="peer-batch-bar">
              <span>{selectedCount} selected / {filteredQueueItems.length} visible</span>
              <button disabled={busy || selectedCount === 0} onClick={() => batchModerate('approve', selectedItems)}>Batch approve</button>
              <button disabled={busy || selectedCount === 0} onClick={() => batchModerate('return', selectedItems)}>Batch return</button>
              <button className="danger" disabled={busy || selectedCount === 0} onClick={() => batchModerate('hide', selectedItems)}>Batch hide</button>
            </div>
            {pendingCount === 0 && <p className="peer-empty">No pending moderation items.</p>}
            {pendingCount > 0 && filteredQueueItems.length === 0 && <p className="peer-empty">No moderation items match the current filters.</p>}

            {itemsForType('explanation').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.explanationText}</p>
                <small>{item.studentName} · {item.questionPrompt || item.questionId}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('explanation', item.id, 'approve')}>Approve</button>
                  <button onClick={() => moderate('explanation', item.id, 'feature')}>Feature</button>
                  <button onClick={() => moderate('explanation', item.id, 'return')}>Return</button>
                  <button className="danger" onClick={() => moderate('explanation', item.id, 'hide')}>Hide</button>
                </div>
              </div>
            ))}

            {itemsForType('helpRequest').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.message}</p>
                <small>{item.studentName} 繚 {item.knowledgePoint || item.questionId}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('helpRequest', item.id, 'approve')}>Clear flag</button>
                  <button className="danger" onClick={() => moderate('helpRequest', item.id, 'hide')}>Hide</button>
                </div>
              </div>
            ))}

            {itemsForType('helpResponse').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.content}</p>
                <small>{item.responderName} · {item.responseType}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('helpResponse', item.id, 'approve')}>Approve</button>
                  <button className="danger" onClick={() => moderate('helpResponse', item.id, 'hide')}>Hide</button>
                </div>
              </div>
            ))}

            {itemsForType('studentQuestion').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.prompt}</p>
                <small>{item.creatorName} · {item.knowledgePoint || 'Uncategorized'} · Answer: {item.answer}</small>
                {item.explanation && <p className="peer-muted">{item.explanation}</p>}
                <div className="peer-action-row">
                  <button onClick={() => moderate('studentQuestion', item.id, 'approve')}>Approve</button>
                  {item.questionBankId && <button onClick={() => moderate('studentQuestion', item.id, 'add_to_teacher_bank')}>Add to bank</button>}
                  <button onClick={() => moderate('studentQuestion', item.id, 'return')}>Return</button>
                  <button className="danger" onClick={() => moderate('studentQuestion', item.id, 'hide')}>Hide</button>
                </div>
              </div>
            ))}

            {itemsForType('peerChallenge').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.challengerName} vs {item.opponentName}</p>
                <small>{item.mode} · reports: {item.reportCount || 0}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('peerChallenge', item.id, 'approve')}>Clear flag</button>
                  <button className="danger" onClick={() => moderate('peerChallenge', item.id, 'hide')}>Hide</button>
                  <button className="danger" onClick={() => moderate('peerChallenge', item.id, 'delete')}>Delete</button>
                </div>
              </div>
            ))}

            {itemsForType('peerReview').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.feedbackText || item.submissionText}</p>
                <small>{item.reviewerName} → {item.revieweeName} · reports: {item.reportCount || 0}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('peerReview', item.id, 'approve')}>Clear flag</button>
                  <button className="danger" onClick={() => moderate('peerReview', item.id, 'hide')}>Hide</button>
                  <button className="danger" onClick={() => moderate('peerReview', item.id, 'delete')}>Delete</button>
                </div>
              </div>
            ))}

            {itemsForType('wrongExchange').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.knowledgePoint || 'Review concept'}</p>
                <small>{item.studentAName} x {item.studentBName} · reports: {item.reportCount || 0}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('wrongExchange', item.id, 'approve')}>Clear flag</button>
                  <button className="danger" onClick={() => moderate('wrongExchange', item.id, 'hide')}>Hide</button>
                  <button className="danger" onClick={() => moderate('wrongExchange', item.id, 'delete')}>Delete</button>
                </div>
              </div>
            ))}

            {itemsForType('learningGuild').map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>{item.queueLabel}</strong><span>{selectionControl(item)}<StatusBadge status={item.status} /></span></div>
                <p>{item.name} · {item.weeklyGoal}</p>
                <small>{(item.members || []).length} members · locked: {item.moderationLocked ? 'yes' : 'no'}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('learningGuild', item.id, item.moderationLocked ? 'unlock' : 'lock')}>{item.moderationLocked ? 'Unlock' : 'Lock'}</button>
                  <button onClick={() => moderate('learningGuild', item.id, 'approve')}>Clear flag</button>
                  <button className="danger" onClick={() => moderate('learningGuild', item.id, 'delete')}>Delete</button>
                </div>
              </div>
            ))}
          </div>

          <div className="peer-panel">
            <h4><Trophy size={18} /> Healthy Collaboration</h4>
            <Leaderboard items={analytics?.leaderboard || []} />
            <h4><Lightbulb size={18} /> Hot Concepts</h4>
            <div className="peer-chip-list">
              {(analytics?.conceptHotspots || []).map((item) => (
                <span key={item.knowledgePoint}>{item.knowledgePoint}: {(item.helpRequests || 0) + (item.explanations || 0) + (item.studentQuestions || 0) + (item.wrongExchanges || 0)}</span>
              ))}
            </div>
            <h4><BookOpenCheck size={18} /> Question Designers</h4>
            <Leaderboard items={analytics?.badges?.questionDesigners || []} />
            <h4><MessageSquareText size={18} /> Peer Reviewers</h4>
            <Leaderboard items={analytics?.badges?.peerReviewers || []} />
            <h4><HandHeart size={18} /> Wrong Question Repair</h4>
            <Leaderboard items={analytics?.badges?.wrongQuestionRepair || []} />
            <h4><Users size={18} /> Create Learning Guild</h4>
            <input value={guildDraft.name} onChange={(event) => setGuildDraft({ ...guildDraft, name: event.target.value })} placeholder="Guild name" />
            <input value={guildDraft.weeklyGoal} onChange={(event) => setGuildDraft({ ...guildDraft, weeklyGoal: event.target.value })} placeholder="Weekly goal" />
            <button disabled={busy || guildDraft.name.trim().length < 2} onClick={createGuild}>Create guild</button>
            <h4><ShieldCheck size={18} /> Event Timeline</h4>
            <div className="peer-timeline-summary">
              <div><strong>{moderationTimeline?.summary?.totalEvents || 0}</strong><span>events</span></div>
              <div><strong>{moderationTimeline?.summary?.reportEvents || 0}</strong><span>reports</span></div>
              <div><strong>{moderationTimeline?.summary?.activeCases || 0}</strong><span>active cases</span></div>
            </div>
            <div className="peer-timeline-list">
              {(moderationTimeline?.events || []).length === 0 && <p className="peer-empty">No timeline events for this filter yet.</p>}
              {(moderationTimeline?.events || []).slice(0, 10).map((event) => (
                <div className={`peer-timeline-event ${event.severity}`} key={event.id}>
                  <span className="peer-timeline-dot" />
                  <div>
                    <strong>{event.title}</strong>
                    <small>{new Date(event.createdAt).toLocaleString()} 繚 {event.actorRole} 繚 {event.targetStatus || 'open'}</small>
                    <p>{event.targetSummary || event.reason || event.targetId}</p>
                  </div>
                </div>
              ))}
            </div>
            <h4><Flag size={18} /> Timeline Cases</h4>
            <div className="peer-log-list">
              {(moderationTimeline?.cases || []).slice(0, 6).map((item) => (
                <button className="peer-case-row" key={item.key} disabled={busy} onClick={() => openTimelineCase(item)}>
                  <strong>{item.targetType} 繚 {item.targetStatus || 'open'}</strong>
                  <span>{item.eventCount} events 繚 {item.reportCount} reports 繚 {item.moderationCount} actions</span>
                  <small>{item.targetSummary || item.targetId}</small>
                </button>
              ))}
            </div>
            {timelineCaseDetail && (
              <div className="peer-case-detail">
                <div className="peer-item-top">
                  <strong>{timelineCaseDetail.case.targetType} case detail</strong>
                  <StatusBadge status={timelineCaseDetail.case.targetStatus} />
                </div>
                <p>{timelineCaseDetail.case.targetSummary || timelineCaseDetail.case.targetId}</p>
                <div className="peer-summary-grid compact">
                  <div><strong>{timelineCaseDetail.summary.totalEvents}</strong><span>events</span></div>
                  <div><strong>{timelineCaseDetail.summary.reportEvents}</strong><span>reports</span></div>
                  <div><strong>{timelineCaseDetail.summary.moderationEvents}</strong><span>actions</span></div>
                </div>
                <div className="peer-case-content">
                  <small>Student / actor: {timelineCaseDetail.target.studentName || 'N/A'}</small>
                  <small>Knowledge point: {timelineCaseDetail.target.knowledgePoint || 'Uncategorized'}</small>
                  {timelineCaseDetail.target.prompt && <p>{timelineCaseDetail.target.prompt}</p>}
                  {timelineCaseDetail.target.content && <p>{timelineCaseDetail.target.content}</p>}
                  {timelineCaseDetail.case.teacherReviewNote && <small>Teacher note: {timelineCaseDetail.case.teacherReviewNote}</small>}
                </div>
                <div className="peer-timeline-list">
                  {timelineCaseDetail.events.map((event) => (
                    <div className={`peer-timeline-event ${event.severity}`} key={event.id}>
                      <span className="peer-timeline-dot" />
                      <div>
                        <strong>{event.title}</strong>
                        <small>{new Date(event.createdAt).toLocaleString()} | {event.actorUserId}</small>
                        {event.reason && <p>{event.reason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <h4><ShieldCheck size={18} /> Moderation Logs</h4>
            <div className="peer-action-row">
              <button disabled={busy} onClick={exportModerationLogs}>Export CSV</button>
              <button disabled={busy} onClick={load}>Refresh logs</button>
            </div>
            <div className="peer-log-list">
              {moderationLogs.length === 0 && <p className="peer-empty">No moderation logs for this filter yet.</p>}
              {moderationLogs.map((log) => (
                <div className="peer-log-row" key={log.id}>
                  <strong>{log.actionType}</strong>
                  <span>{log.targetType} · {log.targetStatus || 'open'}</span>
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
          <span className="peer-eyebrow"><Sparkles size={16} /> Peer Learning</span>
          <h3>Structured Peer Learning</h3>
          <p>Submit explanations, ask for help, design questions, challenge classmates, review open answers, exchange wrong questions, and join guild missions.</p>
        </div>
      </div>
      <SafetyNotice />
      {error && <div className="peer-error"><AlertTriangle size={16} /> {error}</div>}

      <div className="peer-student-grid">
        {featureEnabled('peerExplanations') && (
        <div className="peer-panel">
          <h4><MessageSquareText size={18} /> Peer Explanation</h4>
          <textarea value={explanationText} onChange={(event) => setExplanationText(event.target.value)} placeholder="Explain the key idea with a hint, example, or steps." />
          <button className="primary-btn" disabled={busy || explanationText.trim().length < 12} onClick={submitExplanation}>Submit for review</button>
        </div>
        )}
        {featureEnabled('helpRequests') && (
        <div className="peer-panel">
          <h4><HelpCircle size={18} /> Ask for Help</h4>
          <textarea value={helpMessage} onChange={(event) => setHelpMessage(event.target.value)} placeholder="Describe where you are stuck. Ask for a hint, not just the answer." />
          <button className="secondary-gold-outline-btn" disabled={busy || helpMessage.trim().length < 8} onClick={createHelpRequest}>Create help request</button>
        </div>
        )}
      </div>

      <div className="peer-student-grid">
        {featureEnabled('studentQuestions') && (
        <div className="peer-panel">
          <h4><BookOpenCheck size={18} /> Student-Created Question</h4>
          <input value={studentQuestionDraft.prompt} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, prompt: event.target.value })} placeholder="Question prompt" />
          <input value={studentQuestionDraft.answer} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, answer: event.target.value })} placeholder="Correct answer" />
          <textarea value={studentQuestionDraft.explanation} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, explanation: event.target.value })} placeholder="Explanation" />
          <div className="peer-form-row">
            <input value={studentQuestionDraft.knowledgePoint} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, knowledgePoint: event.target.value })} placeholder="Knowledge point" />
            <select value={studentQuestionDraft.difficulty} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, difficulty: event.target.value })}>
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </div>
          <textarea value={studentQuestionDraft.creationReason} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, creationReason: event.target.value })} placeholder="Why did you design this question?" />
          <button disabled={busy || studentQuestionDraft.prompt.trim().length < 8 || studentQuestionDraft.answer.trim().length < 1} onClick={submitStudentQuestion}>Submit for review</button>
        </div>
        )}

        {featureEnabled('peerChallenges') && (
        <div className="peer-panel">
          <h4><Trophy size={18} /> Peer Challenge</h4>
          <input value={challengeDraft.opponentStudentId} onChange={(event) => setChallengeDraft({ ...challengeDraft, opponentStudentId: event.target.value })} placeholder="Opponent student ID; leave blank for random" />
          <input value={challengeDraft.opponentName} onChange={(event) => setChallengeDraft({ ...challengeDraft, opponentName: event.target.value })} placeholder="Opponent display name" />
          <button disabled={busy} onClick={createChallenge}>Create healthy challenge</button>
          {(overview?.challenges || []).slice(0, 4).map((item) => (
            <div className="peer-review-item" key={item.id}>
              <div className="peer-item-top"><strong>{item.mode}</strong><StatusBadge status={item.status} /></div>
              <small>{item.challengerName} vs {item.opponentName}</small>
              <p className="peer-muted">{item.fairnessNote}</p>
              <div className="peer-action-row">
                <button onClick={() => reportContent('peerChallenge', item.id)}><Flag size={14} /> Report</button>
              </div>
              {item.status === 'pending' && item.opponentStudentId === userId && (
                <div className="peer-action-row">
                  <button onClick={() => respondChallenge(item.id, 'accept')}>Accept</button>
                  <button className="danger" onClick={() => respondChallenge(item.id, 'decline')}>Decline</button>
                </div>
              )}
              {['accepted', 'matched'].includes(item.status) && (
                <div className="peer-response-composer">
                  <input type="number" min="0" value={challengeScores[item.id]?.challenger || ''} onChange={(event) => setChallengeScores({ ...challengeScores, [item.id]: { ...(challengeScores[item.id] || {}), challenger: event.target.value } })} placeholder="Challenger score" />
                  <input type="number" min="0" value={challengeScores[item.id]?.opponent || ''} onChange={(event) => setChallengeScores({ ...challengeScores, [item.id]: { ...(challengeScores[item.id] || {}), opponent: event.target.value } })} placeholder="Opponent score" />
                  <button onClick={() => completeChallenge(item.id)}>Complete</button>
                </div>
              )}
              {item.status === 'completed' && <p>Completed: {Object.values(item.scores || {}).join(' : ')}</p>}
            </div>
          ))}
        </div>
        )}
      </div>

      <div className="peer-student-grid">
        {featureEnabled('peerReviews') && (
        <div className="peer-panel">
          <h4><MessageSquareText size={18} /> Peer Review</h4>
          <input value={peerReviewDraft.reviewerStudentId} onChange={(event) => setPeerReviewDraft({ ...peerReviewDraft, reviewerStudentId: event.target.value })} placeholder="Reviewer student ID" />
          <input value={peerReviewDraft.reviewerName} onChange={(event) => setPeerReviewDraft({ ...peerReviewDraft, reviewerName: event.target.value })} placeholder="Reviewer display name" />
          <textarea value={peerReviewDraft.submissionText} onChange={(event) => setPeerReviewDraft({ ...peerReviewDraft, submissionText: event.target.value })} placeholder="Open answer or project text to review" />
          <button disabled={busy || peerReviewDraft.reviewerStudentId.trim().length < 1 || peerReviewDraft.submissionText.trim().length < 12} onClick={createPeerReview}>Assign peer review</button>
          {(overview?.peerReviews || []).slice(0, 4).map((item) => (
            <div className="peer-review-item" key={item.id}>
              <div className="peer-item-top"><strong>Review for {item.revieweeName}</strong><StatusBadge status={item.status} /></div>
              <p>{item.submissionText}</p>
              {item.reviewerStudentId === userId && item.status !== 'submitted' && (
                <div className="peer-response-composer">
                  <textarea value={reviewDrafts[item.id]?.feedbackText || ''} onChange={(event) => setReviewDrafts({ ...reviewDrafts, [item.id]: { ...(reviewDrafts[item.id] || {}), feedbackText: event.target.value } })} placeholder="Constructive rubric feedback" />
                  <button disabled={(reviewDrafts[item.id]?.feedbackText || '').trim().length < 12} onClick={() => submitPeerReview(item.id)}>Submit review</button>
                </div>
              )}
              {item.status === 'submitted' && <p className="peer-muted">{item.feedbackText}</p>}
              <div className="peer-action-row">
                <button onClick={() => reportContent('peerReview', item.id)}><Flag size={14} /> Report</button>
              </div>
            </div>
          ))}
        </div>
        )}

        {featureEnabled('wrongExchanges') && (
        <div className="peer-panel">
          <h4><HandHeart size={18} /> Wrong Question Exchange</h4>
          <input value={wrongExchangeDraft.partnerStudentId} onChange={(event) => setWrongExchangeDraft({ ...wrongExchangeDraft, partnerStudentId: event.target.value })} placeholder="Partner student ID" />
          <input value={wrongExchangeDraft.partnerName} onChange={(event) => setWrongExchangeDraft({ ...wrongExchangeDraft, partnerName: event.target.value })} placeholder="Partner display name" />
          <input value={wrongExchangeDraft.knowledgePoint} onChange={(event) => setWrongExchangeDraft({ ...wrongExchangeDraft, knowledgePoint: event.target.value })} placeholder="Knowledge point" />
          <button disabled={busy || wrongExchangeDraft.partnerStudentId.trim().length < 1} onClick={createWrongExchange}>Create exchange</button>
          {(overview?.wrongExchanges || []).slice(0, 4).map((item) => (
            <div className="peer-review-item" key={item.id}>
              <div className="peer-item-top"><strong>{item.knowledgePoint || 'Review concept'}</strong><StatusBadge status={item.status} /></div>
              <small>{item.studentAName} x {item.studentBName}</small>
              <div className="peer-action-row">
                <button onClick={() => reportContent('wrongExchange', item.id)}><Flag size={14} /> Report</button>
              </div>
              {item.status !== 'completed' && (
                <div className="peer-response-composer">
                  <textarea value={wrongExchangeReflections[item.id] || ''} onChange={(event) => setWrongExchangeReflections({ ...wrongExchangeReflections, [item.id]: event.target.value })} placeholder="What did you repair or understand after the exchange?" />
                  <button disabled={(wrongExchangeReflections[item.id] || '').trim().length < 8} onClick={() => completeWrongExchange(item.id)}>Submit reflection</button>
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
          <h4><Users size={18} /> Learning Guilds</h4>
          {(overview?.learningGuilds || []).length === 0 && <p className="peer-empty">No learning guilds yet.</p>}
          {(overview?.learningGuilds || []).map((guild) => (
            <div className="peer-review-item" key={guild.id}>
              <div className="peer-item-top"><strong>{guild.name}</strong><span>{guild.xp || 0} XP</span></div>
              <p>{guild.weeklyGoal}</p>
              <small>{(guild.members || []).length} members</small>
              <div className="peer-action-row">
                <button onClick={() => joinGuild(guild.id)}>Join</button>
                <button onClick={() => addGuildProgress(guild.id)}>Add progress</button>
                <button onClick={() => reportContent('learningGuild', guild.id)}><Flag size={14} /> Report</button>
              </div>
            </div>
          ))}
        </div>
        )}

        {featureEnabled('peerExplanations') && (
        <div className="peer-panel">
          <h4><Star size={18} /> Featured Explanations</h4>
          {(overview?.explanations || []).length === 0 && <p className="peer-empty">No explanations for this question yet.</p>}
          {(overview?.explanations || []).map((item) => (
            <div className="peer-review-item" key={item.id}>
              <div className="peer-item-top"><strong>{item.studentName}</strong><StatusBadge status={item.status} /></div>
              <p>{item.explanationText}</p>
              <div className="peer-action-row">
                <button onClick={() => peerLearningApi.voteExplanation(user, item.id, 'helpful').then(loadStudent)}>Helpful {item.helpfulCount}</button>
                <button onClick={() => peerLearningApi.voteExplanation(user, item.id, 'clear').then(loadStudent)}>Clear {item.clearCount}</button>
                <button onClick={() => peerLearningApi.report(user, { targetType: 'explanation', targetId: item.id, reason: 'Student report' }).then(loadStudent)}><Flag size={14} /> Report</button>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      <div className="peer-two-column">
        {featureEnabled('helpRequests') && (
        <div className="peer-panel">
          <h4><HandHeart size={18} /> Help Requests</h4>
          {(overview?.helpRequests || []).length === 0 && <p className="peer-empty">No help requests for this question yet.</p>}
          {(overview?.helpRequests || []).map((item) => (
            <div className="peer-review-item" key={item.id}>
              <div className="peer-item-top"><strong>{item.studentName}</strong><StatusBadge status={item.status} /></div>
              <p>{item.message}</p>
              {(item.responses || []).map((response) => (
                <div className="peer-help-response" key={response.id}>
                  <small>{response.responderName} · {response.responseType}</small>
                  <p>{response.content}</p>
                  <div className="peer-action-row">
                    {item.studentId === userId && <button onClick={() => peerLearningApi.markHelpful(user, response.id).then(loadStudent)}>Mark helpful</button>}
                    <button onClick={() => reportContent('helpResponse', response.id)}><Flag size={14} /> Report</button>
                  </div>
                </div>
              ))}
              <div className="peer-action-row">
                <button onClick={() => reportContent('helpRequest', item.id)}><Flag size={14} /> Report request</button>
              </div>
              {item.status !== 'resolved' && (
                <div className="peer-response-composer">
                  <select value={responseTypes[item.id] || 'hint'} onChange={(event) => setResponseTypes({ ...responseTypes, [item.id]: event.target.value })}>
                    {RESPONSE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <textarea value={responseDrafts[item.id] || ''} onChange={(event) => setResponseDrafts({ ...responseDrafts, [item.id]: event.target.value })} placeholder="Offer a hint or guiding question, not just the answer." />
                  <button disabled={busy || (responseDrafts[item.id] || '').trim().length < 8} onClick={() => respondToHelp(item.id)}>Send help</button>
                </div>
              )}
            </div>
          ))}
        </div>
        )}

        <div className="peer-panel">
          <h4><Trophy size={18} /> Healthy Collaboration Leaderboard</h4>
          <Leaderboard items={leaderboard?.boards?.teamworkXp || overview?.leaderboard || []} />
        </div>
      </div>
    </section>
  );
}
