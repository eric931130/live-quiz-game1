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
  const [leaderboard, setLeaderboard] = useState(null);
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
      (queue?.peerChallenges?.length || 0) +
      (queue?.peerReviews?.length || 0) +
      (queue?.wrongExchanges?.length || 0);

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

        <div className="peer-two-column">
          <div className="peer-panel">
            <h4><ShieldCheck size={18} /> Moderation Queue</h4>
            {pendingCount === 0 && <p className="peer-empty">No pending moderation items.</p>}

            {(queue?.explanations || []).map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>Peer explanation</strong><StatusBadge status={item.status} /></div>
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

            {(queue?.helpResponses || []).map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>Help response</strong><StatusBadge status={item.status} /></div>
                <p>{item.content}</p>
                <small>{item.responderName} · {item.responseType}</small>
                <div className="peer-action-row">
                  <button onClick={() => moderate('helpResponse', item.id, 'approve')}>Approve</button>
                  <button className="danger" onClick={() => moderate('helpResponse', item.id, 'hide')}>Hide</button>
                </div>
              </div>
            ))}

            {(queue?.studentQuestions || []).map((item) => (
              <div className="peer-review-item" key={item.id}>
                <div className="peer-item-top"><strong>Student-created question</strong><StatusBadge status={item.status} /></div>
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
          <h3>Structured Peer Learning</h3>
          <p>Submit explanations, ask for help, design questions, challenge classmates, review open answers, exchange wrong questions, and join guild missions.</p>
        </div>
      </div>
      <SafetyNotice />
      {error && <div className="peer-error"><AlertTriangle size={16} /> {error}</div>}

      <div className="peer-student-grid">
        <div className="peer-panel">
          <h4><MessageSquareText size={18} /> Peer Explanation</h4>
          <textarea value={explanationText} onChange={(event) => setExplanationText(event.target.value)} placeholder="Explain the key idea with a hint, example, or steps." />
          <button className="primary-btn" disabled={busy || explanationText.trim().length < 12} onClick={submitExplanation}>Submit for review</button>
        </div>
        <div className="peer-panel">
          <h4><HelpCircle size={18} /> Ask for Help</h4>
          <textarea value={helpMessage} onChange={(event) => setHelpMessage(event.target.value)} placeholder="Describe where you are stuck. Ask for a hint, not just the answer." />
          <button className="secondary-gold-outline-btn" disabled={busy || helpMessage.trim().length < 8} onClick={createHelpRequest}>Create help request</button>
        </div>
      </div>

      <div className="peer-student-grid">
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
      </div>

      <div className="peer-student-grid">
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
            </div>
          ))}
        </div>

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
              {item.status !== 'completed' && (
                <div className="peer-response-composer">
                  <textarea value={wrongExchangeReflections[item.id] || ''} onChange={(event) => setWrongExchangeReflections({ ...wrongExchangeReflections, [item.id]: event.target.value })} placeholder="What did you repair or understand after the exchange?" />
                  <button disabled={(wrongExchangeReflections[item.id] || '').trim().length < 8} onClick={() => completeWrongExchange(item.id)}>Submit reflection</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="peer-two-column">
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
              </div>
            </div>
          ))}
        </div>

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
      </div>

      <div className="peer-two-column">
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
                  {item.studentId === userId && <button onClick={() => peerLearningApi.markHelpful(user, response.id).then(loadStudent)}>Mark helpful</button>}
                </div>
              ))}
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

        <div className="peer-panel">
          <h4><Trophy size={18} /> Healthy Collaboration Leaderboard</h4>
          <Leaderboard items={leaderboard?.boards?.teamworkXp || overview?.leaderboard || []} />
        </div>
      </div>
    </section>
  );
}
