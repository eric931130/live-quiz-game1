import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { X, Mail, Lock, User, LogIn } from 'lucide-react';
import ParticleButton from './ParticleButton';

export default function AuthModal({ onClose, onSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState(''); // Only used for registration
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        onSuccess && onSuccess();
      } else {
        if (!nickname.trim()) {
           setError('請輸入綽號');
           setLoading(false);
           return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Save nickname to profile or local storage for quick access
        localStorage.setItem('userNickname', nickname);
        onSuccess && onSuccess();
      }
    } catch (err) {
      console.error(err);
      setError(err.message.includes('auth/invalid-credential') ? '帳號或密碼錯誤' : err.message.includes('auth/email-already-in-use') ? '此信箱已註冊' : '發生錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onSuccess && onSuccess();
    } catch (err) {
      console.error(err);
      setError('Google 登入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
      <div className="modal-content animate-pop-in" style={{ background: '#fff', borderRadius: '24px', padding: '2rem', width: '100%', maxWidth: '400px', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: '#666' }}>
          <X size={24} />
        </button>

        <h2 style={{ textAlign: 'center', color: 'var(--primary-dark)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <LogIn size={28} /> {isLogin ? '會員登入' : '註冊新帳號'}
        </h2>

        {error && <div style={{ background: '#FFEBEE', color: '#C62828', padding: '0.8rem', borderRadius: '8px', marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem', fontWeight: 'bold' }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!isLogin && (
             <div className="input-group" style={{ position: 'relative' }}>
                <User size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
                <input type="text" placeholder="你的專屬綽號" required={!isLogin} value={nickname} onChange={(e) => setNickname(e.target.value)} style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', borderRadius: '12px', border: '1px solid #ddd', fontSize: '1rem' }} />
             </div>
          )}
          <div className="input-group" style={{ position: 'relative' }}>
             <Mail size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
             <input type="email" placeholder="電子郵件" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', borderRadius: '12px', border: '1px solid #ddd', fontSize: '1rem' }} />
          </div>
          <div className="input-group" style={{ position: 'relative' }}>
             <Lock size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
             <input type="password" placeholder="密碼 (至少 6 碼)" required minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', borderRadius: '12px', border: '1px solid #ddd', fontSize: '1rem' }} />
          </div>

          <ParticleButton type="submit" className="btn primary-btn btn-block" disabled={loading} style={{ padding: '1rem', borderRadius: '12px', fontSize: '1.1rem', marginTop: '0.5rem' }}>
            {loading ? '處理中...' : (isLogin ? '登入' : '註冊')}
          </ParticleButton>
        </form>

        <div style={{ margin: '1.5rem 0', display: 'flex', alignItems: 'center', textAlign: 'center', color: '#999' }}>
           <div style={{ flex: 1, borderTop: '1px solid #eee' }}></div>
           <span style={{ padding: '0 1rem', fontSize: '0.9rem' }}>或使用其他方式</span>
           <div style={{ flex: 1, borderTop: '1px solid #eee' }}></div>
        </div>

        <button onClick={handleGoogleLogin} disabled={loading} style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 'bold', color: '#555', transition: 'all 0.3s' }}>
           <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: '20px' }} />
           Google 快速登入
        </button>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.95rem' }}>
           <span style={{ color: '#666' }}>{isLogin ? '還沒有帳號嗎？' : '已經有帳號了？'}</span>
           <button onClick={() => { setIsLogin(!isLogin); setError(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--primary-dark)', fontWeight: 'bold', cursor: 'pointer', marginLeft: '0.5rem' }}>
              {isLogin ? '立即註冊' : '返回登入'}
           </button>
        </div>
      </div>
    </div>
  );
}
