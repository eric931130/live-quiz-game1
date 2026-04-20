import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

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

  // Refs for socket events to avoid stale closures and prevent reconnecting
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
    });

    newSocket.on('answer_feedback', (data) => {
      setFeedback(data);
      setScore(data.currentScore);
      setStreak(data.streak);
      setStep('feedback'); // show right/wrong immediately
    });
    
    // Also might receive question_result if time runs out before answering
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
      // Find self report
      const myReport = data.players.find(p => p.nickname === nicknameRef.current);
      setFinalReport(myReport);
      setStep('game_over');
    });

    newSocket.on('error', (msg) => {
      alert(msg);
    });

    return () => newSocket.close();
  }, []); // Run only once on mount

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
      <div className="card student-join animate-fade-in">
        <h2 className="title">加入遊戲！</h2>
        <form onSubmit={joinRoom} className="join-form">
          <input 
            type="text" 
            placeholder="請輸入 8 位數代碼" 
            value={roomCode} 
            onChange={e => setRoomCode(e.target.value)} 
            required 
            maxLength={8}
            className="input-field"
          />
          <input 
            type="text" 
            placeholder="請輸入你的綽號" 
            value={nickname} 
            onChange={e => setNickname(e.target.value)} 
            required 
            maxLength={15}
            className="input-field"
          />
          <button type="submit" className="btn primary-btn btn-block mt-2">進入房間</button>
        </form>
        <button className="btn back-btn mt-4" onClick={onGoBack}>返回首頁</button>
      </div>
    );
  }

  if (step === 'waiting') {
    return (
      <div className="student-waiting animate-fade-in text-center">
        <h2 className="title">成功進入房間囉！</h2>
        <p>確認在大螢幕上看到你的綽號</p>
        <div className="spinner mt-4"></div>
        <p className="mt-4">等待老師開始遊戲...</p>
      </div>
    );
  }

  const renderTopBar = () => (
    <div className="student-topbar">
      <div className="streak">連對: {streak} 🔥</div>
      <div className="score">分數: {score}</div>
    </div>
  );

  if (step === 'playing' && currentQuestion) {
    return (
      <div className="student-playing">
        {renderTopBar()}
        <h2 className="mobile-question">{currentQuestion.question}</h2>
        <div className="student-options-grid">
           {['A', 'B', 'C', 'D'].map((opt) => (
             <button 
               key={opt} 
               className={`student-btn-opt opt-${opt.toLowerCase()}`}
               onClick={() => selectOption(opt)}
             >
               <span className="opt-label">{opt}</span>
               <span className="opt-text">{currentQuestion.options[opt]}</span>
             </button>
           ))}
        </div>
      </div>
    );
  }

  if (step === 'feedback' && feedback) {
    const isCorrect = feedback.isCorrect;
    return (
      <div className={`student-feedback flex-center animate-pop-in ${isCorrect ? 'bg-correct' : 'bg-incorrect'}`}>
        {renderTopBar()}
        <div className="feedback-content">
          <h1>{isCorrect ? '答對了！' : '答錯囉...'}</h1>
          <div className="points-display">
             {isCorrect ? `+${feedback.points}` : '0'}
          </div>
          {!isCorrect && (
             <h3 className="mt-4">正確答案是： {feedback.correctOption}</h3>
          )}
          <p className="mt-4 text-small">正在等待其他同學回答...</p>
        </div>
      </div>
    );
  }

  if (step === 'game_over' && finalReport) {
    return (
      <div className="student-game-over bg-dark animate-fade-in">
        <h1 className="title text-center mt-2">最終結算單</h1>
        <div className="score-summary">
          <h2>獲得總分： {finalReport.score}</h2>
        </div>
        <div className="history-list">
          <h3>你的作答記錄</h3>
          {finalReport.answers.map((ans, i) => (
             <div key={i} className={`history-item ${ans.correct ? 'item-correct' : 'item-wrong'}`}>
               <div>第 {ans.qIndex + 1} 題：你選了 {ans.selected}</div>
               <div>{ans.correct ? '✔' : '❌'} 獲得分數: {ans.score}</div>
             </div>
          ))}
        </div>
        <div className="text-center mt-4">
           <button className="btn primary-btn" onClick={() => window.location.reload()}>再玩一次</button>
        </div>
      </div>
    );
  }

  return <div>系統載入中...</div>;
}
