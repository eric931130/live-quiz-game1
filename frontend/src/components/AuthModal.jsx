import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, runTransaction } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { X, Mail, Lock, User, LogIn, Calendar, Smile, ShieldAlert, ArrowLeft, Globe2 } from 'lucide-react';
import ParticleButton from './ParticleButton';

const AVATARS = ['🧑‍🚀', '🦸', '🥷', '🧙', '👽', '🤖', '🦊', '🦉'];
const FREQUENCIES = ['每天 15 分鐘', '每週 3 次', '每週 1 次'];

export default function AuthModal({ onClose, onSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState(''); // Only used for registration
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [playFrequency, setPlayFrequency] = useState(FREQUENCIES[1]);
  const [allowPublicDisplayName, setAllowPublicDisplayName] = useState(false);
  const [consent, setConsent] = useState(false);
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
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email.trim() || !emailRegex.test(email)) {
           setError('請輸入有效的電子郵件格式');
           setLoading(false);
           return;
        }
        if (email.trim().toLowerCase() === 'star00000@gmail.com') {
           setError('該管理員帳號不開放手動註冊。');
           setLoading(false);
           return;
        }
        if (password.length < 6) {
           setError('密碼長度至少需要 6 碼');
           setLoading(false);
           return;
        }
        if (password !== confirmPassword) {
           setError('密碼與確認密碼不符');
           setLoading(false);
           return;
        }
        if (!consent) {
           setError('您必須同意隱私條款才能註冊');
           setLoading(false);
           return;
        }

        let registeredUid = null;
        let useFallback = false;
        try {
          const API_BASE_URL = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001' 
            : 'https://live-quiz-game1.onrender.com';
          const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: email.trim(),
              password,
              nickname: nickname.trim(), // Optional display name
              allowPublicDisplayName,
              avatarType: avatar,
              playFrequency
            })
          });

          const data = await response.json().catch(() => ({}));
          if (response.ok && data.success) {
            registeredUid = data.uid;
          } else if (data.error === 'FIREBASE_NOT_CONFIGURED') {
            useFallback = true;
          } else {
            throw new Error(data.message || data.error || '註冊失敗，請確認資料填寫正確。');
          }
        } catch (fetchErr) {
          console.warn('Backend register failed, falling back to client-side transaction:', fetchErr);
          useFallback = true;
        }

        if (useFallback) {
          const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
          registeredUid = userCredential.user.uid;

          const counterRef = doc(db, 'SystemCounters', 'user_counter');
          const userRef = doc(db, 'Users', registeredUid);

          await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let currentNumber = 0;
            if (counterDoc.exists()) {
              currentNumber = counterDoc.data().currentNumber || 0;
            }
            const nextNumber = currentNumber + 1;
            const anonymizedCode = 'S' + String(nextNumber).padStart(4, '0');

            transaction.set(userRef, {
              id: registeredUid,
              email: email.trim(),
              emailVerified: false,
              anonymizedStudentNumber: nextNumber,
              anonymizedStudentCode: anonymizedCode,
              displayName: nickname.trim(),
              nickname: nickname.trim(),
              allowPublicDisplayName: !!allowPublicDisplayName,
              avatarType: avatar || '🧑‍🚀',
              avatar: avatar || '🧑‍🚀',
              playFrequency: playFrequency || '每週 3 次',
              role: 'player',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });

            transaction.set(counterRef, { currentNumber: nextNumber });
          });
        } else if (registeredUid) {
          await signInWithEmailAndPassword(auth, email, password);
        } else {
          throw new Error('註冊失敗，伺服器未回傳有效帳號。');
        }
        localStorage.setItem('userNickname', nickname.trim() || '去識別化學員');
        localStorage.setItem('userAvatar', avatar);
        onSuccess && onSuccess();
      }
    } catch (err) {
      console.error(err);
      let errorMsg = '發生錯誤，請稍後再試';
      if (err.message.includes('auth/invalid-credential')) {
        errorMsg = '帳號或密碼錯誤';
      } else if (err.message.includes('auth/email-already-in-use') || err.message.includes('email-already-in-use')) {
        errorMsg = '此信箱已註冊，請直接登入或更換信箱';
      } else {
        errorMsg = err.message;
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-tool-window-modal-overlay" onClick={onClose}>
      <div className="app-tool-window-modal animate-pop-in" style={{ width: '100%', maxWidth: '450px', position: 'relative', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
         
         {/* Tool Window Header */}
         <div className="app-tool-window-header">
            <div className="app-tool-window-header-title">
               <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}>
                  <ArrowLeft size={20} /> 返回
               </button>
               <span style={{ color: 'rgba(31, 107, 58, 0.4)' }}>|</span>
               <Globe2 size={20} color="var(--primary-color)" />
               <span>{isLogin ? '會員登入' : '註冊新帳號'}</span>
            </div>
            <div className="app-tool-window-controls">
               <span className="app-tool-window-control-dot minimize" />
               <span className="app-tool-window-control-dot maximize" />
               <span className="app-tool-window-control-dot close" onClick={onClose} title="關閉" />
            </div>
         </div>

         {/* Tool Window Body */}
         <div className="app-tool-window-body" style={{ padding: '2rem' }}>
            {error && (
               <div style={{ background: 'rgba(229, 57, 53, 0.15)', color: '#EF5350', border: '1px solid rgba(229, 57, 53, 0.3)', padding: '0.8rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.9rem', fontWeight: 'bold' }}>
                  {error}
               </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {!isLogin && (
                 <>
                    <div className="input-group" style={{ position: 'relative' }}>
                       <User size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(31, 107, 58, 0.4)' }} />
                       <input type="text" placeholder="顯示名稱 (可選)" value={nickname} onChange={(e) => setNickname(e.target.value)} style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', fontSize: '1rem' }} />
                    </div>
                   
                   <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>
                         <Smile size={16} /> 選擇你的虛擬分身
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                         {AVATARS.map(a => (
                            <button 
                               key={a} type="button" 
                               onClick={() => setAvatar(a)}
                               style={{ fontSize: '1.5rem', padding: '0.5rem', background: avatar === a ? 'var(--green-2)' : 'var(--white-3)', border: avatar === a ? '2px solid var(--green-4)' : '2px solid rgba(123, 196, 127, 0.25)', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', color: 'var(--text-main)' }}
                            >
                               {a}
                            </button>
                         ))}
                      </div>
                   </div>

                   <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>
                         <Calendar size={16} /> 你的學習頻率目標
                      </label>
                      <select value={playFrequency} onChange={e => setPlayFrequency(e.target.value)} style={{ width: '100%', padding: '1rem', fontSize: '1rem', cursor: 'pointer' }}>
                         {FREQUENCIES.map(f => (
                            <option key={f} value={f} style={{ background: 'var(--white-1)', color: 'var(--text-main)' }}>{f}</option>
                         ))}
                      </select>
                   </div>
                 </>
              )}
               <div className="input-group" style={{ position: 'relative' }}>
                  <Mail size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(31, 107, 58, 0.4)' }} />
                  <input type="email" placeholder="電子郵件" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', fontSize: '1rem' }} />
               </div>
               <div className="input-group" style={{ position: 'relative' }}>
                  <Lock size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(31, 107, 58, 0.4)' }} />
                  <input type="password" placeholder="密碼 (至少 6 碼)" required minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', fontSize: '1rem' }} />
               </div>

               {!isLogin && (
                  <>
                     <div className="input-group" style={{ position: 'relative' }}>
                        <Lock size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(31, 107, 58, 0.4)' }} />
                        <input type="password" placeholder="確認密碼" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', fontSize: '1rem' }} />
                     </div>

                     <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                        <input 
                           type="checkbox" 
                           id="allowPublicDisplayName" 
                           checked={allowPublicDisplayName} 
                           onChange={(e) => setAllowPublicDisplayName(e.target.checked)} 
                           style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                        />
                        <label htmlFor="allowPublicDisplayName" style={{ fontSize: '0.9rem', cursor: 'pointer', userSelect: 'none' }}>
                           在公開排行榜上顯示我的真實綽號 (預設為隱藏並顯示去識別化代碼)
                        </label>
                     </div>

                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.8rem', background: 'rgba(234, 247, 236, 0.4)', border: '1px solid rgba(123, 196, 127, 0.25)', borderRadius: '12px', marginTop: '0.5rem' }}>
                         <input 
                            type="checkbox" 
                            id="privacyConsent" 
                            checked={consent} 
                            onChange={(e) => setConsent(e.target.checked)} 
                            style={{ cursor: 'pointer', marginTop: '0.2rem', width: '18px', height: '18px' }}
                         />
                         <label htmlFor="privacyConsent" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', lineHeight: '1.4' }}>
                            <span style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.2rem' }}>
                               <ShieldAlert size={14} style={{ color: 'var(--primary-color)' }} /> 隱私告知同意書 (必填)
                            </span>
                            我了解公開排行榜會使用去識別化學員代碼作為身份顯示。
                         </label>
                      </div>
                  </>
               )}

               <ParticleButton type="submit" className="btn primary-btn btn-block" disabled={loading || (!isLogin && !consent)} style={{ padding: '1rem', borderRadius: '12px', fontSize: '1.1rem', marginTop: '0.5rem' }}>
                 {loading ? '處理中...' : (isLogin ? '登入' : '註冊')}
               </ParticleButton>
            </form>

            <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.95rem' }}>
               <span style={{ color: 'var(--text-main)' }}>{isLogin ? '還沒有帳號嗎？' : '已經有帳號了？'}</span>
               <button onClick={() => { setIsLogin(!isLogin); setError(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', fontWeight: 'bold', cursor: 'pointer', marginLeft: '0.5rem' }}>
                  {isLogin ? '立即註冊' : '返回登入'}
               </button>
            </div>
         </div>
      </div>
    </div>
  );
}
