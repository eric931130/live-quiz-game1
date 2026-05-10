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
  ['hint', '提示'],
  ['step_explanation', '步驟式解釋'],
  ['example', '相關例子'],
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

function StatusBadge({ status }) {
  return <span className={`peer-status-badge ${status || 'open'}`}>{status || 'open'}</span>;
}

function SafetyNotice() {
  return (
    <div className="peer-safety-notice">
      <ShieldCheck size={18} />
      <span>同儕學習以題目、提示、解析與求助為核心；內容可被老師審核、隱藏或退回，請使用建設性語氣協助同學理解概念。</span>
    </div>
  );
}

function Leaderboard({ items = [] }) {
  return (
    <div className="peer-leaderboard">
      {items.length === 0 && <p className="peer-empty">目前尚無同儕學習紀錄。</p>}
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
  const [leaderboard, setLeaderboard] = useState(null);
  const [explanationText, setExplanationText] = useState('');
  const [helpMessage, setHelpMessage] = useState('');
  const [responseDrafts, setResponseDrafts] = useState({});
  const [responseTypes, setResponseTypes] = useState({});
  const [studentQuestionDraft, setStudentQuestionDraft] = useState(emptyStudentQuestion);
  const [challengeDraft, setChallengeDraft] = useState({ opponentStudentId: '', opponentName: '' });
  const [challengeScores, setChallengeScores] = useState({});
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
    const [queueData, analyticsData] = await Promise.all([
      peerLearningApi.teacherQueue(user),
      peerLearningApi.teacherAnalytics(user)
    ]);
    setQueue(queueData);
    setAnalytics(analyticsData);
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
  }, [mode, query.questionId, query.classId]);

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
    await peerLearningApi.submitExplanation(user, {
      ...payloadContext(),
      explanationText,
      explanationType: 'concept_explanation'
    });
    setExplanationText('');
  });

  const createHelpRequest = () => runStudentAction(async () => {
    await peerLearningApi.createHelpRequest(user, {
      ...payloadContext(),
      message: helpMessage
    });
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

  if (mode === 'teacher') {
    const pendingCount = (queue?.explanations?.length || 0) +
      (queue?.helpRequests?.length || 0) +
      (queue?.helpResponses?.length || 0) +
      (queue?.studentQuestions?.length || 0) +
      (queue?.peerChallenges?.length || 0);

    return (
      <section className="peer-learning-hub teacher-mode">
        <div className="peer-hub-header">
          <div>
            <span className="peer-eyebrow"><Users size={16} /> Student-to-Student Learning</span>
            <h3>同儕學習審核中心</h3>
            <p>集中審核同儕解析、求助回覆、學生自創題與被檢舉的挑戰紀錄，老師保有最終控制權。</p>
          </div>
          <button className="secondary-gold-outline-btn" onClick={load} disabled={busy}>重新整理</button>
        </div>
        <SafetyNotice />
        {error && <div className="peer-error"><AlertTriangle size={16} /> {error}</div>}

        <div className="peer-analytics-grid">
          <div><strong>{analytics?.totals?.peerExplanations || 0}</strong><span>同儕解析</span></div>
          <div><strong>{analytics?.totals?.helpRequests || 0}</strong><span>求助</span></div>
          <div><strong>{analytics?.totals?.studentCreatedQuestions || 0}</strong><span>學生出題</span></div>
          <div><strong>{analytics?.totals?.peerChallenges || 0}</strong><span>挑戰</span></div>
          <div><strong>{pendingCount}</strong><span>待審核</span></div>
        </div>

        <div className="peer-two-column">
          <div className="peer-panel">
            <h4><ShieldCheck size={18} /> 審核佇列</h4>
            {pendingCount === 0 && <p className="peer-empty">目前沒有待審核內容。</p>}

            {(queue?.explanations || []).map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>同儕解析</strong><StatusBadge status={item.status} /></div>
                <p>{item.explanationText}</p>
                <small>{item.studentName} · {item.questionPrompt || item.questionId}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('explanation', item.id, 'approve')}>通過</button>
                  <button onClick={() => moderate('explanation', item.id, 'feature')}>精選</button>
                  <button onClick={() => moderate('explanation', item.id, 'return')}>退回</button>
                  <button className="danger" onClick={() => moderate('explanation', item.id, 'hide')}>隱藏</button>
                </div>
              </div>
            ))}

            {(queue?.helpResponses || []).map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>求助回覆</strong><StatusBadge status={item.status} /></div>
                <p>{item.content}</p>
                <small>{item.responderName} · {item.responseType}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('helpResponse', item.id, 'approve')}>通過</button>
                  <button className="danger" onClick={() => moderate('helpResponse', item.id, 'hide')}>隱藏</button>
                </div>
              </div>
            ))}

            {(queue?.studentQuestions || []).map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>學生自創題</strong><StatusBadge status={item.status} /></div>
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
          </div>

          <div className="peer-panel">
            <h4><Trophy size={18} /> 健康協作排行榜</h4>
            <Leaderboard items={analytics?.leaderboard || []} />
            <h4><Lightbulb size={18} /> 熱門互助知識點</h4>
            <div className="peer-chip-list">
              {(analytics?.conceptHotspots || []).map((item) => (
                <span key={item.knowledgePoint}>{item.knowledgePoint}: {(item.helpRequests || 0) + (item.explanations || 0) + (item.studentQuestions || 0)}</span>
              ))}
            </div>
            <h4><BookOpenCheck size={18} /> 學生出題徽章</h4>
            <Leaderboard items={analytics?.badges?.questionDesigners || []} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`peer-learning-hub student-mode ${compact ? 'compact' : ''}`}>
      <div className="peer-hub-header">
        <div>
          <span className="peer-eyebrow"><Sparkles size={16} /> Peer Learning</span>
          <h3>同儕互助學習</h3>
          <p>答題後可以提交解析、提出求助、設計題目或發起健康挑戰；內容會保留審核與安全紀錄。</p>
        </div>
      </div>
      <SafetyNotice />
      {error && <div className="peer-error"><AlertTriangle size={16} /> {error}</div>}

      <div className="peer-student-grid">
        <div className="peer-panel">
          <h4><MessageSquareText size={18} /> 提交同儕解析</h4>
          <textarea value={explanationText} onChange={(event) => setExplanationText(event.target.value)} placeholder="用提示、例子或步驟說明這題的關鍵概念。" />
          <button className="primary-btn" disabled={busy || explanationText.trim().length < 12} onClick={submitExplanation}>送交老師審核</button>
        </div>
        <div className="peer-panel">
          <h4><HelpCircle size={18} /> 我需要幫助</h4>
          <textarea value={helpMessage} onChange={(event) => setHelpMessage(event.target.value)} placeholder="描述你卡住的地方，例如：我不懂為什麼 A 比 B 更合理。" />
          <button className="secondary-gold-outline-btn" disabled={busy || helpMessage.trim().length < 8} onClick={createHelpRequest}>建立求助</button>
        </div>
      </div>

      <div className="peer-student-grid">
        <div className="peer-panel">
          <h4><BookOpenCheck size={18} /> 學生自創題</h4>
          <input value={studentQuestionDraft.prompt} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, prompt: event.target.value })} placeholder="題幹：設計一道能幫同學複習的題目" />
          <input value={studentQuestionDraft.answer} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, answer: event.target.value })} placeholder="正確答案" />
          <textarea value={studentQuestionDraft.explanation} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, explanation: event.target.value })} placeholder="解析：為什麼這個答案是對的？" />
          <div className="peer-form-row">
            <input value={studentQuestionDraft.knowledgePoint} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, knowledgePoint: event.target.value })} placeholder="知識點" />
            <select value={studentQuestionDraft.difficulty} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, difficulty: event.target.value })}>
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </div>
          <textarea value={studentQuestionDraft.creationReason} onChange={(event) => setStudentQuestionDraft({ ...studentQuestionDraft, creationReason: event.target.value })} placeholder="我為什麼設計這題？" />
          <button disabled={busy || studentQuestionDraft.prompt.trim().length < 8 || studentQuestionDraft.answer.trim().length < 1} onClick={submitStudentQuestion}>送交老師審核</button>
        </div>

        <div className="peer-panel">
          <h4><Trophy size={18} /> 同儕挑戰</h4>
          <input value={challengeDraft.opponentStudentId} onChange={(event) => setChallengeDraft({ ...challengeDraft, opponentStudentId: event.target.value })} placeholder="對手學生 ID；留空代表隨機挑戰" />
          <input value={challengeDraft.opponentName} onChange={(event) => setChallengeDraft({ ...challengeDraft, opponentName: event.target.value })} placeholder="對手顯示名稱，可選" />
          <button disabled={busy} onClick={createChallenge}>建立健康挑戰</button>
          {(overview?.challenges || []).slice(0, 4).map((item) => (
            <div className="peer-review-item" key={item.id}>
              <div className="peer-item-top"><strong>{item.mode}</strong><StatusBadge status={item.status} /></div>
              <small>{item.challengerName} vs {item.opponentName}</small>
              <p className="peer-muted">{item.fairnessNote}</p>
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
                  <button onClick={() => completeChallenge(item.id)}>完成挑戰</button>
                </div>
              )}
              {item.status === 'completed' && <p>完成：{Object.values(item.scores || {}).join(' : ')}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="peer-two-column">
        <div className="peer-panel">
          <h4><Star size={18} /> 精選同儕解析</h4>
          {(overview?.explanations || []).length === 0 && <p className="peer-empty">目前沒有這題的同儕解析。</p>}
          {(overview?.explanations || []).map((item) => (
            <div className="peer-review-item" key={item.id}>
              <div className="peer-item-top"><strong>{item.studentName}</strong><StatusBadge status={item.status} /></div>
              <p>{item.explanationText}</p>
              <div className="peer-action-row">
                <button onClick={() => peerLearningApi.voteExplanation(user, item.id, 'helpful').then(loadStudent)}>有幫助 {item.helpfulCount}</button>
                <button onClick={() => peerLearningApi.voteExplanation(user, item.id, 'clear').then(loadStudent)}>清楚 {item.clearCount}</button>
                <button onClick={() => peerLearningApi.report(user, { targetType: 'explanation', targetId: item.id, reason: 'Student report' }).then(loadStudent)}><Flag size={14} /> 檢舉</button>
              </div>
            </div>
          ))}
        </div>

        <div className="peer-panel">
          <h4><HandHeart size={18} /> 互助求救</h4>
          {(overview?.helpRequests || []).length === 0 && <p className="peer-empty">目前沒有這題的求助。</p>}
          {(overview?.helpRequests || []).map((item) => (
            <div className="peer-review-item" key={item.id}>
              <div className="peer-item-top"><strong>{item.studentName}</strong><StatusBadge status={item.status} /></div>
              <p>{item.message}</p>
              {(item.responses || []).map((response) => (
                <div className="peer-help-response" key={response.id}>
                  <small>{response.responderName} · {response.responseType}</small>
                  <p>{response.content}</p>
                  {item.studentId === userId && <button onClick={() => peerLearningApi.markHelpful(user, response.id).then(loadStudent)}>標記有幫助</button>}
                </div>
              ))}
              {item.status !== 'resolved' && (
                <div className="peer-response-composer">
                  <select value={responseTypes[item.id] || 'hint'} onChange={(event) => setResponseTypes({ ...responseTypes, [item.id]: event.target.value })}>
                    {RESPONSE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <textarea value={responseDrafts[item.id] || ''} onChange={(event) => setResponseDrafts({ ...responseDrafts, [item.id]: event.target.value })} placeholder="提供提示或引導問題，不要直接丟答案。" />
                  <button disabled={busy || (responseDrafts[item.id] || '').trim().length < 8} onClick={() => respondToHelp(item.id)}>送出協助</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="peer-panel">
        <h4><Trophy size={18} /> 健康協作排行榜</h4>
        <Leaderboard items={leaderboard?.boards?.teamworkXp || overview?.leaderboard || []} />
      </div>
    </section>
  );
}
