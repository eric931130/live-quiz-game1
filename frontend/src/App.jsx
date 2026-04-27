import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import TeacherDashboard from './components/TeacherDashboard';
import StudentView from './components/StudentView';
import AuthModal from './components/AuthModal';
import TermsModal from './components/TermsModal';
import ParticleButton from './components/ParticleButton';
import { Globe2, LogOut, BookOpen, Users, Shield, ArrowRight } from 'lucide-react';
import './index.css';

function App() {
  const [role, setRole] = useState(null); // 'teacher', 'student'
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get('code')) {
      setRole('student');
    }

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setRole(null);
  };

  const handleTeacherAccess = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    try {
       const userDocRef = doc(db, 'Users', user.uid);
       const userDoc = await getDoc(userDocRef);
       
       if (userDoc.exists() && userDoc.data().role === 'teacher') {
          setRole('teacher');
       } else {
          const pass = prompt('請輸入教師開通密碼以獲取權限：\n(預設測試密碼為 teacher123)');
          if (pass === 'teacher123') {
             await setDoc(userDocRef, { role: 'teacher', email: user.email }, { merge: true });
             alert('教師權限開通成功！');
             setRole('teacher');
          } else if (pass !== null) {
             alert('密碼錯誤，請重新嘗試。');
          }
       }
    } catch(err) {
       console.error("權限驗證失敗", err);
       alert("權限驗證失敗，請稍後再試。");
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.5rem', color: 'var(--primary-dark)' }}>載入中...</div>;
  }

  if (role === 'teacher') {
    return <TeacherDashboard onGoBack={() => setRole(null)} />;
  }

  if (role === 'student') {
    return <StudentView onGoBack={() => setRole(null)} currentUser={user} />;
  }

  return (
    <div className="home-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-color)' }}>
      {/* Navbar */}
      <nav style={{ padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--primary-dark)' }}>
           <Globe2 size={24} color="var(--primary-color)" /> 用永續知識，做永續之事
        </div>
        <div>
           {user ? (
             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: '#555', fontWeight: 'bold' }}>Hi, {user.displayName || user.email.split('@')[0]}</span>
                <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#ffebee', color: '#c62828', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                   <LogOut size={16} /> 登出
                </button>
             </div>
           ) : (
             <button onClick={() => setShowAuthModal(true)} style={{ background: 'var(--primary-color)', color: 'white', border: 'none', padding: '0.5rem 1.5rem', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(76, 175, 80, 0.3)' }}>
                登入 / 註冊
             </button>
           )}
        </div>
      </nav>

      {/* Hero Section */}
      <div className="hero-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4rem 2rem' }}>
        <h1 className="hero-title animate-bounce" style={{ fontSize: '4rem', textShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>用永續知識，做永續之事</h1>
        <p className="hero-subtitle" style={{ fontSize: '1.5rem', maxWidth: '800px', margin: '0 auto 3rem', color: '#555', lineHeight: '1.6' }}>
          透過遊戲化學習，深入了解聯合國永續發展目標 (SDGs) 與企業 ESG 核心價值。<br/>無論是即時課堂互動，或是個人自主學習，都能在這裡找到樂趣！
        </p>
        
        <div className="role-selection" style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          
          {/* Guest / Live Game Portal */}
          <div className="role-card" onClick={() => setRole('student')} style={{ background: 'rgba(255,255,255,0.9)', flex: '1', minWidth: '300px', maxWidth: '350px' }}>
            <div className="icon" style={{ background: '#e8f5e9', color: '#2e7d32' }}><Users size={40} /></div>
            <h2 style={{ margin: '1rem 0 0.5rem' }}>訪客 / 學生入口</h2>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>直接輸入代碼，參與即時連線對戰。<br/>若要進行單人考核，請先登入。</p>
            <ParticleButton className="btn primary-btn btn-block" style={{ borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              進入測驗 <ArrowRight size={18} />
            </ParticleButton>
          </div>
          
          {/* Teacher Portal */}
          <div className="role-card teacher" onClick={handleTeacherAccess} style={{ background: 'rgba(255,255,255,0.9)', flex: '1', minWidth: '300px', maxWidth: '350px', borderTop: '5px solid var(--primary-dark)' }}>
            <div className="icon" style={{ background: '#fff3e0', color: '#ef6c00' }}><BookOpen size={40} /></div>
            <h2 style={{ margin: '1rem 0 0.5rem' }}>教師控制台</h2>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>管理題庫、派發單人任務與發起即時團戰。<br/>(首次進入需驗證教師權限)</p>
            <ParticleButton className="btn btn-block" style={{ background: 'var(--primary-dark)', color: 'white', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              前往後台 <ArrowRight size={18} />
            </ParticleButton>
          </div>
          
        </div>
      </div>

      {/* Footer */}
      <footer style={{ background: '#fff', padding: '2rem', textAlign: 'center', borderTop: '1px solid #eee', color: '#777', fontSize: '0.9rem' }}>
         <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center', gap: '2rem' }}>
            <button onClick={() => setShowTermsModal(true)} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
               <Shield size={16} /> 服務條款與免責聲明
            </button>
            <span style={{ color: '#ccc' }}>|</span>
            <span>&copy; {new Date().getFullYear()} 用永續知識，做永續之事. All rights reserved.</span>
         </div>
         <p style={{ fontSize: '0.8rem', color: '#aaa' }}>本系統為獨立開發專案，開發者保留所有權利並聲明絕對免責。</p>
      </footer>

      {/* Modals */}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onSuccess={() => setShowAuthModal(false)} />}
      {showTermsModal && <TermsModal onClose={() => setShowTermsModal(false)} />}
    </div>
  );
}

export default App;
