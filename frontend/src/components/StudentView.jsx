import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Play, ArrowLeft, Flame, Trophy, CheckCircle2, XCircle, ListChecks, Check, X } from 'lucide-react';
import ParticleButton from './ParticleButton';

const SOCKET_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001' 
  : 'https://live-quiz-game1.onrender.com';

export default function StudentView({ onGoBack }) {
  const [socket, setSocket] = useState(null);
  const [step, setStep] = useState('join'); // join, waiting, playing, feedback, game_over
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  
  // Game State
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [feedback, setFeedback] = useState(null); // { isCorrect, correctOption, points, currentScore, streak }
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [finalReport, setFinalReport] = useState(null);

  // Refs for socket events to avoid stale closures
  const stepRef = React.useRef(step);
  const scoreRef = React.useRef(score);
  const nicknameRef = React.useRef(nickname);

  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { nicknameRef.current = nickname; }, [nickname]);

  useEffect(() => {
    // Check if code is in URL params
    const params = new URLSearchParams(window.location.search);
    if (params.get('code')) {
      setRoomCode(params.get('code'));
    }

    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('joined_room', () => {
      setStep('waiting');
    });

    newSocket.on('new_question_student', (q) => {
      setCurrentQuestion(q);
      setFeedback(null);
      setStep('playing');
      stepRef.current = 'playing';
    });

    newSocket.on('answer_feedback', (data) => {
      setFeedback(data);
      setScore(data.currentScore);
      setStreak(data.streak);
      setStep('feedback'); 
      stepRef.current = 'feedback';
    });
    
    newSocket.on('question_result', (data) => {
      if (stepRef.current === 'playing') {
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
      setStep('game_over');
    });

    newSocket.on('error', (msg) => {
      alert(msg);
    });

    return () => newSocket.close();
  }, []);

  const joinRoom = (e) => {
    e.preventDefault();
    if (!roomCode || !nickname) return;
    socket.emit('join_room_student', { roomId: roomCode, nickname });
  };

  const selectOption = (opt) => {
    socket.emit('submit_answer', { roomId: roomCode, selectedOption: opt });
  };

  if (step === 'join') {
    return (
      <div className="card student-join animate-fade-in glass-panel" style={{ padding: '3rem', borderTop: '5px solid var(--primary-dark)', borderRadius: '24px' }}>
        <h2 className="title" style={{ color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <Play size={28} /> 加入永續測驗！
        </h2>
        <form onSubmit={joinRoom} className="join-form">
          <input 
            type="text" 
            placeholder="請輸入 8 位數代碼" 
            value={roomCode} 
            onChange={e => setRoomCode(e.target.value)} 
            required 
            maxLength={8}
            className="input-field"
            style={{ padding: '1rem', fontSize: '1.2rem', textAlign: 'center' }}
          />
          <input 
            type="text" 
            placeholder="請輸入你的綽號" 
            value={nickname} 
            onChange={e => setNickname(e.target.value)} 
            required 
            maxLength={15}
            className="input-field"
            style={{ padding: '1rem', fontSize: '1.2rem', textAlign: 'center' }}
          />
          <ParticleButton type="submit" className="btn primary-btn btn-block mt-4 xl-btn" style={{ borderRadius: '50px' }}>進入房間</ParticleButton>
        </form>
        <ParticleButton className="btn back-btn mt-4 btn-block" onClick={onGoBack} style={{ borderRadius: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
           <ArrowLeft size={20} /> 返回首頁
        </ParticleButton>
      </div>
    );
  }

  if (step === 'waiting') {
    return (
      <div className="student-waiting animate-fade-in text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-color)' }}>
        <h2 className="title" style={{ color: 'var(--primary-dark)', fontSize: '2.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={36} /> 成功進入房間！
        </h2>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>請確認在大螢幕上看到你的綽號</p>
        <div className="spinner mt-4" style={{ borderColor: 'rgba(46, 125, 50, 0.2)', borderTopColor: '#2E7D32' }}></div>
        <p className="mt-4" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>等待小老師開始作答...</p>
      </div>
    );
  }

  const renderTopBar = () => (
    <div className="student-topbar" style={{ background: 'var(--primary-dark)', color: 'white', border: 'none' }}>
      <div className="streak" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Flame size={20} color="#FFD54F" /> 連對: {streak}</div>
      <div className="score" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Trophy size={20} color="#FFD54F" /> 分數: {score}</div>
    </div>
  );

  if (step === 'playing' && currentQuestion) {
    const isTrueFalse = !currentQuestion.options.C && !currentQuestion.options.D;
    const availableOptions = isTrueFalse ? ['A', 'B'] : ['A', 'B', 'C', 'D'];

    return (
      <div className="student-playing">
        {renderTopBar()}
        <h2 className="mobile-question" style={{ color: 'var(--primary-dark)', fontSize: '2rem' }}>{currentQuestion.question}</h2>
        <div className="student-options-grid" style={{
           display: 'grid',
           gridTemplateColumns: isTrueFalse ? '1fr' : '1fr 1fr',
           gridTemplateRows: isTrueFalse ? '1fr 1fr' : '1fr 1fr',
           gap: '1rem',
           padding: '1rem'
        }}>
           {availableOptions.map((opt) => (
             <ParticleButton 
               key={opt} 
               className={`student-btn-opt opt-${opt.toLowerCase()}`}
               onClick={() => selectOption(opt)}
               style={{ borderRadius: '24px', boxShadow: '0 8px 15px rgba(0,0,0,0.1)' }}
             >
               <span className="opt-label" style={{ background: 'rgba(255,255,255,0.4)', color: 'var(--text-main)' }}>{opt}</span>
               <span className="opt-text" style={{ fontSize: isTrueFalse ? '2rem' : '1.2rem' }}>{currentQuestion.options[opt]}</span>
             </ParticleButton>
           ))}
        </div>
      </div>
    );
  }

  if (step === 'feedback' && feedback) {
    const isCorrect = feedback.isCorrect;
    return (
      <div className={`student-feedback flex-center animate-pop-in`} style={{ backgroundColor: isCorrect ? '#4CAF50' : '#E53935' }}>
        {renderTopBar()}
        <div className="feedback-content" style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--text-main)', padding: '3rem', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
          <h1 style={{ color: isCorrect ? '#2E7D32' : '#C62828', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            {isCorrect ? <CheckCircle2 size={48} /> : <XCircle size={48} />} 
            {isCorrect ? '答對了！' : '答錯囉...'}
          </h1>
          <div className="points-display" style={{ background: isCorrect ? '#E8F5E9' : '#FFEBEE', color: isCorrect ? '#2E7D32' : '#C62828', padding: '1rem 3rem' }}>
             {isCorrect ? `+${feedback.points}` : '0'} 分
          </div>
          {!isCorrect && (
             <h3 className="mt-4" style={{ color: '#C62828' }}>正確答案是： {feedback.correctOption}</h3>
          )}
          <p className="mt-4 text-small" style={{ color: '#666', fontWeight: 'bold' }}>請專心等待下一題 ⏳</p>
        </div>
      </div>
    );
  }

  if (step === 'game_over' && finalReport) {
    return (
      <div className="student-game-over animate-fade-in" style={{ background: 'var(--bg-color)' }}>
        <h1 className="title text-center mt-2" style={{ color: '#2E7D32', fontSize: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <Trophy size={40} /> 最終結算單
        </h1>
        <div className="score-summary" style={{ background: 'linear-gradient(135deg, #4CAF50, #2E7D32)' }}>
          <h2 style={{ fontSize: '2rem' }}>總成績： {finalReport.score} 分</h2>
        </div>
        <div className="history-list" style={{ boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
          <h3 style={{ color: 'var(--primary-dark)', fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ListChecks size={24} /> 你的作答記錄
          </h3>
          {finalReport.answers.map((ans, i) => (
             <div key={i} className={`history-item ${ans.correct ? 'item-correct' : 'item-wrong'}`} style={{ borderLeftWidth: '8px', alignItems: 'center' }}>
               <div>第 {ans.qIndex + 1} 題：你選了 {ans.selected}</div>
               <div style={{ color: ans.correct ? '#2E7D32' : '#E53935', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  {ans.correct ? <><Check size={16}/>答對</> : <><X size={16}/>答錯</>} ({ans.score}分)
               </div>
             </div>
          ))}
        </div>
        <div className="text-center mt-4 pb-4">
           <ParticleButton className="btn primary-btn xl-btn" onClick={() => window.location.reload()} style={{ borderRadius: '50px' }}>再玩一次</ParticleButton>
        </div>
      </div>
    );
  }

  return <div>系統載入中...</div>;
}
