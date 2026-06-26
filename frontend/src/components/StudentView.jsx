/* eslint-disable react-hooks/preserve-manual-memoization */
import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { Play, ArrowLeft, CheckCircle2, XCircle, Flame, Trophy, ListChecks, Check, X, Globe2 } from 'lucide-react';
import { db } from '../firebase';
import ParticleButton from './ParticleButton';
import PeerLearningHub from './PeerLearningHub';

const SOCKET_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001' 
  : 'https://live-quiz-game1.onrender.com';
const API_BASE = SOCKET_URL;

export default function StudentView({ onGoBack, currentUser, initialCode }) {
  const [socket, setSocket] = useState(null);
  const [step, setStep] = useState('join'); // join, waiting, playing, feedback, game_over
  const [roomCode, setRoomCode] = useState(initialCode || '');
  const [nickname, setNickname] = useState('');
  
  // Game State
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [feedback, setFeedback] = useState(null); // { isCorrect, correctOption, points, currentScore, streak }
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [finalReport, setFinalReport] = useState(null);
  const [showTransformation, setShowTransformation] = useState(false);

  // Assignment Mode State
  const [isAssignmentMode, setIsAssignmentMode] = useState(false);
  const [assignment, setAssignment] = useState(null);
  const [assignmentAttemptsCount, setAssignmentAttemptsCount] = useState(0);
  const [studentId, setStudentId] = useState('');
  const [assignmentQuestions, setAssignmentQuestions] = useState([]);
  const [currentAQuestionIndex, setCurrentAQuestionIndex] = useState(0);
  const [aTimeLeft, setATimeLeft] = useState(60);
  const [aQuestionStartTime, setAQuestionStartTime] = useState(0);
  const aAnswersRef = React.useRef([]);
  const aTimerRef = React.useRef(null);

  // Refs for socket events to avoid stale closures
  const stepRef = React.useRef(step);
  const scoreRef = React.useRef(score);
  const nicknameRef = React.useRef(nickname);
  const hasAnsweredRef = React.useRef(false);

  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { nicknameRef.current = nickname; }, [nickname]);

  const exitStudentView = async () => {
     if (currentUser && currentUser.isAnonymous) {
        try {
           await currentUser.delete();
} catch {
           // ignore
        }
     }
     if (onGoBack) onGoBack();
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setTimeout(() => {
        setRoomCode(code);
      }, 0);
    }

    const newSocket = io(SOCKET_URL);
    setTimeout(() => {
      setSocket(newSocket);
    }, 0);

    newSocket.on('joined_room', () => {
      setStep('waiting');
    });

    newSocket.on('new_question_student', (q) => {
      hasAnsweredRef.current = false;
      setCurrentQuestion(q);
      setFeedback(null);
      setStep('playing');
      stepRef.current = 'playing';
    });

    newSocket.on('answer_feedback', (data) => {
      hasAnsweredRef.current = true;
      setFeedback(data);
      setScore(data.currentScore);
      setStreak(data.streak);
      setStep('feedback'); 
      stepRef.current = 'feedback';
    });
    
    newSocket.on('question_result', (data) => {
      if (!hasAnsweredRef.current && stepRef.current === 'playing') {
        // Did not answer in time
        setFeedback({
          isCorrect: false,
          correctOption: data.correctOption,
          points: 0,
          currentScore: scoreRef.current,
          streak: 0
        });
        setStreak(0);
        setStep('feedback');
      }
    });

    newSocket.on('game_over', (data) => {
      const myReport = data.players.find(p => p.nickname === nicknameRef.current);
      setFinalReport(myReport);
      if (myReport && myReport.score >= 800) {
         setShowTransformation(true);
         setTimeout(() => setShowTransformation(false), 10000); // 10 seconds
      }
      setStep('game_over');
    });

    newSocket.on('error', (msg) => {
      alert(msg);
    });

    return () => newSocket.close();
  }, []);

  // handleAutoJoin removed to allow manual nickname entry

  const joinRoom = async (e) => {
    e.preventDefault();
    if (!roomCode) return;
// Anti-addiction Check
    const todayStr = new Date().toLocaleDateString();
    let dailyPlayData = JSON.parse(localStorage.getItem('dailyPlayData') || '{"date": "", "count": 0}');
    if (dailyPlayData.date !== todayStr) {
       dailyPlayData = { date: todayStr, count: 0 };
    }
    if (dailyPlayData.count >= 5) {
       const proceed = window.confirm(`【防沉迷提醒】\n您今天已經進行了 5 次測驗，為了保護您的視力與維持學習效率，建議您先休息 10-15 分鐘再回來！\n\n確定要繼續參加測驗嗎？`);
       if (!proceed) return;
    }
    dailyPlayData.count += 1;
    localStorage.setItem('dailyPlayData', JSON.stringify(dailyPlayData));
    
    // Check Firestore first for Assignments
    try {
       const q = query(collection(db, "Assignments"), where("code", "==", roomCode));
       const snapshot = await getDocs(q);
       if (!snapshot.empty) {
          const assignDoc = snapshot.docs[0];
          const assignData = { id: assignDoc.id, ...assignDoc.data() };
          
          if (new Date() > new Date(assignData.deadline)) {
             alert('此任務已超過截止時間！');
             return;
          }
          
          if (!currentUser || currentUser.isAnonymous) {
             alert('【單人考核 / 練習模式】限定！\n訪客或單次匿名用戶無法參與單人任務，請先返回首頁註冊或登入會員！');
             exitStudentView();
             return;
          }

          let sid = currentUser.uid;
          setStudentId(sid);
          
          const userNickname = localStorage.getItem('userNickname') || currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : '訪客');
          setNickname(userNickname);
          nicknameRef.current = userNickname;
          
          const resQ = query(collection(db, "AssignmentResults"), where("assignmentId", "==", assignData.id), where("studentId", "==", sid));
          const resSnap = await getDocs(resQ);
          const attempts = resSnap.size;
          
          if (attempts >= assignData.maxAttempts) {
             alert(`你已達到最大作答次數限制 (${assignData.maxAttempts} 次)`);
             return;
          }
          
          setAssignmentAttemptsCount(attempts);
          setAssignment(assignData);
          setIsAssignmentMode(true);
          setStep('assignment_intro');
          return;
       }
    } catch(err) {
       console.error("Firebase query error", err);
    }

    let currentAuthUser = currentUser;
