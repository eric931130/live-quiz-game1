import React, { Suspense, lazy, useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import ParticleButton from './components/ParticleButton';
import LazyErrorBoundary from './components/LazyErrorBoundary';
import { LogOut, BookOpen, Users, Shield, ArrowRight, Play, BarChart3, Zap, Target, BookHeart, GraduationCap, Building2, Palette, BriefcaseBusiness, Code2, Brain, MessageSquareText, Layers3, ClipboardCheck, Sparkles } from 'lucide-react';
import './index.css';

const TeacherDashboard = lazy(() => import('./components/TeacherDashboard'));
const StudentView = lazy(() => import('./components/StudentView'));
const AuthModal = lazy(() => import('./components/AuthModal'));
const TermsModal = lazy(() => import('./components/TermsModal'));
// Dev-only smoke path; Vite removes this from production unless explicitly enabled in dev.
const E2E_TEACHER_ACCESS = import.meta.env.DEV && import.meta.env.VITE_E2E_TEACHER_ACCESS === 'true';
const E2E_TEACHER_USER = {
  uid: 'e2e-teacher',
  email: 'e2e-teacher@example.test',
  displayName: 'E2E Teacher',
  role: 'teacher',
  schoolId: 'e2e-school',
  getIdToken: async () => null
};

function RouteFallback({ label = '載入中...' }) {
  return (
    <div className="route-fallback">
      <div className="route-fallback-mark">師說新宇</div>
      <span>{label}</span>
    </div>
  );
}

const subjectCategories = [
  { title: '小學基礎素養', level: '國小 1-6 年級', Icon: BookOpen, accent: '#2563eb', items: ['國語閱讀', '基礎數學', '自然觀察', '生活英語', '品格教育', '學習習慣'] },
  { title: '中學升學與素養', level: '國中 / 高中', Icon: Brain, accent: '#7c3aed', items: ['會考複習', '學測分科', '英文文法', '理化生物', '歷史地理', '公民素養'] },
  { title: '大學與研究方法', level: '大專院校', Icon: GraduationCap, accent: '#0f766e', items: ['通識課程', '研究方法', '統計分析', '論文寫作', '專題製作', '跨域學程'] },
  { title: '科技與 AI 應用', level: '數位技能', Icon: Code2, accent: '#0284c7', items: ['程式設計', 'AI 工具', '資料分析', '網頁開發', '資安素養', '雲端服務'] },
  { title: '藝能與創作', level: '美感 / 表演 / 設計', Icon: Palette, accent: '#db2777', items: ['音樂理論', '繪畫設計', '攝影剪輯', '表演藝術', '手作工藝', '作品集'] },
  { title: '職能與專業證照', level: '職場進修', Icon: BriefcaseBusiness, accent: '#ea580c', items: ['行銷企劃', '財務會計', '專案管理', '醫護照護', '餐旅服務', '不動產證照'] },
  { title: '生活知識與興趣', level: '終身學習', Icon: Sparkles, accent: '#ca8a04', items: ['親子教育', '健康飲食', '法律常識', '理財入門', '旅遊文化', '園藝烘焙'] },
  { title: '企業內訓與組織學習', level: '團隊培訓', Icon: Building2, accent: '#475569', items: ['新人訓練', '產品知識', 'SOP 測驗', '資安教育', 'ESG 永續', '管理領導'] }
];

const platformValues = [
  {
    title: '讓老師保有自己的教學語氣',
    text: '平台不預設老師只能教某一種內容。課名、主題、單元名稱、題庫分類都能依照老師的課程設計調整，讓線上工具服務教學，而不是把教學塞進固定模板。'
  },
  {
    title: '讓學生在互動裡理解，而不是只被測驗',
    text: '即時對戰適合提振課堂節奏，單人任務適合課後練習與正式評量，課堂討論則把學生的提問、誤解與靈感留下來，形成下一次教學的線索。'
  },
  {
    title: '讓每次授課都能沉澱成可延伸資產',
    text: '老師可以從一份 Excel 題庫開始，逐步累積課程分類、作答紀錄、討論重點與教學回饋。久而久之，每門課都會長成更清楚、更有生命力的知識庫。'
  }
];

const teachingModes = [
  { title: '即時互動教室', Icon: Zap, text: '適合課堂暖身、複習搶答、講座互動與分組競賽，學生用代碼即可加入。' },
  { title: '課後練習任務', Icon: Target, text: '適合反覆練習、補救教學與自學檢核，老師可設定期限與作答次數。' },
  { title: '正式考核模式', Icon: ClipboardCheck, text: '適合需要登入身分、限制次數、保存成績的評量情境。' },
  { title: '課堂討論整理', Icon: MessageSquareText, text: '老師可保存值得延伸的聊天內容，也能標記移除不需要保留的訊息。' },
  { title: '分類題庫組課', Icon: Layers3, text: '用標準大類與子內容快速分流題目，也能改成自己的課綱、章節或能力指標。' },
  { title: '學習數據追蹤', Icon: BarChart3, text: '從作答紀錄、分數與完成時間掌握學習狀況，讓下一堂課更有依據。' }
];

function App() {
  const [role, setRole] = useState(null); 
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [termsMode, setTermsMode] = useState(null); // 'terms' | 'disclaimer' | null
  const [guestCode, setGuestCode] = useState('');
  const [initialCode, setInitialCode] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser || (E2E_TEACHER_ACCESS ? E2E_TEACHER_USER : null));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (E2E_TEACHER_ACCESS && !role) {
       setRole('teacher');
       return;
    }
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && !role) {
       setInitialCode(code);
       setRole('student');
       window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [loading, user, role]);

  const handleLogout = async () => {
    if (E2E_TEACHER_ACCESS) {
      setRole(null);
      setUser(E2E_TEACHER_USER);
      return;
    }
    await signOut(auth);
    setRole(null);
  };

  const handleTeacherAccess = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    setRole('teacher');

    try {
       if (E2E_TEACHER_ACCESS) return;
       await setDoc(doc(db, 'Users', user.uid), { role: 'teacher', email: user.email }, { merge: true });
    } catch(err) {
       console.error("權限驗證失敗", err);
    }
  };

  const handleGuestSubmit = (e) => {
     e.preventDefault();
     if (!guestCode.trim()) return;
     setInitialCode(guestCode);
     setRole('student');
  };

  const clearRole = () => {
     setRole(null);
     setInitialCode('');
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.5rem', color: 'var(--primary-dark)' }}>載入中...</div>;
  }

  if (role === 'teacher') {
    return (
      <Suspense fallback={<RouteFallback label="載入教師控制台..." />}>
        <LazyErrorBoundary title="教師控制台載入失敗">
          <TeacherDashboard onGoBack={clearRole} user={user} />
        </LazyErrorBoundary>
      </Suspense>
    );
  }
  if (role === 'student') {
    return (
      <Suspense fallback={<RouteFallback label="載入學生作答頁..." />}>
        <LazyErrorBoundary title="學生作答頁載入失敗">
          <StudentView onGoBack={clearRole} currentUser={user} initialCode={initialCode} />
        </LazyErrorBoundary>
      </Suspense>
    );
  }

  // --- SaaS Landing Page (Not Logged In) ---
  if (!user) {
     return (
        <div className="saas-page-shell">
          
          {/* 1. SaaS Navbar */}
          <nav className="saas-nav">
            <div className="saas-logo">
               <GraduationCap size={28} color="var(--primary-color)" /> 師說新宇
            </div>
            <div className="saas-nav-links">
               <a href="#about" className="saas-nav-link" style={{display: window.innerWidth > 768 ? 'block' : 'none'}}>平台理念</a>
               <a href="#categories" className="saas-nav-link" style={{display: window.innerWidth > 768 ? 'block' : 'none'}}>課程分類</a>
               <a href="#features" className="saas-nav-link" style={{display: window.innerWidth > 768 ? 'block' : 'none'}}>核心功能</a>
               <a href="#audience" className="saas-nav-link" style={{display: window.innerWidth > 768 ? 'block' : 'none'}}>適用對象</a>
               <button onClick={() => setShowAuthModal(true)} className="saas-btn-solid">
                  會員登入 / 免費註冊
               </button>
            </div>
          </nav>

          {/* 2. SaaS Hero Section */}
          <header className="saas-hero">
             <div className="saas-hero-bg"></div>
             
             <div className="saas-hero-content">
                <span className="saas-hero-badge">教師知識變現與互動教室平台</span>
                <h1 className="saas-hero-title">
                   師說新宇<br/><span>把一堂課長成一座知識宇宙</span>
                </h1>
                <p className="saas-hero-subtitle">
                   這裡讓老師把專業知識整理成可互動、可追蹤、可反覆練習的線上課堂。從小學基礎、升學科目、大學專題，到藝能創作、企業內訓、證照與生活知識，都能用老師自己的語氣和分類方式被好好教授。
                </p>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                   <button onClick={() => setShowAuthModal(true)} className="saas-btn-solid" style={{ fontSize: '1.2rem', padding: '1rem 2rem' }}>
                      免費建立專屬課程
                   </button>
                   <a href="#about" className="saas-btn-outline" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', fontSize: '1.2rem', padding: '1rem 2rem' }}>
                      了解平台理念
                   </a>
                </div>
                <div className="saas-hero-metrics">
                  <div><strong>8+</strong><span>大類課程起點</span></div>
                  <div><strong>3</strong><span>評量與互動模式</span></div>
                  <div><strong>1</strong><span>老師專屬知識庫</span></div>
                </div>
             </div>

             {/* Right side floating card for Game Join */}
             <div className="saas-hero-card">
                <div className="hero-card-kicker">Live Classroom</div>
                <h2 style={{ color: 'var(--primary-dark)', marginBottom: '1.5rem', textAlign: 'center', fontWeight: '800' }}>準備進教室了嗎？</h2>
                <form onSubmit={handleGuestSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                   <div>
                     <label style={{ display: 'block', marginBottom: '0.5rem', color: '#555', fontWeight: 'bold' }}>輸入課堂代碼：</label>
                     <input 
                       type="text" 
                       placeholder="例如：12345678" 
                       value={guestCode}
                       onChange={(e) => setGuestCode(e.target.value)}
                       required
                       style={{ width: '100%', padding: '1.2rem', borderRadius: '12px', border: '2px solid #e0e0e0', fontSize: '1.5rem', textAlign: 'center', fontWeight: 'bold', letterSpacing: '2px' }}
                     />
                   </div>
                   <ParticleButton type="submit" className="saas-btn-solid" style={{ width: '100%', fontSize: '1.2rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                     以訪客身分加入課堂 <Play fill="currentColor" size={20} />
                   </ParticleButton>
                </form>
                <div style={{ marginTop: '1.5rem', textAlign: 'center', borderTop: '1px solid #eee', paddingTop: '1.5rem' }}>
                   <p style={{ color: '#888', fontSize: '0.95rem', marginBottom: '1rem' }}>準備進行課後任務或正式考核？</p>
                   <button onClick={() => setShowAuthModal(true)} className="saas-btn-outline" style={{ width: '100%' }}>
                      請先登入會員帳號
                   </button>
                </div>
                <div className="hero-classroom-preview">
                  <div>
                    <span>本週課堂</span>
                    <strong>英文時態複習</strong>
                  </div>
                  <div>
                    <span>待整理討論</span>
                    <strong>12 則</strong>
                  </div>
                  <div>
                    <span>練習完成率</span>
                    <strong>86%</strong>
                  </div>
                </div>
             </div>
          </header>

          {/* 3. Social Proof */}
          <div className="saas-social-proof">
             <span>專為老師授課與學生互動設計</span>
             <span style={{color: '#ddd'}}>|</span>
             <span>小學到大學、學科到專業知識皆可建立</span>
             <span style={{color: '#ddd'}}>|</span>
             <span>題庫、任務、討論與成績整合</span>
             <span style={{color: '#ddd'}}>|</span>
             <span>⚡ 即時百人連線</span>
          </div>

          {/* 4. About Us & Mission */}
          <section id="about" className="saas-section" style={{ background: '#fff' }}>
             <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
                <h2 className="saas-section-title">關於師說新宇</h2>
                <p className="saas-section-subtitle">讓老師的知識，有一個能被看見、被練習、被討論、被延伸的教學宇宙。</p>
                <div className="saas-belief-panel">
                   <p style={{ marginBottom: '1.5rem' }}>
                      「師說新宇」相信，好的教學不只是把答案傳出去，而是讓學生在一次次提問、練習、犯錯和修正裡，慢慢看見知識的結構。每位老師都有自己的解題方式、比喻、節奏與價值觀，這些才是一門課真正珍貴的地方。
                   </p>
                   <p style={{ marginBottom: '1.5rem' }}>
                      因此平台不把老師限制在單一科目或單一模式裡。你可以教小學生乘法，也可以教高中生作文、大學生研究方法、上班族簡報、創作者攝影剪輯、銀髮族手機使用，甚至是任何你擅長、願意整理並傳授的專業知識。
                   </p>
                   <p>
                      從一份 Excel 題庫開始，老師可以逐步建立課程分類、互動測驗、課後任務、正式考核與討論紀錄。每次授課都不只是一次活動，而是替下一次教學留下更清楚的材料。
                   </p>
                </div>
                <div className="saas-values-grid">
                  {platformValues.map(value => (
                    <div className="saas-value-card" key={value.title}>
                      <h3>{value.title}</h3>
                      <p>{value.text}</p>
                    </div>
                  ))}
                </div>
             </div>
          </section>

          <section id="categories" className="saas-section" style={{ background: '#f7fbff' }}>
             <h2 className="saas-section-title">多元課程大類</h2>
             <p className="saas-section-subtitle">從正規學科到興趣、藝能、職場與專業知識，都能先用標準分類起步，再改成老師自己的課綱。</p>
             <div className="subject-category-grid">
                {subjectCategories.map(category => (
                  <div className="subject-category-card" key={category.title} style={{ '--category-accent': category.accent }}>
                    <div className="subject-category-head">
                      <category.Icon size={26} />
                      <div>
                        <h3>{category.title}</h3>
                        <span>{category.level}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                      {category.items.map(item => (
                        <span key={item} className="category-chip">{item}</span>
                      ))}
                    </div>
                  </div>
                ))}
             </div>
          </section>

          {/* 5. Features Grid */}
          <section id="features" className="saas-section" style={{ background: '#f0fdf4' }}>
             <h2 className="saas-section-title">核心功能與教學優勢</h2>
             <p className="saas-section-subtitle">不只是測驗工具，而是一套能支援備課、授課、討論、評量與追蹤的教學工作台。</p>
             
             <div className="saas-features-grid">
                {teachingModes.map(mode => (
                  <div className="saas-feature-card" key={mode.title}>
                    <div className="saas-feature-icon">
                      <mode.Icon size={30} />
                    </div>
                    <h3 className="saas-feature-title">{mode.title}</h3>
                    <p className="saas-feature-desc">{mode.text}</p>
                  </div>
                ))}
             </div>
          </section>

          {/* 6. Target Audience */}
          <section id="audience" className="saas-section" style={{ background: '#fff' }}>
             <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <h2 className="saas-section-title">適用對象與應用情境</h2>
                <p className="saas-section-subtitle">無論是學校老師、補教講師、企業內訓、技能教練或知識創作者，都能把專長變成可互動的學習歷程。</p>
                
                <div className="audience-grid">
                   <div className="audience-card">
                      <GraduationCap size={40} color="#1565c0" style={{ marginBottom: '1rem' }} />
                      <h3>校園教育工作者</h3>
                      <p style={{ color: '#666', lineHeight: '1.6' }}>
                         小學、國中、高中與大學課程都能建立自己的題庫與單元。老師可以把課堂練習、段考複習、專題討論與形成性評量放在同一個教學流程裡。
                      </p>
                   </div>
                   <div className="audience-card">
                      <Palette size={40} color="#db2777" style={{ marginBottom: '1rem' }} />
                      <h3>藝能與技能教練</h3>
                      <p style={{ color: '#666', lineHeight: '1.6' }}>
                         音樂、繪畫、設計、舞蹈、攝影、烘焙與手作課程，也能用小測驗確認觀念、用討論保存作品回饋，讓技能學習不只靠感覺。
                      </p>
                   </div>
                   <div className="audience-card">
                      <Building2 size={40} color="#2e7d32" style={{ marginBottom: '1rem' }} />
                      <h3>企業 HR 與內訓部門</h3>
                      <p style={{ color: '#666', lineHeight: '1.6' }}>
                         企業可將新人訓練、產品知識、制度規範、資安測驗或 ESG 課程變成可追蹤的內訓任務。匿名快問快答適合暖場，登入考核則適合正式追蹤成果。
                      </p>
                   </div>
                   <div className="audience-card">
                      <BookHeart size={40} color="#ef6c00" style={{ marginBottom: '1rem' }} />
                      <h3>知識創作者與社群講師</h3>
                      <p style={{ color: '#666', lineHeight: '1.6' }}>
                         社群講師、工作坊主持人與知識型創作者，可以將專長整理成課程單元，用代碼讓學員快速加入互動，並把現場討論沉澱成可複用的教學內容。
                      </p>
                   </div>
                </div>
             </div>
          </section>

          {/* 7. Final CTA */}
          <div className="saas-cta">
             <h2>準備好改變您的教學方式了嗎？</h2>
             <p>立即建立第一門課，讓你的知識被更多真正想學習的人遇見。</p>
             <button onClick={() => setShowAuthModal(true)} style={{ background: 'white', color: 'var(--primary-dark)', border: 'none', padding: '1.2rem 3rem', borderRadius: '50px', fontSize: '1.3rem', fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}>
                立即免費註冊
             </button>
          </div>

          {/* 8. Mega Footer */}
          <footer className="saas-mega-footer">
             <div className="saas-footer-grid">
                <div className="saas-footer-col">
                   <div className="saas-logo" style={{ marginBottom: '1.5rem' }}>
                      <GraduationCap size={24} color="var(--primary-color)" /> 師說新宇
                   </div>
                   <p style={{ color: '#777', lineHeight: '1.6', maxWidth: '300px' }}>
                      我們致力於讓老師用更低門檻建立互動課程，讓學生在測驗、討論與回饋中真正吸收知識。
                   </p>
                </div>
                <div className="saas-footer-col">
                   <h3>平台資訊</h3>
                   <a href="#about" className="saas-footer-link">關於我們</a>
                   <a href="#features" className="saas-footer-link">核心功能</a>
                   <a href="#audience" className="saas-footer-link">適用對象</a>
                </div>
                <div className="saas-footer-col">
                   <h3>法律與支援</h3>
                   <a className="saas-footer-link" onClick={() => setTermsMode('privacy')}>隱私權政策 (Privacy)</a>
                   <a className="saas-footer-link" onClick={() => setTermsMode('terms')}>服務條款 (Terms)</a>
                   <a className="saas-footer-link" onClick={() => setTermsMode('disclaimer')}>免責聲明 (Disclaimer)</a>
                   <a className="saas-footer-link" onClick={() => setTermsMode('contact')}>聯絡我們 (Contact)</a>
                </div>
             </div>
             <div className="saas-footer-bottom">
                <span>&copy; {new Date().getFullYear()} 師說新宇. All rights reserved.</span>
                <span>系統版本 v2.1.0</span>
             </div>
          </footer>

          <Suspense fallback={<RouteFallback label="載入視窗..." />}>
            <LazyErrorBoundary title="視窗載入失敗">
              {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onSuccess={() => setShowAuthModal(false)} />}
              {termsMode && <TermsModal mode={termsMode} onClose={() => setTermsMode(null)} />}
            </LazyErrorBoundary>
          </Suspense>
        </div>
     );
  }

  // --- Dashboard Page (Logged In) ---
  return (
    <div className="home-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-color)' }}>
      <nav style={{ padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--primary-dark)' }}>
           <GraduationCap size={24} color="var(--primary-color)" /> 師說新宇會員中心
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
           <span style={{ color: '#555', fontWeight: 'bold' }}>Hi, {user.displayName || (user.email ? user.email.split('@')[0] : '匿名用戶')}</span>
           <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#ffebee', color: '#c62828', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              <LogOut size={16} /> 登出
           </button>
        </div>
      </nav>

      <div style={{ flex: 1, padding: '4rem 2rem', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
         <h2 style={{ fontSize: '2.5rem', color: 'var(--primary-dark)', marginBottom: '3rem', textAlign: 'center' }}>選擇您的教學 / 學習模式</h2>
         
         <div className="role-selection" style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <div className="role-card" style={{ background: 'rgba(255,255,255,0.9)', flex: '1', minWidth: '300px', maxWidth: '350px' }}>
            <div className="icon" style={{ background: '#e8f5e9', color: '#2e7d32' }}><Users size={40} /></div>
            <h2 style={{ margin: '1rem 0 0.5rem' }}>參加測驗</h2>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>輸入代碼，參與即時課堂、互動測驗或單人學習任務。</p>
            <ParticleButton onClick={() => setRole('student')} className="btn primary-btn btn-block" style={{ borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              進入測驗 <ArrowRight size={18} />
            </ParticleButton>
          </div>
          
          <div className="role-card teacher" style={{ background: 'rgba(255,255,255,0.9)', flex: '1', minWidth: '300px', maxWidth: '350px', borderTop: '5px solid var(--primary-dark)' }}>
            <div className="icon" style={{ background: '#fff3e0', color: '#ef6c00' }}><BookOpen size={40} /></div>
            <h2 style={{ margin: '1rem 0 0.5rem' }}>教師控制台</h2>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>管理課程題庫、派發任務、發起即時教室與整理課堂討論。</p>
            <ParticleButton onClick={handleTeacherAccess} className="btn btn-block" style={{ background: 'var(--primary-dark)', color: 'white', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              前往後台 <ArrowRight size={18} />
            </ParticleButton>
          </div>
        </div>
      </div>

      <footer style={{ background: '#fff', padding: '2rem', textAlign: 'center', borderTop: '1px solid #eee', color: '#777', fontSize: '0.9rem' }}>
         <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem' }}>
            <button onClick={() => setTermsMode('terms')} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
               <Shield size={16} /> 服務條款
            </button>
            <span style={{ color: '#ddd' }}>|</span>
            <button onClick={() => setTermsMode('disclaimer')} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
               <Shield size={16} /> 免責聲明
            </button>
         </div>
      </footer>

      <Suspense fallback={<RouteFallback label="載入政策內容..." />}>
        <LazyErrorBoundary title="政策內容載入失敗">
          {termsMode && <TermsModal mode={termsMode} onClose={() => setTermsMode(null)} />}
        </LazyErrorBoundary>
      </Suspense>
    </div>
  );
}

export default App;
