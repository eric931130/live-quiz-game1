import React, { useState, useEffect } from 'react';
import TeacherDashboard from './components/TeacherDashboard';
import StudentView from './components/StudentView';

function App() {
  const [role, setRole] = useState(null); // 'teacher', 'student'

  useEffect(() => {
    // Auto-detect student if code is present in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('code')) {
      setRole('student');
    }
    const path = window.location.pathname;
    if (path.includes('join')) {
      setRole('student');
    }
  }, []);

  if (role === 'teacher') {
    return <TeacherDashboard onGoBack={() => setRole(null)} />;
  }

  if (role === 'student') {
    return <StudentView onGoBack={() => setRole(null)} />;
  }

  return (
    <div className="home-container">
      <div className="hero-section">
        <h1 className="hero-title animate-bounce">永續發展即時問答</h1>
        <p className="hero-subtitle">從遊戲中學習 SDGs 永續目標</p>
      </div>
      
      <div className="role-selection">
        <div className="role-card" onClick={() => setRole('student')}>
          <div className="icon">🎮</div>
          <h2>以學生身分加入</h2>
          <p>輸入代碼開始遊戲</p>
        </div>
        
        <div className="role-card teacher" onClick={() => setRole('teacher')}>
          <div className="icon">👩‍🏫</div>
          <h2>創建遊戲房間</h2>
          <p>老師／出題者請進</p>
        </div>
      </div>
    </div>
  );
}

export default App;