if (!currentAuthUser) {
        alert("請先登入或註冊會員以加入挑戰！");
        exitStudentView();
        return;
    }

    let finalNickname = currentAuthUser.displayName || localStorage.getItem('userNickname') || (currentAuthUser.email ? currentAuthUser.email.split('@')[0] : '探索者');
    if (!finalNickname) finalNickname = "匿名用戶";
    nicknameRef.current = finalNickname;
    setNickname(finalNickname);

    socket.emit('join_room_student', { roomId: roomCode, nickname: finalNickname });
  };

  const selectOption = (opt) => {
    hasAnsweredRef.current = true;
    if (isAssignmentMode) {
      handleAssignmentAnswer(opt, assignmentQuestions, currentAQuestionIndex);
    } else {
      socket.emit('submit_answer', { roomId: roomCode, selectedOption: opt });
    }
  };

  // --- Assignment Specific Logic ---
  const syncAssignmentAnswersToBackend = useCallback(async () => {
     if (!assignment?.questionBankId || !aAnswersRef.current.length) return;
     try {
        const token = currentUser?.getIdToken ? await currentUser.getIdToken() : null;
        await fetch(`${SOCKET_URL}/api/student-answers/bulk`, {
           method: 'POST',
           headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
           },
           body: JSON.stringify({
              studentId,
              studentName: nickname,
              teacherUserId: assignment.teacherUserId || '',
              classId: assignment.id,
              activityId: assignment.activityId || '',
              questionBankId: assignment.questionBankId,
              answers: aAnswersRef.current.map((answer) => ({
                 questionId: answer.questionId,
                 questionBankId: answer.questionBankId || assignment.questionBankId,
                 selectedAnswer: answer.selected,
                 correctAnswer: answer.correctAnswer,
                 isCorrect: answer.correct,
                 timeSpent: answer.timeTaken,
                 score: answer.score,
                 question: {
                    id: answer.questionId,
                    questionBankId: answer.questionBankId || assignment.questionBankId,
                    prompt: answer.prompt,
                    Question: answer.prompt,
                    answer: answer.correctAnswer,
                    Answer: answer.correctAnswer,
                    explanation: answer.explanation,
                    knowledgePoint: answer.knowledgePoint,
                    difficulty: answer.difficulty,
                    options: answer.options
                 }
              }))
           })
        });
     } catch (error) {
        console.warn('同步作答分析失敗', error);
     }
  }, [assignment, studentId, nickname, currentUser]);

  const finishAssignment = useCallback(async () => {
     try {
        await addDoc(collection(db, "AssignmentResults"), {
           assignmentId: assignment.id,
           studentId,
           nickname,
           score: scoreRef.current,
           attempts: assignmentAttemptsCount + 1,
           answers: aAnswersRef.current,
           completedAt: new Date().toISOString()
        });
        await syncAssignmentAnswersToBackend();
        setFinalReport({ score: scoreRef.current, answers: aAnswersRef.current });
        if (scoreRef.current >= 800) {
           setShowTransformation(true);
           setTimeout(() => setShowTransformation(false), 10000); // 10 seconds
        }
        setStep('game_over');
     } catch (e) {
        alert("儲存成績失敗：" + e.message);
     }
  }, [assignment, studentId, nickname, assignmentAttemptsCount, syncAssignmentAnswersToBackend]);

  const handleAssignmentAnswer = useCallback((selectedOption, qs, idx) => {
     if (aTimerRef.current) clearInterval(aTimerRef.current);
     
     const timeTaken = (Date.now() - aQuestionStartTime) / 1000;
     const question = qs[idx];
     const correctOption = String(question.Answer || question.answer).trim().toUpperCase();
     const cleanSelected = selectedOption ? String(selectedOption).trim().toUpperCase() : null;
     const isCorrect = cleanSelected === correctOption;
     
     let points = 0;
     let newStreak = streak;
     let currentScore = scoreRef.current;
     
     if (isCorrect) {
        newStreak += 1;
        const timeRatio = Math.max(0.2, 1 - (timeTaken / 60)); // decay to min 20%
        const base = 100 * timeRatio;
        const streakMultiplier = 1 + (newStreak - 1) * 0.2;
        points = Math.round(base * streakMultiplier);
        currentScore += points;
        setScore(currentScore);
        setStreak(newStreak);
     } else {
        setStreak(0);
     }
     
     aAnswersRef.current.push({
        qIndex: idx,
        questionId: question.id || `${assignment.id}_${idx}`,
        questionBankId: question.questionBankId || assignment.questionBankId || '',
        prompt: question.Question || question.prompt || '',
        selected: cleanSelected || '未作答',
        correctAnswer: correctOption,
        correct: isCorrect,
        score: points,
        timeTaken,
        explanation: question.explanation || '',
        knowledgePoint: question.knowledgePoint || question.Chapter || question.chapter || '',
        difficulty: question.difficulty || '',
        options: question.options || {
          A: question.OptA || '',
          B: question.OptB || '',
          C: question.OptC || '',
          D: question.OptD || ''
        }
     });
     
     setFeedback({ isCorrect, correctOption, points, currentScore, streak: newStreak });
     setStep('assignment_feedback');
  }, [aQuestionStartTime, streak, assignment?.id, assignment?.questionBankId]);

  const loadAssignmentQuestion = useCallback((qs, idx) => {
     if (idx >= qs.length) {
        finishAssignment();
        return;
     }
     const q = qs[idx];
     // Map format to currentQuestion expected format
     setCurrentQuestion({
        question: q.Question,
        options: { A: q.OptA, B: q.OptB, C: q.OptC, D: q.OptD }
     });
     setATimeLeft(60);
     setAQuestionStartTime(Date.now());
     setStep('playing'); // We reuse playing step
     
     if (aTimerRef.current) clearInterval(aTimerRef.current);
     aTimerRef.current = setInterval(() => {
        setATimeLeft(prev => {
           if (prev <= 1) {
              clearInterval(aTimerRef.current);
              handleAssignmentAnswer(null, qs, idx);
              return 0;
           }
           return prev - 1;
        });
     }, 1000);
  }, [finishAssignment, handleAssignmentAnswer]);

  const startAssignment = useCallback(() => {
     let qs = [...assignment.questions];
     if (assignment.mode === 'exam') {
        qs = qs.sort(() => 0.5 - Math.random());
     }
     setAssignmentQuestions(qs);
     setCurrentAQuestionIndex(0);
     setScore(0);
     setStreak(0);
     aAnswersRef.current = [];
     loadAssignmentQuestion(qs, 0);
  }, [assignment, loadAssignmentQuestion]);

  const nextAssignmentQuestion = useCallback(() => {
     const nextIdx = currentAQuestionIndex + 1;
     setCurrentAQuestionIndex(nextIdx);
     loadAssignmentQuestion(assignmentQuestions, nextIdx);
  }, [currentAQuestionIndex, loadAssignmentQuestion, assignmentQuestions]);

  const buildPeerQuestionContext = () => {
     const assignmentQuestion = isAssignmentMode ? assignmentQuestions[currentAQuestionIndex] : null;
     const prompt = assignmentQuestion?.Question || assignmentQuestion?.prompt || currentQuestion?.question || '';
     return {
       questionId: assignmentQuestion?.id || currentQuestion?.questionId || currentQuestion?.qIndex || `${roomCode || assignment?.id || 'live'}_${currentAQuestionIndex}`,
       questionBankId: assignmentQuestion?.questionBankId || assignment?.questionBankId || '',
       activityId: assignment?.activityId || '',
       classId: assignment?.id || roomCode || '',
       prompt,
       question: prompt,
       knowledgePoint: assignmentQuestion?.knowledgePoint || assignmentQuestion?.Chapter || assignmentQuestion?.chapter || '',
       qIndex: currentQuestion?.qIndex
     };
  };

  const peerLearningUser = currentUser || {
    uid: studentId || nickname || 'guest-student',
    displayName: nickname || 'Guest Student',
    role: 'player',
    schoolId: 'default-school'
  };

  const renderPeerLearningPanel = (panelClassId = roomCode) => (
    <PeerLearningHub
      mode="student"
      user={peerLearningUser}
      compact
      classId={panelClassId}
      questionContext={buildPeerQuestionContext()}
    />
  );

  if (step === 'join') {
    return (
      <div className="home-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-color)', padding: '2rem' }}>
        <div className="app-tool-window animate-fade-in">
          <div className="app-tool-window-header">
            <div className="app-tool-window-header-title">
               <button onClick={exitStudentView} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}>
                  <ArrowLeft size={20} /> 返回首頁
               </button>
               <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
               <span>🎮 參加測驗挑戰</span>
            </div>
            <div className="app-tool-window-controls">
               <span className="app-tool-window-control-dot minimize" />
               <span className="app-tool-window-control-dot maximize" />
               <span className="app-tool-window-control-dot close" onClick={exitStudentView} title="返回首頁" />
            </div>
          </div>
          <div className="app-tool-window-body">
            <h2 className="title" style={{ color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
              <Globe2 size={28} /> 加入測驗房間！
            </h2>
            <form onSubmit={joinRoom} className="join-form">
              <input 
                type="text" 
                placeholder="請輸入即時對戰或單人任務代碼" 
                value={roomCode} 
                onChange={e => setRoomCode(e.target.value)} 
                required 
                maxLength={8}
                className="input-field"
                style={{ padding: '1rem', fontSize: '1.2rem', textAlign: 'center' }}
              />
              <ParticleButton type="submit" className="btn primary-btn btn-block mt-4 xl-btn" style={{ borderRadius: '50px' }}>進入房間</ParticleButton>
            </form>
            {currentUser && (
              <p style={{ textAlign: 'center', marginTop: '1.5rem', color: '#cbd5e1' }}>
                 將以 <strong style={{ color: 'var(--primary-color)' }}>{localStorage.getItem('userNickname') || currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : nickname)}</strong> 的身分作答
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'waiting') {
    return (
      <div className="home-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-color)', padding: '2rem' }}>
        <div className="app-tool-window animate-fade-in">
          <div className="app-tool-window-header">
            <div className="app-tool-window-header-title">
               <button onClick={() => {
                  if (socket) {
                     socket.emit('leave_room', { roomId: roomCode, nickname });
                  }
                  setStep('join');
               }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}>
                  <ArrowLeft size={20} /> 離開房間
               </button>
               <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
               <span>⏳ 等待作答開始 (房間: {roomCode})</span>
            </div>
            <div className="app-tool-window-controls">
               <span className="app-tool-window-control-dot minimize" />
               <span className="app-tool-window-control-dot maximize" />
               <span className="app-tool-window-control-dot close" onClick={() => {
                  if (socket) {
                     socket.emit('leave_room', { roomId: roomCode, nickname });
                  }
                  setStep('join');
               }} title="離開" />
            </div>
          </div>
          <div className="app-tool-window-body text-center">
            <h2 className="title" style={{ color: 'var(--primary-color)', fontSize: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
               <Globe2 size={36} /> 成功進入房間！
            </h2>
            <p style={{ fontSize: '1.2rem', color: '#94a3b8' }}>請確認在大螢幕上看到你的綽號</p>
            <div className="spinner mt-4" style={{ borderColor: 'rgba(214, 168, 79, 0.2)', borderTopColor: 'var(--primary-color)', margin: '2rem auto' }}></div>
            <p className="mt-4" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>等待小老師開始作答...</p>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'assignment_intro') {
     return (
       <div className="home-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-color)', padding: '2rem' }}>
         <div className="app-tool-window animate-fade-in">
           <div className="app-tool-window-header">
             <div className="app-tool-window-header-title">
                <button onClick={() => setStep('join')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}>
                   <ArrowLeft size={20} /> 返回
                </button>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
                <span>📝 單人任務詳情</span>
             </div>
             <div className="app-tool-window-controls">
                <span className="app-tool-window-control-dot minimize" />
                <span className="app-tool-window-control-dot maximize" />
                <span className="app-tool-window-control-dot close" onClick={() => setStep('join')} title="關閉" />
             </div>
           </div>
           <div className="app-tool-window-body text-center">
              <h2 style={{ color: 'var(--primary-color)', fontSize: '2.2rem', marginBottom: '1rem' }}>{assignment.title}</h2>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem', textAlign: 'left', fontSize: '1.2rem' }}>
                 <p><strong>作答模式：</strong> {assignment.mode === 'exam' ? '考核 (題目隨機)' : '練習 (可重複挑戰)'}</p>
                 <p><strong>截止時間：</strong> {new Date(assignment.deadline).toLocaleString()}</p>
                 <p><strong>作答限制：</strong> 第 {assignmentAttemptsCount + 1} 次 / 共 {assignment.maxAttempts} 次</p>
                 <p><strong>總題數：</strong> {assignment.questions.length} 題</p>
              </div>
              <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>計時挑戰：單題基本 100 分，答題越快分數越高，連續答對還有額外加成！</p>
              <ParticleButton className="btn primary-btn xl-btn btn-block" onClick={startAssignment} style={{ borderRadius: '50px' }}>
                 準備好了，開始作答！
              </ParticleButton>
           </div>
         </div>
       </div>
     );
  }

  const renderTopBar = () => (
    <div className="student-topbar" style={{ background: 'var(--primary-dark)', color: 'white', border: 'none', display: 'flex', justifyContent: 'space-between', padding: '1rem' }}>
      <div style={{ display: 'flex', gap: '1.5rem' }}>
         <div className="streak" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Flame size={20} color="#FFD54F" /> 連對: {streak}</div>
         <div className="score" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Trophy size={20} color="#FFD54F" /> 分數: {score}</div>
      </div>
      {isAssignmentMode && (
         <div style={{ fontWeight: 'bold' }}>剩餘時間: {aTimeLeft}s</div>
      )}
    </div>
  );

  if (step === 'playing' || step === 'feedback' || step === 'assignment_feedback') {
    const isTrueFalse = currentQuestion && !currentQuestion.options.C && !currentQuestion.options.D;
    const availableOptions = isTrueFalse ? ['A', 'B'] : ['A', 'B', 'C', 'D'];
    
    const quitQuiz = () => {
      if (window.confirm("確定要中途退出本場測驗嗎？您的成績將不會被儲存。")) {
        if (aTimerRef.current) clearInterval(aTimerRef.current);
        if (socket) {
          socket.emit('leave_room', { roomId: roomCode, nickname });
        }
        exitStudentView();
      }
    };

    return (
      <div className="home-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-color)', padding: '2rem' }}>
        <div className="app-tool-window large animate-fade-in">
          <div className="app-tool-window-header">
            <div className="app-tool-window-header-title">
               <button onClick={quitQuiz} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}>
                  <ArrowLeft size={20} /> 退出
               </button>
               <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
               <span>{isAssignmentMode ? `📝 單人任務: ${assignment?.title}` : `👥 即時對戰房間: ${roomCode}`}</span>
            </div>
            <div className="app-tool-window-controls">
               <span className="app-tool-window-control-dot minimize" />
               <span className="app-tool-window-control-dot maximize" />
               <span className="app-tool-window-control-dot close" onClick={quitQuiz} title="退出" />
            </div>
          </div>
          <div className="app-tool-window-body" style={{ padding: 0 }}>
            {renderTopBar()}
            
            {step === 'playing' && currentQuestion && (
              <div className="student-playing" style={{ padding: '2rem' }}>
                <h2 className="mobile-question" style={{ color: 'var(--primary-color)', fontSize: '2rem', textAlign: 'center', margin: '2rem 0' }}>{currentQuestion.question}</h2>
                <div className="student-options-grid" style={{
                   display: 'grid',
                   gridTemplateColumns: isTrueFalse ? '1fr' : '1fr 1fr',
                   gap: '1rem',
                   padding: '1rem'
                 }}>
                   {availableOptions.map((opt) => (
                      <ParticleButton 
                        key={opt} 
                        className={`student-btn-opt opt-${opt.toLowerCase()}`}
                        onClick={() => selectOption(opt)}
                        style={{ borderRadius: '16px', padding: '1.5rem' }}
                      >
                        <span className="opt-label" style={{ background: 'rgba(255,255,255,0.4)', color: 'var(--text-main)' }}>{opt}</span>
                        <span className="opt-text" style={{ fontSize: '1.2rem' }}>{currentQuestion.options[opt]}</span>
                      </ParticleButton>
                   ))}
                </div>
              </div>
            )}

            {step === 'feedback' && feedback && (
              <div className="student-feedback flex-center animate-pop-in" style={{ backgroundColor: feedback.isCorrect ? '#4CAF50' : '#E53935', minHeight: '350px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div className="feedback-content" style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--text-main)', padding: '2.5rem', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', textAlign: 'center', width: '100%', maxWidth: '450px' }}>
                  <h1 style={{ color: feedback.isCorrect ? '#2E7D32' : '#C62828', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', fontSize: '2rem' }}>
                    {feedback.isCorrect ? <CheckCircle2 size={36} /> : <XCircle size={36} />} 
                    {feedback.isCorrect ? '答對了！' : '答錯囉...'}
                  </h1>
                  <div className="points-display" style={{ background: feedback.isCorrect ? '#E8F5E9' : '#FFEBEE', color: feedback.isCorrect ? '#2E7D32' : '#C62828', padding: '0.5rem 2rem', margin: '1rem 0', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                     {feedback.isCorrect ? `+${feedback.points}` : '0'} 分
                  </div>
                  {!feedback.isCorrect && (
                     <h3 className="mt-4" style={{ color: '#C62828', fontSize: '1.2rem' }}>正確答案是： {feedback.correctOption}</h3>
                  )}
                  <p className="mt-4 text-small" style={{ color: '#666', fontWeight: 'bold' }}>請專心等待下一題 ⏳</p>
                </div>
              </div>
            )}

            {step === 'assignment_feedback' && feedback && (
              <div className="student-feedback flex-center animate-pop-in" style={{ backgroundColor: feedback.isCorrect ? '#4CAF50' : '#E53935', minHeight: '350px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div className="feedback-content" style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--text-main)', padding: '2.5rem', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', textAlign: 'center', width: '100%', maxWidth: '450px' }}>
                  <h1 style={{ color: feedback.isCorrect ? '#2E7D32' : '#C62828', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', fontSize: '2rem' }}>
                    {feedback.isCorrect ? <CheckCircle2 size={36} /> : <XCircle size={36} />} 
                    {feedback.isCorrect ? '答對了！' : '答錯囉...'}
                  </h1>
                  <div className="points-display" style={{ background: feedback.isCorrect ? '#E8F5E9' : '#FFEBEE', color: feedback.isCorrect ? '#2E7D32' : '#C62828', padding: '0.5rem 2rem', margin: '1rem 0', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                     {feedback.isCorrect ? `+${feedback.points}` : '0'} 分
                  </div>
                  {!feedback.isCorrect && (
                     <h3 className="mt-4" style={{ color: '#C62828', fontSize: '1.2rem' }}>正確答案是： {feedback.correctOption}</h3>
                  )}
                  <ParticleButton className="btn mt-4 primary-btn btn-block" onClick={nextAssignmentQuestion}>
                     {currentAQuestionIndex + 1 === assignmentQuestions.length ? '查看成績結算' : '下一題'}
                  </ParticleButton>
                </div>
              </div>
            )}
          </div>
        </div>
        {renderPeerLearningPanel(assignment?.id || roomCode)}
      </div>
    );
  }

  if (step === 'game_over' && finalReport) {
    const _wrongAnswers = (finalReport.answers || []).filter((ans) => !ans.correct && ans.prompt);

    if (showTransformation) {
       return (
          <div className="transformation-overlay" style={{
             position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
             background: 'linear-gradient(135deg, #0d1b2a, #1b263b, #415a77)',
             display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
             zIndex: 10000, color: 'white', overflow: 'hidden'
          }}>
             <style>{`
                @keyframes orbit { 0% { transform: rotate(0deg) translateX(100px) rotate(0deg); } 100% { transform: rotate(360deg) translateX(100px) rotate(-360deg); } }
                @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 20px #FFD54F, 0 0 40px #FFD54F; } 50% { box-shadow: 0 0 50px #FFD54F, 0 0 80px #FFD54F; } }
                @keyframes float-up { 0% { transform: translateY(50px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
             `}</style>
             <div style={{ position: 'absolute', width: '200vw', height: '200vw', background: 'radial-gradient(circle, rgba(214, 168, 79, 0.15) 0%, transparent 60%)', animation: 'orbit 20s linear infinite' }}></div>
             
             <div style={{ zIndex: 2, textAlign: 'center', animation: 'float-up 2s ease-out' }}>
                <div style={{ 
                   fontSize: '6rem', margin: '0 auto 2rem', width: '150px', height: '150px', 
                   display: 'flex', alignItems: 'center', justifyContent: 'center', 
                   background: 'linear-gradient(45deg, var(--primary-color), #FF8F00)', 
                   borderRadius: '50%', animation: 'pulse-glow 2s infinite' 
                }}>
                   <Trophy size={80} color="white" />
                </div>
                <h1 style={{ fontSize: '3.5rem', margin: '0 0 1rem', textShadow: '0 0 20px rgba(244, 211, 122, 0.5)', background: '-webkit-linear-gradient(45deg, #FFD54F, var(--primary-color))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                   境界突破！
                </h1>
                <p style={{ fontSize: '1.5rem', color: 'var(--green-2)', letterSpacing: '2px' }}>永續知識的能量正在匯聚...</p>
                <div style={{ marginTop: '3rem', width: '300px', height: '4px', background: 'rgba(255,255,255,0.2)', margin: '3rem auto 0', position: 'relative', overflow: 'hidden', borderRadius: '2px' }}>
                   <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '100%', background: 'linear-gradient(90deg, transparent, var(--primary-color), transparent)', animation: 'orbit 2s linear infinite' }}></div>
                </div>
                <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#78909C' }}>請稍候 10 秒</p>
             </div>
          </div>
       );
    }

    return (
      <div className="home-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-color)', padding: '2rem' }}>
        <div className="app-tool-window large animate-fade-in">
          <div className="app-tool-window-header">
            <div className="app-tool-window-header-title">
               <button onClick={exitStudentView} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}>
                  <ArrowLeft size={20} /> 返回首頁
               </button>
               <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
               <span>🏁 測驗結果結算</span>
            </div>
            <div className="app-tool-window-controls">
               <span className="app-tool-window-control-dot minimize" />
               <span className="app-tool-window-control-dot maximize" />
               <span className="app-tool-window-control-dot close" onClick={exitStudentView} title="返回" />
            </div>
          </div>
          <div className="app-tool-window-body">
            <h1 className="title text-center mt-2" style={{ color: 'var(--primary-color)', fontSize: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <Trophy size={40} /> 最終結算單
            </h1>
            <div className="score-summary" style={{ background: 'linear-gradient(135deg, var(--primary-color), #2E7D32)' }}>
              <h2 style={{ fontSize: '2rem' }}>總成績： {finalReport.score} 分</h2>
            </div>
            <div className="history-list" style={{ boxShadow: 'none', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1.5rem', marginTop: '2rem' }}>
              <h3 style={{ color: 'var(--primary-color)', fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ListChecks size={24} /> 你的作答記錄
              </h3>
              {finalReport.answers.map((ans, i) => (
                 <div key={i} className={`history-item ${ans.correct ? 'item-correct' : 'item-wrong'}`} style={{ borderLeftWidth: '8px', alignItems: 'center', background: ans.correct ? 'rgba(76, 175, 80, 0.1)' : 'rgba(229, 57, 53, 0.1)', padding: '1rem', borderRadius: '4px', margin: '0.5rem 0', display: 'flex', justifyContent: 'space-between' }}>
                   <div>第 {ans.qIndex + 1} 題：你選了 {ans.selected}</div>
                   <div style={{ color: ans.correct ? '#4caf50' : '#f44336', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      {ans.correct ? <><Check size={16}/>答對</> : <><X size={16}/>答錯</>} ({ans.score}分)
                   </div>
                 </div>
              ))}
            </div>
            <div className="text-center mt-4 pb-4">
               <ParticleButton className="btn primary-btn xl-btn" onClick={() => window.location.reload()} style={{ borderRadius: '50px' }}>再玩一次</ParticleButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <div>系統載入中...</div>;
}
