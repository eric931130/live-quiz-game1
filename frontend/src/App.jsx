import React, { Suspense, lazy, useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import ParticleButton from './components/ParticleButton';
import LazyErrorBoundary from './components/LazyErrorBoundary';
import { Globe2, LogOut, BookOpen, Users, Shield, ArrowRight, ArrowLeft, Play, BarChart3, Clock, Zap, Target, BookHeart, GraduationCap, Building2, Palette, BriefcaseBusiness, Code2, Brain, MessageSquareText, Layers3, ClipboardCheck, Sparkles, Compass, Trophy } from 'lucide-react';
import './index.css';

const GMControlPanel = lazy(() => import('./components/GMControlPanel'));
const StudentView = lazy(() => import('./components/StudentView'));
const StudentAchievements = lazy(() => import('./components/StudentAchievements'));
const WorldChallenges = lazy(() => import('./components/WorldChallenges'));
const AuthModal = lazy(() => import('./components/AuthModal'));
const TermsModal = lazy(() => import('./components/TermsModal'));
const StarterSelectionModal = lazy(() => import('./components/StarterSelectionModal'));
const EvolutionAnimation = lazy(() => import('./components/EvolutionAnimation'));

const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001' 
  : 'https://live-quiz-game1.onrender.com';
// Dev-only smoke path; Vite removes this from production unless explicitly enabled in dev.
const E2E_TEACHER_ACCESS = import.meta.env.DEV && import.meta.env.VITE_E2E_TEACHER_ACCESS === 'true';
const E2E_TEACHER_USER = {
  uid: 'e2e-teacher',
  email: 'STAR00000@gmail.com',
  displayName: 'GM Teacher Admin',
  role: 'gm_teacher_admin',
  schoolId: 'e2e-school',
  getIdToken: async () => 'mock-token'
};

function RouteFallback({ label = '載入中...' }) {
  return (
    <div className="route-fallback">
      <div className="route-fallback-mark">用永續知識，做永續之事</div>
      <span>{label}</span>
    </div>
  );
}

const _subjectCategories = [
  { title: '小學基礎素養', level: '國小 1-6 年級', Icon: BookOpen, accent: '#2563eb', items: ['國語閱讀', '基礎數學', '自然觀察', '生活英語', '品格教育', '學習習慣'] },
  { title: '中學升學與素養', level: '國中 / 高中', Icon: Brain, accent: '#7c3aed', items: ['會考複習', '學測分科', '英文文法', '理化生物', '歷史地理', '公民素養'] },
  { title: '大學與研究方法', level: '大專院校', Icon: GraduationCap, accent: '#0f766e', items: ['通識課程', '研究方法', '統計分析', '論文寫作', '專題製作', '跨域學程'] },
  { title: '科技與 AI 應用', level: '數位技能', Icon: Code2, accent: '#0284c7', items: ['程式設計', 'AI 工具', '資料分析', '網頁開發', '資安素養', '雲端服務'] },
  { title: '藝能與創作', level: '美感 / 表演 / 設計', Icon: Palette, accent: '#db2777', items: ['音樂理論', '繪畫設計', '攝影剪輯', '表演藝術', '手作工藝', '作品集'] },
  { title: '職能與專業證照', level: '職場進修', Icon: BriefcaseBusiness, accent: '#ea580c', items: ['行銷企劃', '財務會計', '專案管理', '醫護照護', '餐旅服務', '不動產證照'] },
  { title: '生活知識與興趣', level: '終身學習', Icon: Sparkles, accent: '#ca8a04', items: ['親子教育', '健康飲食', '法律常識', '理財入門', '旅遊文化', '園藝烘焙'] },
  { title: '企業內訓與組織學習', level: '團隊培訓', Icon: Building2, accent: '#475569', items: ['新人訓練', '產品知識', 'SOP 測驗', '資安教育', 'ESG 永續', '管理領導'] }
];

const _platformValues = [
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

const _teachingModes = [
  { title: '即時互動教室', Icon: Zap, text: '適合課堂暖身、複習搶答、講座互動與分組競賽，學生用代碼即可加入。' },
  { title: '課後練習任務', Icon: Target, text: '適合反覆練習、補救教學與自學檢核，老師可設定期限與作答次數。' },
  { title: '正式考核模式', Icon: ClipboardCheck, text: '適合需要登入身分、限制次數、保存成績的評量情境。' },
  { title: '課堂討論整理', Icon: MessageSquareText, text: '老師可保存值得延伸的聊天內容，也能標記移除不需要保留的訊息。' },
  { title: '分類題庫組課', Icon: Layers3, text: '用標準大類與子內容快速分流題目，也能改成自己的課綱、章節或能力指標。' },
  { title: '學習數據追蹤', Icon: BarChart3, text: '從作答紀錄、分數與完成時間掌握學習狀況，讓下一堂課更有依據。' }
];

function App() {
  const [subpage, setSubpage] = useState(null); 
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [termsMode, setTermsMode] = useState(null); // 'terms' | 'disclaimer' | null
  const [guestCode, setGuestCode] = useState('');
  const [initialCode, setInitialCode] = useState('');
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [userRole, setUserRole] = useState(null); // 'gm_teacher_admin' | 'player' | null
  const [announcements, setAnnouncements] = useState([]);
  const [, setPlayerProfile] = useState(null);
  const [, setProfileLoading] = useState(false);
  const [showStarterSelection, setShowStarterSelection] = useState(false);
  const [activeEvolution, setActiveEvolution] = useState(null);

  const loadPlayerProfile = React.useCallback(async () => {
    if (!auth.currentUser || userRole !== 'player') return;
    setProfileLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/player/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setPlayerProfile(data.profile);
        if (!data.profile.selectedCharacterId) {
          setShowStarterSelection(true);
        } else {
          setShowStarterSelection(false);
        }
      }
    } catch (err) {
      console.error("Failed to load player profile:", err);
    } finally {
      setProfileLoading(false);
    }
  }, [userRole]);

  useEffect(() => {
    if (user && userRole === 'player') {
      setTimeout(() => {
        loadPlayerProfile();
      }, 0);
    } else {
      setTimeout(() => {
        setPlayerProfile(null);
        setShowStarterSelection(false);
      }, 0);
    }
  }, [user, userRole, loadPlayerProfile]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const activeUser = currentUser || (E2E_TEACHER_ACCESS ? E2E_TEACHER_USER : null);
      setUser(activeUser);
      if (activeUser) {
        try {
          if (activeUser.uid === 'e2e-teacher') {
            setUserRole('gm_teacher_admin');
          } else {
            // Force token refresh to ensure custom claims are read
            const idTokenResult = await activeUser.getIdTokenResult(true);
            if (idTokenResult.claims.role === 'gm_teacher_admin') {
              setUserRole('gm_teacher_admin');
            } else {
              // Fallback to checking the Users collection
              const userDocRef = doc(db, 'Users', activeUser.uid);
              const userDoc = await getDoc(userDocRef);
              if (userDoc.exists() && userDoc.data().role === 'gm_teacher_admin') {
                setUserRole('gm_teacher_admin');
              } else {
                setUserRole('player');
              }
            }
          }
        } catch (err) {
          console.error("Error verifying user role:", err);
          setUserRole('player');
        }
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync pathname changes
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path) => {
    window.history.pushState(null, '', path);
    setCurrentPath(path);
  };

  const isAdminPath = currentPath === '/gm-control-panel' || currentPath === '/teacher-admin';

  // Automatically prompt auth modal when accessing administrative pages anonymously
  useEffect(() => {
    if (!loading && !user && isAdminPath) {
      setTimeout(() => {
        setShowAuthModal(true);
      }, 0);
    }
  }, [loading, user, isAdminPath]);

  // Load active announcements when authenticated
  useEffect(() => {
    if (user) {
      fetch(`${API_BASE_URL}/api/announcements`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setAnnouncements(data);
          }
        })
        .catch(err => console.error("Error loading announcements:", err));
    }
  }, [user]);

  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && !subpage) {
       setTimeout(() => {
          setInitialCode(code);
          setSubpage('student');
       }, 0);
       window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [loading, user, subpage]);

  const handleLogout = async () => {
    if (E2E_TEACHER_ACCESS) {
      setSubpage(null);
      setUser(E2E_TEACHER_USER);
      setUserRole('gm_teacher_admin');
      navigateTo('/');
      return;
    }
    await signOut(auth);
    setSubpage(null);
    setUserRole(null);
    navigateTo('/');
  };

  const handleGuestSubmit = (e) => {
     e.preventDefault();
     if (!guestCode.trim()) return;
     if (!user) {
        alert("本平台已啟用學員去識別化隱私防護，請先登入或註冊會員以加入挑戰！");
        setInitialCode(guestCode);
        setShowAuthModal(true);
     } else {
        setInitialCode(guestCode);
        setSubpage('student');
     }
  };

  const clearSubpage = () => {
     setSubpage(null);
     setInitialCode('');
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.5rem', color: 'var(--primary-dark)' }}>載入中...</div>;
  }

  if (isAdminPath) {
    if (user && userRole === null) {
      return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.5rem', color: 'var(--primary-dark)' }}>驗證管理權限中...</div>;
    }
    if (user && userRole === 'gm_teacher_admin') {
      return (
        <Suspense fallback={<RouteFallback label="載入管理控制台..." />}>
          <LazyErrorBoundary title="管理控制台載入失敗">
            <GMControlPanel user={user} onGoBack={() => navigateTo('/')} />
          </LazyErrorBoundary>
        </Suspense>
      );
    }
    if (user) {
      alert("權限不足，只有最高管理員可以存取此頁面！");
      setTimeout(() => {
        navigateTo('/');
      }, 0);
      return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.5rem', color: 'var(--primary-dark)' }}>跳轉中...</div>;
    }
  }

  if (subpage === 'student') {
    return (
      <Suspense fallback={<RouteFallback label="載入學生作答頁..." />}>
        <LazyErrorBoundary title="學生作答頁載入失敗">
          <StudentView onGoBack={clearSubpage} currentUser={user} initialCode={initialCode} />
        </LazyErrorBoundary>
      </Suspense>
    );
  }
  if (subpage === 'achievements') {
    return (
      <Suspense fallback={<RouteFallback label="載入個人成就與錯題本..." />}>
        <LazyErrorBoundary title="個人成就頁載入失敗">
          <StudentAchievements 
            currentUser={user} 
            onGoBack={clearSubpage} 
            API_BASE_URL={API_BASE_URL}
            onEvolveTriggered={(data) => setActiveEvolution(data)} 
          />
        </LazyErrorBoundary>
      </Suspense>
    );
  }
  if (subpage === 'world_challenges') {
    return (
      <Suspense fallback={<RouteFallback label="載入關卡挑戰世界..." />}>
        <LazyErrorBoundary title="關卡挑戰頁載入失敗">
          <WorldChallenges 
            currentUser={user} 
            onGoBack={clearSubpage} 
            API_BASE_URL={API_BASE_URL}
            onEvolveTriggered={(data) => setActiveEvolution(data)} 
          />
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
               <Globe2 size={28} color="var(--gold-bright)" /> 用永續知識，做永續之事
            </div>
            <div className="saas-nav-links">
               <a href="#about" className="saas-nav-link" style={{display: window.innerWidth > 768 ? 'block' : 'none'}}>平台理念</a>
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
                <span className="saas-hero-badge">🌍 SDGs & ESG 教育科技創新平台</span>
                <h1 className="saas-hero-title">
                   翻轉傳統教育的<br/><span>永續知識新解方</span>
                </h1>
                <p className="saas-hero-subtitle">
                   本平台專為現代學校機構與企業內訓量身打造，將艱澀的 SDGs（聯合國永續發展目標）與 ESG（企業環境、社會與治理）知識，轉化為具備高度互動性的遊戲化學習體驗。透過即時連線對戰、單人自主考核與強大 AI 題庫解析，讓知識傳遞不再枯燥。
                </p>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                   <button onClick={() => setShowAuthModal(true)} className="saas-btn-solid" style={{ fontSize: '1.2rem', padding: '1rem 2rem' }}>
                      免費建立專屬題庫
                   </button>
                   <a href="#about" className="saas-btn-outline" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', fontSize: '1.2rem', padding: '1rem 2rem' }}>
                      了解平台理念
                   </a>
                </div>
             </div>

             {/* Right side floating card for Game Join */}
             <div className="saas-hero-card">
                <h2 className="title" style={{ marginBottom: '1.5rem' }}>準備好挑戰了嗎？</h2>
                <form onSubmit={handleGuestSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                   <div>
                     <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-main)', fontWeight: 'bold' }}>輸入遊戲代碼：</label>
                     <input 
                       type="text" 
                       placeholder="例如：12345678" 
                       value={guestCode}
                       onChange={(e) => setGuestCode(e.target.value)}
                       required
                       style={{ width: '100%', padding: '1.2rem', borderRadius: '12px', border: '2px solid var(--green-3)', background: 'rgba(255, 255, 255, 0.9)', color: 'var(--text-main)', fontSize: '1.5rem', textAlign: 'center', fontWeight: 'bold', letterSpacing: '2px' }}
                     />
                   </div>
                   <ParticleButton type="submit" className="saas-btn-solid" style={{ width: '100%', fontSize: '1.2rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                     以訪客身分加入 <Play fill="currentColor" size={20} />
                   </ParticleButton>
                </form>
                <div style={{ marginTop: '1.5rem', textAlign: 'center', borderTop: '1px solid rgba(129, 199, 132, 0.2)', paddingTop: '1.5rem' }}>
                   <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1rem' }}>準備進行單人任務考核？</p>
                   <button onClick={() => setShowAuthModal(true)} className="saas-btn-outline" style={{ width: '100%' }}>
                      請先登入會員帳號
                   </button>
                </div>
             </div>
          </header>

          {/* 3. Social Proof */}
          <div className="saas-social-proof">
             <span>專為現代教育與企業內訓設計</span>
             <span style={{color: 'rgba(129, 199, 132, 0.3)'}}>|</span>
             <span>🎯 聯合國 SDGs 指標對接</span>
             <span style={{color: 'rgba(129, 199, 132, 0.3)'}}>|</span>
             <span>🔒 企業級權限防護</span>
             <span style={{color: 'rgba(129, 199, 132, 0.3)'}}>|</span>
             <span>⚡ 即時百人連線</span>
          </div>

          {/* 4. About Us & Mission */}
          <section id="about" className="saas-section">
             <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
                <h2 className="saas-section-title">關於我們與平台理念</h2>
                <p className="saas-section-subtitle">為什麼我們致力於永續教育科技？</p>
                <div style={{ textAlign: 'left', lineHeight: '1.8', color: 'var(--text-muted)', fontSize: '1.1rem', marginTop: '2rem' }}>
                   <p style={{ marginBottom: '1.5rem' }}>
                      在現今全球推動永續發展的大環境下，無論es學術界的「聯合國永續發展目標 (SDGs)」或是企業界的「環境、社會與公司治理 (ESG)」，都已經成為必修的顯學。然而，傳統的單向授課或紙本測驗，往往難以引起學習者的共鳴，甚至讓這些極具意義的知識變得生硬且乏味。
                   </p>
                   <p style={{ marginBottom: '1.5rem' }}>
                      我們團隊深信：<strong>「優質教育（SDG 4）」是驅動其他所有永續目標的核心引擎。</strong> 因此，我們結合了現代化的 Web 系統架構、即時 Socket 連線技術與直覺的雲端數據庫，打造出這款完全免費、高互動性的遊戲化測驗平台。
                   </p>
                   <p>
                      透過本平台，教育工作者只需上傳 Excel 題庫，系統即可自動生成具備微動畫與積分排行榜的「即時對戰」或「單人考核」任務。我們期望透過降低數位教育工具的使用門檻，協助所有推廣永續知識的先行者，能夠用更活潑、更高效的方式，將永續的種子深植於下一代與企業員工的心中。
                   </p>
                </div>
             </div>
          </section>

          {/* 5. Features Grid */}
          <section id="features" className="saas-section">
             <h2 className="saas-section-title">核心功能與教學優勢</h2>
             <p className="saas-section-subtitle">我們不僅僅是一個測驗工具，更是一個完整的學習生態系統。</p>
             
             <div className="saas-features-grid">
                <div className="saas-feature-card">
                   <div className="saas-feature-icon" style={{ background: 'rgba(76, 175, 80, 0.15)', color: 'var(--primary-dark)' }}>
                      <Zap size={32} />
                   </div>
                   <h3 className="saas-feature-title">即時動態對戰系統</h3>
                   <p className="saas-feature-desc">最高 1000 分的動態給分機制設計，系統會依據學生的作答時間與該題的答對人數，進行分數的動態遞減。連續答對更享有累積加成，大幅提升課堂氣氛與學習專注度。支援百人同時在線不卡頓。</p>
                </div>
                
                <div className="saas-feature-card">
                   <div className="saas-feature-icon" style={{ background: 'rgba(76, 175, 80, 0.15)', color: 'var(--primary-dark)' }}>
                      <Target size={32} />
                   </div>
                   <h3 className="saas-feature-title">嚴謹的單人考核模式</h3>
                   <p className="saas-feature-desc">專為課後作業與企業內訓設計的單人任務模式。教師可一鍵派發「練習」或「考核」任務，系統將強制要求學生登入綁定身分，並支援作答次數限制與題目隨機排序，完美防堵作弊，確保測驗公信力。</p>
                </div>
                
                <div className="saas-feature-card">
                   <div className="saas-feature-icon" style={{ background: 'rgba(76, 175, 80, 0.15)', color: 'var(--primary-dark)' }}>
                      <BarChart3 size={32} />
                   </div>
                   <h3 className="saas-feature-title">智慧題庫與數據分析</h3>
                   <p className="saas-feature-desc">支援極簡 Excel 檔案一鍵匯入，系統內建 AI 輔助規則，能自動辨識選擇題、是非題及章節分類。後台提供詳細的數據分析，即時統整所有學生的學習狀況、錯題分佈與作答歷程，精準掌握教學成效。</p>
                </div>
             </div>
          </section>

          {/* 6. Target Audience */}
          <section id="audience" className="saas-section">
             <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <h2 className="saas-section-title">適用對象與應用情境</h2>
                <p className="saas-section-subtitle">無論您身處何種領域，都能找到最適合的使用方式。</p>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginTop: '3rem' }}>
                   <div className="audience-card">
                      <GraduationCap size={40} color="var(--gold-bright)" style={{ marginBottom: '1rem' }} />
                      <h3 style={{ fontSize: '1.4rem', color: 'var(--primary-dark)', marginBottom: '1rem' }}>校園教育工作者</h3>
                      <p style={{ lineHeight: '1.6' }}>
                         對於中學與大專院校教師而言，本平台是翻轉課堂的絕佳利器。您可以在課堂上發起即時團戰，讓原本枯燥的法規與指標成為刺激的競賽；課後則可派發單人考核任務，輕鬆收集形成性評量數據。
                      </p>
                   </div>
                   <div className="audience-card">
                      <Building2 size={40} color="var(--gold-bright)" style={{ marginBottom: '1rem' }} />
                      <h3 style={{ fontSize: '1.4rem', color: 'var(--primary-dark)', marginBottom: '1rem' }}>企業 HR 與培訓部門</h3>
                      <p style={{ lineHeight: '1.6' }}>
                         企業在推行 ESG 與永續轉型時，員工認同是第一步。本平台免去複雜帳號註冊，以代碼快速加入，非常適合企業內訓、新人引導培訓，大幅提升學習完成率。
                      </p>
                   </div>
                   <div className="audience-card">
                      <BookHeart size={40} color="var(--gold-bright)" style={{ marginBottom: '1rem' }} />
                      <h3 style={{ fontSize: '1.4rem', color: 'var(--primary-dark)', marginBottom: '1rem' }}>知識創作者與社群講師</h3>
                      <p style={{ lineHeight: '1.6' }}>
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
             <button onClick={() => setShowAuthModal(true)} className="saas-btn-solid xl-btn">
                立即免費註冊
             </button>
          </div>

          {/* 8. Mega Footer */}
          <footer className="saas-mega-footer">
             <div className="saas-footer-grid">
                <div className="saas-footer-col">
                   <div className="saas-logo" style={{ marginBottom: '1.5rem' }}>
                      <Globe2 size={24} color="var(--gold-bright)" /> 用永續知識，做永續之事
                   </div>
                   <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', maxWidth: '300px' }}>
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
                   <a className="saas-footer-link" onClick={() => setTermsMode('privacy')}>隱私權政策</a>
                   <a className="saas-footer-link" onClick={() => setTermsMode('terms')}>服務條款</a>
                   <a className="saas-footer-link" onClick={() => setTermsMode('disclaimer')}>免責聲明</a>
                   <a className="saas-footer-link" onClick={() => setTermsMode('contact')}>聯絡我們</a>
                </div>
             </div>
             <div className="saas-footer-bottom">
                <span>&copy; {new Date().getFullYear()} 用永續知識，做永續之事。保留所有權利。</span>
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
    <div className="home-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', padding: '2rem' }}>
      
      <div className="app-tool-window large animate-fade-in">
         {/* Tool Window Header */}
         <div className="app-tool-window-header">
            <div className="app-tool-window-header-title">
               <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}>
                  <ArrowLeft size={20} /> 登出並返回首頁
               </button>
               <span style={{ color: 'rgba(31, 107, 58, 0.3)' }}>|</span>
               <span>💡 會員中心 Dashboard (Hi, {user.displayName || (user.email ? user.email.split('@')[0] : '探索者')})</span>
            </div>
            <div className="app-tool-window-controls">
               <span className="app-tool-window-control-dot minimize" />
               <span className="app-tool-window-control-dot maximize" />
               <span className="app-tool-window-control-dot close" onClick={handleLogout} title="登出" />
            </div>
         </div>

         {/* Tool Window Body */}
         <div className="app-tool-window-body" style={{ padding: '3rem 2rem' }}>
            {/* Active Announcements Feed */}
            {announcements.length > 0 && (
              <div className="announcements-panel" style={{
                background: 'rgba(255, 255, 255, 0.7)',
                border: '1px solid rgba(129, 199, 132, 0.3)',
                borderRadius: '16px',
                padding: '1.5rem',
                marginBottom: '2.5rem',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 8px 32px rgba(76, 175, 80, 0.08)',
                textAlign: 'left'
              }}>
                <h3 style={{
                  color: 'var(--primary-dark)',
                  margin: '0 0 1rem 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '1.25rem',
                  fontWeight: 'bold'
                }}>
                  📢 最新公告
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {announcements.map((ann, idx) => (
                    <div key={idx} style={{
                      paddingBottom: idx !== announcements.length - 1 ? '1rem' : '0',
                      borderBottom: idx !== announcements.length - 1 ? '1px solid rgba(129, 199, 132, 0.2)' : 'none'
                    }}>
                      <h4 style={{ color: 'var(--primary-color)', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>
                        {ann.title}
                      </h4>
                      <p style={{ color: 'var(--text-main)', margin: '0', fontSize: '0.95rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                        {ann.content}
                      </p>
                      <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.5rem' }}>
                        發布於：{ann.createdAt ? new Date(ann.createdAt).toLocaleString() : '最近'}
                      </small>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h2 style={{ fontSize: '2.5rem', color: 'var(--primary-color)', marginBottom: '3rem', textAlign: 'center', fontWeight: '800' }}>選擇您的學習模式</h2>
            
            <div className="role-selection" style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <div className="role-card" onClick={() => setSubpage('student')} style={{ flex: '1', minWidth: '280px', maxWidth: '320px', padding: '2.5rem 1.5rem' }}>
                <div className="icon"><Users size={40} /></div>
                <h2 style={{ margin: '1rem 0 0.5rem' }}>參加測驗</h2>
                <p style={{ marginBottom: '1.5rem' }}>輸入代碼，參與即時連線對戰或進行單人考核任務。</p>
                <ParticleButton onClick={() => setSubpage('student')} className="btn primary-btn btn-block" style={{ borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  進入測驗 <ArrowRight size={18} />
                </ParticleButton>
              </div>

              <div className="role-card" onClick={() => setSubpage('world_challenges')} style={{ flex: '1', minWidth: '280px', maxWidth: '320px', padding: '2.5rem 1.5rem' }}>
                 <div className="icon"><Compass size={40} /></div>
                 <h2 style={{ margin: '1rem 0 0.5rem' }}>題庫闖關挑戰</h2>
                 <p style={{ marginBottom: '1.5rem' }}>進入 20 個 SDGs 指標學習世界，以滿分挑戰各個檢查點，解鎖進度！</p>
                 <ParticleButton onClick={() => setSubpage('world_challenges')} className="btn btn-block" style={{ background: 'var(--primary-color)', color: 'white', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                   開始挑戰 <ArrowRight size={18} />
                 </ParticleButton>
               </div>

              <div className="role-card" onClick={() => setSubpage('achievements')} style={{ flex: '1', minWidth: '280px', maxWidth: '320px', padding: '2.5rem 1.5rem' }}>
                 <div className="icon"><Trophy size={40} /></div>
                 <h2 style={{ margin: '1rem 0 0.5rem' }}>個人成就與錯題本</h2>
                 <p style={{ marginBottom: '1.5rem' }}>查看你的徽章、學習進度與錯題紀錄，規劃下一步！</p>
                 <ParticleButton onClick={() => setSubpage('achievements')} className="btn btn-block" style={{ background: 'var(--primary-color)', color: 'white', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                   查看成就 <ArrowRight size={18} />
                 </ParticleButton>
              </div>
              
              {userRole === 'gm_teacher_admin' && (
                <div className="role-card teacher" onClick={() => navigateTo('/gm-control-panel')} style={{ flex: '1', minWidth: '280px', maxWidth: '320px', padding: '2.5rem 1.5rem', border: '1px solid rgba(212, 175, 55, 0.4)', background: 'linear-gradient(135deg, rgba(13, 21, 59, 0.05), rgba(2, 6, 23, 0.15))' }}>
                  <div className="icon" style={{ color: '#d4af37' }}><Shield size={40} /></div>
                  <h2 style={{ margin: '1rem 0 0.5rem', color: '#d4af37' }}>管理控制台 (GM)</h2>
                  <p style={{ marginBottom: '1.5rem' }}>管理題庫、派發關卡、學員進度與系統稽核日誌。</p>
                  <ParticleButton onClick={() => navigateTo('/gm-control-panel')} className="btn btn-block" style={{ background: 'linear-gradient(135deg, #d4af37, #b8860b)', color: '#000', border: 'none', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                    進入後台 <ArrowRight size={18} />
                  </ParticleButton>
                </div>
              )}
            </div>
         </div>

         {/* Window Footer */}
         <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', padding: '1.5rem', borderTop: '1px solid rgba(123, 196, 127, 0.2)', fontSize: '0.9rem' }}>
            <button onClick={() => setTermsMode('terms')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 'bold' }}>
               <Shield size={16} /> 服務條款
            </button>
            <span style={{ color: 'rgba(31, 107, 58, 0.15)' }}>|</span>
            <button onClick={() => setTermsMode('disclaimer')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 'bold' }}>
               <Shield size={16} /> 免責聲明
            </button>
         </div>
      </div>

      {termsMode && <TermsModal mode={termsMode} onClose={() => setTermsMode(null)} />}

      {showStarterSelection && (
        <Suspense fallback={<RouteFallback label="開啟夥伴選擇中..." />}>
          <StarterSelectionModal 
            user={user} 
            API_BASE_URL={API_BASE_URL} 
            onSelectSuccess={() => {
              setShowStarterSelection(false);
              loadPlayerProfile();
            }} 
          />
        </Suspense>
      )}

      {activeEvolution && (
        <Suspense fallback={<RouteFallback label="進化動畫準備中..." />}>
          <EvolutionAnimation 
            evolutionData={activeEvolution} 
            onClose={() => {
              setActiveEvolution(null);
              loadPlayerProfile();
            }} 
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
