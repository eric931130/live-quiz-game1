import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
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

function StatusBadge({ status }) {
  return <span className={`peer-status-badge ${status || 'open'}`}>{status || 'open'}</span>;
}

function SafetyNotice() {
  return (
    <div className="peer-safety-notice">
      <ShieldCheck size={18} />
      <span>同儕學習採結構化回覆並保留老師審核權限。請提供提示、理由與例子，避免嘲笑、公開比較或直接丟答案。</span>
    </div>
  );
}

function Leaderboard({ items = [] }) {
  return (
    <div className="peer-leaderboard">
      {items.length === 0 && <p className="peer-empty">尚未累積同儕互助資料。</p>}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const submitExplanation = async () => {
    setBusy(true);
    setError('');
    try {
      await peerLearningApi.submitExplanation(user, {
        ...payloadContext(),
        explanationText,
        explanationType: 'concept_explanation'
      });
      setExplanationText('');
      await loadStudent();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createHelpRequest = async () => {
    setBusy(true);
    setError('');
    try {
      await peerLearningApi.createHelpRequest(user, {
        ...payloadContext(),
        message: helpMessage
      });
      setHelpMessage('');
      await loadStudent();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const respondToHelp = async (helpRequestId) => {
    const content = responseDrafts[helpRequestId] || '';
    setBusy(true);
    setError('');
    try {
      await peerLearningApi.respondToHelp(user, helpRequestId, {
        content,
        responseType: responseTypes[helpRequestId] || 'hint'
      });
      setResponseDrafts({ ...responseDrafts, [helpRequestId]: '' });
      await loadStudent();
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

  if (mode === 'teacher') {
    const pendingCount = (queue?.explanations?.length || 0) + (queue?.helpRequests?.length || 0) + (queue?.helpResponses?.length || 0);
    return (
      <section className="peer-learning-hub teacher-mode">
        <div className="peer-hub-header">
          <div>
            <span className="peer-eyebrow"><Users size={16} /> Student-to-Student Learning</span>
            <h3>同儕學習審核與分析</h3>
            <p>審核同儕解析、求助回覆與檢舉內容，並用健康指標觀察合作與互助。</p>
          </div>
          <button className="secondary-gold-outline-btn" onClick={load} disabled={busy}>重新整理</button>
        </div>
        <SafetyNotice />
        {error && <div className="peer-error"><AlertTriangle size={16} /> {error}</div>}

        <div className="peer-analytics-grid">
          <div><strong>{analytics?.totals?.peerExplanations || 0}</strong><span>同儕解析</span></div>
          <div><strong>{analytics?.totals?.helpRequests || 0}</strong><span>求助</span></div>
          <div><strong>{analytics?.totals?.resolvedHelpRequests || 0}</strong><span>已解決求助</span></div>
          <div><strong>{pendingCount}</strong><span>待審核項目</span></div>
        </div>

        <div className="peer-two-column">
          <div className="peer-panel">
            <h4><ShieldCheck size={18} /> 老師審核佇列</h4>
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
          </div>

          <div className="peer-panel">
            <h4><Trophy size={18} /> 健康排行榜</h4>
            <Leaderboard items={analytics?.leaderboard || []} />
            <h4><Lightbulb size={18} /> 熱門互助知識點</h4>
            <div className="peer-chip-list">
              {(analytics?.conceptHotspots || []).map((item) => (
                <span key={item.knowledgePoint}>{item.knowledgePoint}: {item.helpRequests + item.explanations}</span>
              ))}
            </div>
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
          <h3>同儕解析與互助</h3>
          <p>把錯題變成合作機會：提交你的解析、提出求助，或用提示幫助同學。</p>
        </div>
      </div>
      <SafetyNotice />
      {error && <div className="peer-error"><AlertTriangle size={16} /> {error}</div>}

      <div className="peer-student-grid">
        <div className="peer-panel">
          <h4><MessageSquareText size={18} /> 提交同儕解析</h4>
          <textarea value={explanationText} onChange={(event) => setExplanationText(event.target.value)} placeholder="用自己的話說明正確概念、常見誤解或一個簡單例子。" />
          <button className="primary-btn" disabled={busy || explanationText.trim().length < 12} onClick={submitExplanation}>送出待老師審核</button>
        </div>
        <div className="peer-panel">
          <h4><HelpCircle size={18} /> 我需要幫助</h4>
          <textarea value={helpMessage} onChange={(event) => setHelpMessage(event.target.value)} placeholder="描述你卡住的地方，例如：我分不清楚 A 與 B 的差異。" />
          <button className="secondary-gold-outline-btn" disabled={busy || helpMessage.trim().length < 8} onClick={createHelpRequest}>建立求助</button>
        </div>
      </div>

      <div className="peer-two-column">
        <div className="peer-panel">
          <h4><Star size={18} /> 班級同儕解析</h4>
          {(overview?.explanations || []).length === 0 && <p className="peer-empty">這題還沒有已通過的同儕解析。</p>}
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
                  {item.studentId === (user?.uid || user?.studentId) && <button onClick={() => peerLearningApi.markHelpful(user, response.id).then(loadStudent)}>標記有幫助</button>}
                </div>
              ))}
              {item.status !== 'resolved' && (
                <div className="peer-response-composer">
                  <select value={responseTypes[item.id] || 'hint'} onChange={(event) => setResponseTypes({ ...responseTypes, [item.id]: event.target.value })}>
                    {RESPONSE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <textarea value={responseDrafts[item.id] || ''} onChange={(event) => setResponseDrafts({ ...responseDrafts, [item.id]: event.target.value })} placeholder="給提示或引導問題，不要只丟答案。" />
                  <button disabled={busy || (responseDrafts[item.id] || '').trim().length < 8} onClick={() => respondToHelp(item.id)}>送出幫助</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="peer-panel">
        <h4><Trophy size={18} /> 多維度健康排行榜</h4>
        <Leaderboard items={leaderboard?.boards?.teamworkXp || overview?.leaderboard || []} />
      </div>
    </section>
  );
}
