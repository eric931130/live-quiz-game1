import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

const SOCKET_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001' 
  : 'https://empath-os-backend.onrender.com';

export default function TeacherDashboard({ onGoBack }) {
  const [socket, setSocket] = useState(null);
  const [step, setStep] = useState('setup'); // setup, waiting, playing, question_result, game_over
  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [limit, setLimit] = useState(10);
  
  // Game state
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [finalReport, setFinalReport] = useState([]);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('room_created', (code) => {
      setRoomCode(code);
      setStep('waiting');
    });

    newSocket.on('player_joined', (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    newSocket.on('new_question', (data) => {
      setCurrentQuestion(data);
      setTimeLeft(data.timeLimit);
      setAnsweredCount(0);
      setStep('playing');
    });

    newSocket.on('tick', (t) => {
      setTimeLeft(t);
    });

    newSocket.on('player_answered_count', (count) => {
      setAnsweredCount(count);
    });

    newSocket.on('question_result', (data) => {
      setCurrentQuestion(prev => ({ ...prev, correctOption: data.correctOption }));
      setLeaderboard(data.leaderboard);
      setStep('question_result');
    });

    newSocket.on('game_over', (data) => {
      setFinalReport(data.players);
      setStep('game_over');
    });

    return () => newSocket.close();
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch(`${SOCKET_URL}/api/upload`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions);
      } else {
        alert('匯入失敗，請確認檔案格式！');
      }
    } catch (err) {
      alert('上傳發生錯誤！');
    }
  };

  const createRoom = () => {
    if (questions.length === 0) return alert('請先上傳包含題目的 Excel 檔案。');
    socket.emit('create_room', { questions, limit });
  };

  const startGame = () => {
    if (players.length === 0) return alert('必須要有至少一位學生加入才能開始遊戲。');
    socket.emit('start_game', roomCode);
  };

  const nextQuestion = () => {
    socket.emit('next_question', roomCode);
  };

  if (step === 'setup') {
    return (
      <div className="card teacher-card animate-fade-in">
        <h2 className="title">開局設定</h2>
        <div className="form-group">
          <label>1. 上傳 Excel 題庫 (必備欄位: Question, OptA, OptB, OptC, OptD, Answer)</label>
          <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} />
          {questions.length > 0 && <span className="success-text">成功載入 {questions.length} 題！</span>}
        </div>
        <div className="form-group">
          <label>2. 選擇本次出題數量</label>
          <select value={limit} onChange={(e)=>setLimit(Number(e.target.value))}>
            <option value={10}>抽出 10 題</option>
            <option value={20}>抽出 20 題</option>
            <option value={30}>抽出 30 題</option>
          </select>
        </div>
        <div className="actions">
          <button className="btn back-btn" onClick={onGoBack}>返回</button>
          <button className="btn primary-btn" onClick={createRoom} disabled={questions.length === 0}>建立房間</button>
        </div>
      </div>
    );
  }

  if (step === 'waiting') {
    const joinUrl = `${window.location.origin}/join?code=${roomCode}`;
    
    return (
      <div className="card teacher-waiting animate-fade-in">
        <h2 className="title">等待玩家加入...</h2>
        <div className="room-info">
          <h3>學生請前往 <span className="highlight-url">網站首頁</span> 並輸入代碼：</h3>
          <div className="room-code">{roomCode}</div>
          <div className="qr-container">
             <QRCodeSVG value={joinUrl} size={150} />
          </div>
        </div>
        
        <div className="players-list">
          <h3>已加入 ({players.length} 人)</h3>
          <div className="player-badges">
            {players.map(p => (
              <div key={p.id} className="player-badge animate-pop">{p.nickname}</div>
            ))}
          </div>
        </div>
        
        <button className="btn primary-btn xl-btn" onClick={startGame}>開始作答！</button>
      </div>
    );
  }

  if (step === 'playing' && currentQuestion) {
    return (
      <div className="teacher-playing animate-fade-in">
        <div className="game-header">
          <div className="question-counter">第 {currentQuestion.qIndex + 1} 題 / 共 {currentQuestion.total} 題</div>
          <div className="timer">{timeLeft}s</div>
        </div>
        
        <h1 className="question-text">{currentQuestion.question}</h1>
        
        <div className="options-grid">
           {['A', 'B', 'C', 'D'].map((opt) => (
             <div key={opt} className={`option-card opt-${opt.toLowerCase()}`}>
               <span className="opt-label">{opt}</span>: {currentQuestion.options[opt]}
             </div>
           ))}
        </div>
        
        <div className="status-bar">
          作答進度: {answeredCount} / {players.length} 人
        </div>
      </div>
    );
  }

  if (step === 'question_result' && currentQuestion) {
    return (
      <div className="teacher-result animate-fade-in">
        <h2>時間到！</h2>
        <h3 className="correct-answer-display">正確解答：{currentQuestion.correctOption}</h3>
        
        <div className="options-grid muted">
           {['A', 'B', 'C', 'D'].map((opt) => (
             <div key={opt} className={`option-card opt-${opt.toLowerCase()} ${currentQuestion.correctOption === opt ? 'is-correct' : 'faded'}`}>
               <span className="opt-label">{opt}</span>: {currentQuestion.options[opt]}
             </div>
           ))}
        </div>
        
        <div className="leaderboard">
          <h2>🏆 前五名英雄榜 🏆</h2>
          {leaderboard.map((player, idx) => (
            <div key={idx} className="leaderboard-item animate-slide-up" style={{ animationDelay: `${idx * 0.1}s` }}>
              <span className="rank">#{idx + 1}</span>
              <span className="nick">{player.nickname}</span>
              <span className="score">{player.score} 分</span>
            </div>
          ))}
        </div>
        <button className="btn primary-btn mt-4" onClick={nextQuestion}>
          {(currentQuestion.qIndex + 1) === currentQuestion.total ? '查看最終總成績' : '前往下一題'}
        </button>
      </div>
    );
  }

  if (step === 'game_over') {
    return (
      <div className="teacher-game-over animate-fade-in">
        <h1 className="title">遊戲結束！總結算</h1>
        <div className="leaderboard final-leaderboard">
          {finalReport.sort((a,b)=>b.score - a.score).map((player, idx) => (
            <div key={idx} className="leaderboard-item">
              <span className="rank">#{idx + 1}</span>
              <span className="nick">{player.nickname}</span>
              <span className="score">{player.score} 分</span>
            </div>
          ))}
        </div>
        <button className="btn primary-btn mt-4" onClick={() => window.location.reload()}>返回首頁</button>
      </div>
    );
  }

  return <div>系統載入中...</div>;
}
