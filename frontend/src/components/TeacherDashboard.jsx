import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import * as xlsx from 'xlsx';
import { Cloud, UploadCloud, Shuffle, ListChecks, Folder, FileText, CheckCircle, Trophy, BarChart3, Clock, Users, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { db } from '../firebase';
import ParticleButton from './ParticleButton';

const SOCKET_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001' 
  : 'https://live-quiz-game1.onrender.com';

export default function TeacherDashboard({ onGoBack }) {
  const [socket, setSocket] = useState(null);
  const [step, setStep] = useState('setup'); // setup, waiting, playing, question_result, game_over
  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState([]);
  
  // Quiz Bank State
  const [savedBanks, setSavedBanks] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [selectedBankQuestions, setSelectedBankQuestions] = useState([]);
  
  // Dashboard Mode
  const [dashboardMode, setDashboardMode] = useState('live'); // 'live', 'assignment_setup', 'assignment_manage'
  
  // Assignment Setup State
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDeadline, setAssignmentDeadline] = useState('');
  const [assignmentType, setAssignmentType] = useState('practice'); // 'practice' or 'exam'
  const [assignmentMaxAttempts, setAssignmentMaxAttempts] = useState(3);
  const [assignmentLeaderboardDate, setAssignmentLeaderboardDate] = useState('');
  
  // Assignment Management State
  const [assignmentsList, setAssignmentsList] = useState([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
  const [assignmentResults, setAssignmentResults] = useState([]);

  // Setup Tabs & Flow State
  const [setupTab, setSetupTab] = useState('upload'); // 'upload' or 'select'
  const [bankNameForm, setBankNameForm] = useState('');
  const fileInputRef = useRef(null);
  
  // Generation Options
  const [genMode, setGenMode] = useState('random'); // 'random' or 'custom'
  const [randChapter, setRandChapter] = useState('All');
  const [randSection, setRandSection] = useState('All');
  const [numTF, setNumTF] = useState(5);
  const [numMC, setNumMC] = useState(5);
  const [selectedCustomQIdxs, setSelectedCustomQIdxs] = useState(new Set());

  // Available Chapters and Sections for filters
  const [chapters, setChapters] = useState([]);
  const [sections, setSections] = useState({});
  const [expandedChapters, setExpandedChapters] = useState(new Set());
  const [expandedSections, setExpandedSections] = useState(new Set());

  // Game state
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [finalReport, setFinalReport] = useState([]);
  const [distribution, setDistribution] = useState(null);

  useEffect(() => {
    fetchBanksFromFirebase();
    fetchAssignmentsFromFirebase();

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
      setDistribution(null);
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
      setDistribution(data.distribution);
      setStep('question_result');
    });

    newSocket.on('game_over', (data) => {
      setFinalReport(data.players);
      setStep('game_over');
    });

    return () => newSocket.close();
  }, []);

  const fetchBanksFromFirebase = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "QuizBanks"));
      const banks = [];
      querySnapshot.forEach((doc) => {
        banks.push({ id: doc.id, ...doc.data() });
      });
      setSavedBanks(banks);
    } catch (e) {
      console.log('載入歷史題庫失敗', e);
    }
  };

  const fetchAssignmentsFromFirebase = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "Assignments"));
      const assigns = [];
      querySnapshot.forEach((doc) => {
        assigns.push({ id: doc.id, ...doc.data() });
      });
      // Sort by descending created date
      assigns.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      setAssignmentsList(assigns);
    } catch(e) {
      console.log('載入任務失敗', e);
    }
  };

  const loadAssignmentResults = async (assignId) => {
    try {
       const querySnapshot = await getDocs(collection(db, "AssignmentResults"));
       const results = [];
       querySnapshot.forEach(doc => {
          const data = doc.data();
          if (data.assignmentId === assignId) {
             results.push({ id: doc.id, ...data });
          }
       });
       setAssignmentResults(results);
    } catch(e) {
       console.log('載入成績失敗', e);
    }
  };

  const deleteBank = async (bankId) => {
    if (!window.confirm("確定要永久刪除這個題庫嗎？這項操作無法復原。")) return;
    try {
      await deleteDoc(doc(db, "QuizBanks", bankId));
      alert("✅ 題庫已刪除！");
      await fetchBanksFromFirebase();
      if (selectedBankId === bankId) {
         setSelectedBankId('');
         setSelectedBankQuestions([]);
      }
    } catch (e) {
      alert("刪除失敗：" + e.message);
    }
  };

  const loadBank = (bankId) => {
    setSelectedBankId(bankId);
    const bank = savedBanks.find(b => b.id === bankId);
    if (bank && bank.questions) {
      setSelectedBankQuestions(bank.questions);
      
      // Compute distinct chapters & sections
      const chaps = new Set();
      const secs = {};
      bank.questions.forEach((q, idx) => {
        const c = q.Chapter || '未分類';
        const s = q.Section || '未分類';
        q.originalIndex = idx; // Inject original index for Custom Mode
        chaps.add(c);
        if (!secs[c]) secs[c] = new Set();
        secs[c].add(s);
      });
      setChapters(Array.from(chaps));
      
      const parsedSecs = {};
      Object.keys(secs).forEach(k => parsedSecs[k] = Array.from(secs[k]));
      setSections(parsedSecs);
      
      setRandChapter('All');
      setRandSection('All');
      setSelectedCustomQIdxs(new Set());
    } else {
      setSelectedBankQuestions([]);
    }
  };

  const deleteQuestion = async (e, qOriginalIndex) => {
    e.stopPropagation();
    if (!window.confirm("確定要永久刪除這個單一題目嗎？")) return;
    try {
      const bank = savedBanks.find(b => b.id === selectedBankId);
      if (!bank) return;
      
      const newQuestions = bank.questions.filter((_, idx) => idx !== qOriginalIndex);
      
      await updateDoc(doc(db, "QuizBanks", selectedBankId), {
         questions: newQuestions
      });
      
      // Update local state without losing expand states
      const updatedSavedBanks = savedBanks.map(b => b.id === selectedBankId ? { ...b, questions: newQuestions } : b);
      setSavedBanks(updatedSavedBanks);
      
      // Manually trigger reload for UI to apply new indexes
      const chaps = new Set();
      const secs = {};
      const qsWithIdx = newQuestions.map((q, idx) => {
        const cloned = {...q};
        cloned.originalIndex = idx;
        const c = cloned.Chapter || '未分類';
        const s = cloned.Section || '未分類';
        chaps.add(c);
        if (!secs[c]) secs[c] = new Set();
        secs[c].add(s);
        return cloned;
      });
      
      setSelectedBankQuestions(qsWithIdx);
      setChapters(Array.from(chaps));
      const parsedSecs = {};
      Object.keys(secs).forEach(k => parsedSecs[k] = Array.from(secs[k]));
      setSections(parsedSecs);
      
      setSelectedCustomQIdxs(new Set()); // Reset selections to prevent mismatch
    } catch(err) {
      alert("刪除題目失敗：" + err.message);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
       try {
         const data = new Uint8Array(evt.target.result);
         const workbook = xlsx.read(data, { type: 'array' });
         const sheetName = workbook.SheetNames[0];
         const sheet = workbook.Sheets[sheetName];
         const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
         
         let parsedQuestions = [];
         let headerRowIdx = -1;
         let colMap = { q: -1, ans: -1, a: -1, b: -1, c: -1, d: -1, chapter: -1, section: -1 };
         
         for (let i = 0; i < Math.min(rows.length, 20); i++) {
           const row = rows[i];
           if (!row || !Array.isArray(row)) continue;
           let foundQ = -1, foundAns = -1, foundA = -1, foundB = -1, foundC = -1, foundD = -1, foundChapter = -1, foundSection = -1;
           for (let c = 0; c < row.length; c++) {
              const cell = String(row[c]).toLowerCase().replace(/[\*\s]/g, '').trim();
              if (cell.includes('題幹') || cell.includes('題目') || cell.includes('question')) foundQ = c;
              else if (cell === '答案' || cell === '解答' || cell.includes('answer')) foundAns = c;
              else if (cell.includes('選項-a') || cell.includes('選項a') || cell === 'a' || cell === 'opta') foundA = c;
              else if (cell.includes('選項-b') || cell.includes('選項b') || cell === 'b' || cell === 'optb') foundB = c;
              else if (cell.includes('選項-c') || cell.includes('選項c') || cell === 'c' || cell === 'optc') foundC = c;
              else if (cell.includes('選項-d') || cell.includes('選項d') || cell === 'd' || cell === 'optd') foundD = c;
              else if (cell.includes('章') || cell.includes('單元') || cell.includes('主題') || cell.includes('chapter') || cell.includes('unit')) foundChapter = c;
              else if (cell.includes('節') || cell.includes('小節') || cell.includes('section') || cell.includes('part')) foundSection = c;
           }
           if (foundQ !== -1 && foundAns !== -1) {
             headerRowIdx = i;
             colMap = { q: foundQ, ans: foundAns, a: foundA, b: foundB, c: foundC, d: foundD, chapter: foundChapter, section: foundSection };
             break;
           }
         }
         
         if (headerRowIdx === -1) {
            alert('無法辨識題庫格式。請確保至少包含「題目」、「答案」等標題列！');
            return;
         }

         for (let i = headerRowIdx + 1; i < rows.length; i++) {
           const row = rows[i];
           if (!row || row.length === 0) continue;
           const getCellStr = (val) => (val != null ? String(val).trim() : '');
           const qText = getCellStr(row[colMap.q]);
           if (!qText) continue;
           
           const rawAnsStr = getCellStr(row[colMap.ans]);
           const rawAns = rawAnsStr.toUpperCase();
           const cleanAns = rawAns.replace(/[^A-D]/g, ''); 
           let optA = getCellStr(row[colMap.a]);
           let optB = getCellStr(row[colMap.b]);
           let optC = getCellStr(row[colMap.c]);
           let optD = getCellStr(row[colMap.d]);
           const chapter = colMap.chapter !== -1 ? getCellStr(row[colMap.chapter]) || '未分類' : '未分類';
           const section = colMap.section !== -1 ? getCellStr(row[colMap.section]) || '未分類' : '未分類';
           
           const isTFText = (val) => ['O','X','是','否','對','錯','TRUE','FALSE'].includes(val.toUpperCase());
           const isTrueFalse = (!optC && !optD) || (isTFText(optA) && isTFText(optB)) || (!optA && !optB);

           let finalAnswer = cleanAns ? cleanAns[0] : rawAns;
           
           if (isTrueFalse) {
               if (!optA) optA = 'O (是)';
               if (!optB) optB = 'X (否)';
               if (['O', '是', '對', 'TRUE', 'A'].includes(rawAnsStr.toUpperCase())) finalAnswer = 'A';
               else if (['X', '否', '錯', 'FALSE', 'B'].includes(rawAnsStr.toUpperCase())) finalAnswer = 'B';
           }

           if (!cleanAns && rawAnsStr && !isTrueFalse) {
             if (rawAns === optA.toUpperCase()) finalAnswer = 'A';
             else if (rawAns === optB.toUpperCase()) finalAnswer = 'B';
             else if (rawAns === optC.toUpperCase()) finalAnswer = 'C';
             else if (rawAns === optD.toUpperCase()) finalAnswer = 'D';
           }

           parsedQuestions.push({
             Question: qText,
             OptA: optA,
             OptB: optB,
             OptC: optC,
             OptD: optD,
             Answer: finalAnswer,
             Chapter: chapter,
             Section: section,
             Type: isTrueFalse ? 'true_false' : 'multiple_choice'
           });
         }
         
         if (parsedQuestions.length === 0) {
            alert('在此檔案中找不到任何題目內容。');
            return;
         }
         
         const bankName = bankNameForm.trim() || `題庫 ${new Date().toLocaleDateString()}`;
         
         const isDuplicate = savedBanks.some(b => {
             const sameNameAndCount = b.name === bankName && b.questions?.length === parsedQuestions.length;
             const sameFirstQuestion = b.questions?.[0]?.Question === parsedQuestions[0]?.Question && b.questions?.length === parsedQuestions.length;
             return sameNameAndCount || sameFirstQuestion;
         });
         
         if (isDuplicate) {
            alert("警告：資料庫中疑似已有相同內容或名稱的題庫，為避免重複上傳已為您阻擋！");
            if(fileInputRef.current) fileInputRef.current.value = "";
            return;
         }

         try {
            const docRef = await addDoc(collection(db, "QuizBanks"), {
              name: bankName,
              createdAt: new Date().toISOString(),
              questions: parsedQuestions
            });
            alert("✅ 上傳成功並自動儲存至雲端題庫！");
            await fetchBanksFromFirebase();
            setSetupTab('select');
            loadBank(docRef.id);
         } catch(fbErr) {
            alert("儲存至雲端失敗: " + fbErr.message);
         }
         if (fileInputRef.current) fileInputRef.current.value = "";
         setBankNameForm('');
       } catch (err) {
         alert('檔案解析發生錯誤：' + err.message);
       }
    };
    reader.readAsArrayBuffer(file);
  };

  const toggleCustomQ = (idx) => {
    const newSet = new Set(selectedCustomQIdxs);
    if (newSet.has(idx)) newSet.delete(idx);
    else newSet.add(idx);
    setSelectedCustomQIdxs(newSet);
  };
  
  const toggleChapter = (chapterQs) => {
    const newSet = new Set(selectedCustomQIdxs);
    const allSelected = chapterQs.every(q => newSet.has(q.originalIndex));
    chapterQs.forEach(q => {
       if (allSelected) newSet.delete(q.originalIndex);
       else newSet.add(q.originalIndex);
    });
    setSelectedCustomQIdxs(newSet);
  };

  const toggleExpandChapter = (chap) => {
      const newSet = new Set(expandedChapters);
      if (newSet.has(chap)) newSet.delete(chap);
      else newSet.add(chap);
      setExpandedChapters(newSet);
  };

  const toggleExpandSection = (secKey) => {
      const newSet = new Set(expandedSections);
      if (newSet.has(secKey)) newSet.delete(secKey);
      else newSet.add(secKey);
      setExpandedSections(newSet);
  };

  const createRoom = () => {
    if (selectedBankQuestions.length === 0) return alert('請先選擇雲端題庫。');
    
    let finalQuestions = [];
    
    if (genMode === 'random') {
       let pool = selectedBankQuestions;
       if (randChapter !== 'All') pool = pool.filter(q => q.Chapter === randChapter);
       if (randSection !== 'All') pool = pool.filter(q => q.Section === randSection);
       
       let tfPool = pool.filter(q => q.Type === 'true_false').sort(() => 0.5 - Math.random());
       let mcPool = pool.filter(q => q.Type === 'multiple_choice').sort(() => 0.5 - Math.random());
       
       const selectedTF = tfPool.slice(0, numTF);
       const selectedMC = mcPool.slice(0, numMC);
       finalQuestions = [...selectedTF, ...selectedMC].sort(() => 0.5 - Math.random());
       
    } else {
       if (selectedCustomQIdxs.size === 0) return alert("請勾選客製化題目！");
       finalQuestions = selectedBankQuestions.filter(q => selectedCustomQIdxs.has(q.originalIndex));
    }

    if (finalQuestions.length === 0) return alert('在此條件下沒有選中任何題目！');
    
    if (dashboardMode === 'live') {
      socket.emit('create_room', { questions: finalQuestions, limit: finalQuestions.length });
    } else if (dashboardMode === 'assignment_setup') {
      if (!assignmentTitle) return alert("請輸入任務名稱");
      if (!assignmentDeadline) return alert("請設定截止日期");
      
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      try {
         addDoc(collection(db, "Assignments"), {
            code,
            title: assignmentTitle,
            deadline: assignmentDeadline,
            mode: assignmentType, // practice, exam
            maxAttempts: assignmentType === 'exam' ? 1 : assignmentMaxAttempts,
            leaderboardDate: assignmentLeaderboardDate || assignmentDeadline,
            questions: finalQuestions,
            createdAt: new Date().toISOString(),
            status: 'active'
         }).then(() => {
            alert(`✅ 任務已成功派發！\n學生可使用代碼加入：${code}`);
            setDashboardMode('assignment_manage');
            fetchAssignmentsFromFirebase();
         });
      } catch (e) {
         alert("建立任務失敗：" + e.message);
      }
    }
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
      <div className="card teacher-card animate-fade-in glass-panel" style={{ padding: '2rem', maxWidth: '800px', margin: 'auto' }}>
        <h2 className="title" style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <Folder size={32} /> 教師控制面板
        </h2>

        {/* Top Level Mode Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', background: 'rgba(0,0,0,0.05)', padding: '0.5rem', borderRadius: '12px' }}>
           <button 
             onClick={() => setDashboardMode('live')}
             style={{ flex: 1, padding: '1rem', borderRadius: '8px', border: 'none', background: dashboardMode === 'live' ? 'var(--primary-color)' : 'transparent', color: dashboardMode === 'live' ? 'white' : 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s' }}
           >
              👥 即時連線對戰
           </button>
           <button 
             onClick={() => setDashboardMode('assignment_setup')}
             style={{ flex: 1, padding: '1rem', borderRadius: '8px', border: 'none', background: dashboardMode === 'assignment_setup' ? 'var(--primary-color)' : 'transparent', color: dashboardMode === 'assignment_setup' ? 'white' : 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s' }}
           >
              📝 單人任務派發
           </button>
           <button 
             onClick={() => setDashboardMode('assignment_manage')}
             style={{ flex: 1, padding: '1rem', borderRadius: '8px', border: 'none', background: dashboardMode === 'assignment_manage' ? 'var(--primary-color)' : 'transparent', color: dashboardMode === 'assignment_manage' ? 'white' : 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s' }}
           >
              📊 任務管理與成績
           </button>
        </div>

        {dashboardMode === 'assignment_manage' ? (
           <div className="animate-fade-in">
              <h3 style={{ marginBottom: '1rem', color: 'var(--primary-dark)' }}>已派發的任務清單</h3>
              {assignmentsList.length === 0 ? (
                 <p style={{ color: '#777', textAlign: 'center' }}>目前沒有任何任務。</p>
              ) : (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {assignmentsList.map(a => (
                       <div key={a.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', background: selectedAssignmentId === a.id ? '#f1f8e9' : '#fff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                             <div>
                               <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary-dark)' }}>{a.title}</h4>
                               <div style={{ fontSize: '0.9rem', color: '#666' }}>代碼: <strong style={{ color: 'var(--primary-color)' }}>{a.code}</strong> | 模式: {a.mode === 'exam' ? '考核' : '練習'} | 期限: {new Date(a.deadline).toLocaleString()}</div>
                             </div>
                             <button onClick={() => { setSelectedAssignmentId(a.id); loadAssignmentResults(a.id); }} style={{ padding: '0.5rem 1rem', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                               查看成績
                             </button>
                          </div>
                          {selectedAssignmentId === a.id && (
                             <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #ccc' }}>
                                <h4 style={{ marginBottom: '0.5rem' }}>學生成績列表 ({assignmentResults.length} 筆)</h4>
                                {assignmentResults.length === 0 ? <p>尚未有學生完成。</p> : (
                                   <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                                      <thead>
                                         <tr style={{ background: '#eee' }}>
                                            <th style={{ padding: '0.5rem' }}>學生</th>
                                            <th style={{ padding: '0.5rem' }}>分數</th>
                                            <th style={{ padding: '0.5rem' }}>作答次數</th>
                                            <th style={{ padding: '0.5rem' }}>完成時間</th>
                                         </tr>
                                      </thead>
                                      <tbody>
                                         {assignmentResults.sort((x,y) => y.score - x.score).map((r, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                               <td style={{ padding: '0.5rem' }}>{r.nickname}</td>
                                               <td style={{ padding: '0.5rem', fontWeight: 'bold', color: 'var(--primary-dark)' }}>{r.score}</td>
                                               <td style={{ padding: '0.5rem' }}>{r.attempts}</td>
                                               <td style={{ padding: '0.5rem' }}>{new Date(r.completedAt).toLocaleString()}</td>
                                            </tr>
                                         ))}
                                      </tbody>
                                   </table>
                                )}
                             </div>
                          )}
                       </div>
                    ))}
                 </div>
              )}
              <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                 <ParticleButton className="btn back-btn" onClick={onGoBack}>返回首頁</ParticleButton>
              </div>
           </div>
        ) : (
        <>
        {/* Setup Configuration Content */}
        {dashboardMode === 'assignment_setup' && (
           <div className="form-group slide-in" style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e0e0e0', marginBottom: '2rem' }}>
              <h3 style={{ color: 'var(--primary-dark)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><FileText size={20}/> 任務設定</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                 <div>
                    <label>任務名稱</label>
                    <input type="text" className="input-field" placeholder="例如：期中線上考核" value={assignmentTitle} onChange={e => setAssignmentTitle(e.target.value)} style={{ width: '100%' }} />
                 </div>
                 <div>
                    <label>截止日期與時間</label>
                    <input type="datetime-local" className="input-field" value={assignmentDeadline} onChange={e => setAssignmentDeadline(e.target.value)} style={{ width: '100%' }} />
                 </div>
                 <div>
                    <label>作答模式</label>
                    <select className="input-field" value={assignmentType} onChange={e => setAssignmentType(e.target.value)} style={{ width: '100%' }}>
                       <option value="practice">練習 (可多次作答，順序固定)</option>
                       <option value="exam">考核 (限一次作答，題目隨機)</option>
                    </select>
                 </div>
                 {assignmentType === 'practice' && (
                    <div>
                       <label>最大作答次數限制</label>
                       <input type="number" min="1" className="input-field" value={assignmentMaxAttempts} onChange={e => setAssignmentMaxAttempts(Number(e.target.value))} style={{ width: '100%' }} />
                    </div>
                 )}
                 <div>
                    <label>排行榜結算日期 (選填)</label>
                    <input type="datetime-local" className="input-field" value={assignmentLeaderboardDate} onChange={e => setAssignmentLeaderboardDate(e.target.value)} style={{ width: '100%' }} />
                 </div>
              </div>
           </div>
        )}
        
        <div className="tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '2px solid rgba(0,0,0,0.05)', paddingBottom: '1rem', marginBottom: '2rem' }}>
           <ParticleButton 
             className={`tab-btn ${setupTab === 'select' ? 'active' : ''}`}
             onClick={() => setSetupTab('select')}
             style={{ flex: 1, padding: '1rem', background: setupTab === 'select' ? 'var(--primary-color)' : 'transparent', color: setupTab === 'select' ? 'white' : 'var(--text-muted)', border: '1px solid rgba(0,0,0,0.1)', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
           >
             <Cloud /> 從雲端題庫載入出題
           </ParticleButton>
           <ParticleButton 
             className={`tab-btn ${setupTab === 'upload' ? 'active' : ''}`}
             onClick={() => setSetupTab('upload')}
             style={{ flex: 1, padding: '1rem', background: setupTab === 'upload' ? 'var(--primary-color)' : 'transparent', color: setupTab === 'upload' ? 'white' : 'var(--text-muted)', border: '1px solid rgba(0,0,0,0.1)', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
           >
             <UploadCloud /> 上傳全新 Excel
           </ParticleButton>
        </div>

        {setupTab === 'upload' && (
          <div className="form-group slide-in">
            <label style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>為這個新題庫命名</label>
            <input 
               type="text" 
               className="input-field" 
               placeholder="例如：永續經營第一單元" 
               value={bankNameForm}
               onChange={(e) => setBankNameForm(e.target.value)}
               style={{ width: '100%', marginBottom: '1rem' }}
            />
            <label style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>選擇 Excel 檔案</label>
            <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} ref={fileInputRef} className="input-field" style={{ width: '100%' }} />
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>💡 系統將自動辨識「章節」、「小節」欄位，且若無C/D選項將自動歸類為「是非題」。</p>
          </div>
        )}

        {setupTab === 'select' && (
          <div className="slide-in">
            <div className="form-group">
              <label style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>選擇雲端題庫</label>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <select onChange={(e) => loadBank(e.target.value)} value={selectedBankId} className="input-field" style={{ flex: 1, marginBottom: 0 }}>
                  <option value="" disabled>-- 點此選擇題庫 --</option>
                  {savedBanks.map(b => (
                    <option key={b.id} value={b.id}>{b.name} (含 {b.questions?.length || 0} 題)</option>
                  ))}
                </select>
                {selectedBankId && (
                  <button 
                    onClick={() => deleteBank(selectedBankId)}
                    style={{ background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: '8px', padding: '0 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 'bold' }}
                    title="刪除此題庫"
                  >
                    <Trash2 size={16} /> 刪除
                  </button>
                )}
              </div>
            </div>

            {selectedBankQuestions.length > 0 && (
              <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f9fbe7', borderRadius: '12px', border: '1px solid #dcedc8' }}>
                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem' }}>
                   <label style={{ cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', color: genMode === 'random' ? 'var(--primary-dark)' : 'inherit' }}>
                     <input type="radio" checked={genMode === 'random'} onChange={() => setGenMode('random')} />
                     <Shuffle size={20} /> 隨機出題
                   </label>
                   <label style={{ cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', color: genMode === 'custom' ? 'var(--primary-dark)' : 'inherit' }}>
                     <input type="radio" checked={genMode === 'custom'} onChange={() => setGenMode('custom')} />
                     <ListChecks size={20} /> 客製化出題
                   </label>
                </div>

                {genMode === 'random' && (
                  <div className="animate-fade-in">
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <label>過濾章節</label>
                        <select className="input-field" style={{ width: '100%' }} value={randChapter} onChange={(e) => { setRandChapter(e.target.value); setRandSection('All'); }}>
                          <option value="All">全部章節</option>
                          {chapters.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label>過濾小節</label>
                        <select className="input-field" style={{ width: '100%' }} value={randSection} onChange={(e) => setRandSection(e.target.value)} disabled={randChapter === 'All'}>
                          <option value="All">全部小節</option>
                          {(sections[randChapter] || []).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <label>隨機抽取「是非題」數量</label>
                        <input type="number" min="0" value={numTF} onChange={e => setNumTF(Number(e.target.value))} className="input-field" style={{ width: '100%' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label>隨機抽取「選擇題」數量</label>
                        <input type="number" min="0" value={numMC} onChange={e => setNumMC(Number(e.target.value))} className="input-field" style={{ width: '100%' }} />
                      </div>
                    </div>
                  </div>
                )}

                {genMode === 'custom' && (
                  <div className="animate-fade-in" style={{ maxHeight: '400px', overflowY: 'auto', background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #ccc' }}>
                    {chapters.map(chap => {
                       const chapQs = selectedBankQuestions.filter(q => q.Chapter === chap);
                       const isChapExpanded = expandedChapters.has(chap);
                       return (
                         <div key={chap} style={{ marginBottom: '1rem' }}>
                           <div style={{ fontWeight: 'bold', borderBottom: '2px solid var(--primary-light)', paddingBottom: '0.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', color: 'var(--primary-dark)' }}>
                             <div onClick={() => toggleExpandChapter(chap)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', marginRight: '0.5rem' }}>
                                {isChapExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                             </div>
                             <input type="checkbox" style={{ marginRight: '0.5rem', width: '18px', height: '18px' }} 
                                checked={chapQs.every(q => selectedCustomQIdxs.has(q.originalIndex))}
                                onChange={() => toggleChapter(chapQs)}
                             /> 
                             <div onClick={() => toggleExpandChapter(chap)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', userSelect: 'none' }}>
                                <Folder size={18} style={{ marginRight: '0.5rem' }} fill={isChapExpanded ? "#C8E6C9" : "none"} /> {chap} ({chapQs.length} 題)
                             </div>
                           </div>
                           
                           {isChapExpanded && (sections[chap] || []).map(sec => {
                             const secQs = chapQs.filter(q => q.Section === sec);
                             const secKey = `${chap}-${sec}`;
                             const isSecExpanded = expandedSections.has(secKey);
                             return (
                               <div key={secKey} style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
                                 <div style={{ fontWeight: 'bold', color: 'var(--secondary)', marginBottom: '0.3rem', display: 'flex', alignItems: 'center' }}>
                                   <div onClick={() => toggleExpandSection(secKey)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', marginRight: '0.5rem' }}>
                                      {isSecExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                   </div>
                                   <input type="checkbox" style={{ marginRight: '0.5rem', width: '16px', height: '16px' }} 
                                      checked={secQs.every(q => selectedCustomQIdxs.has(q.originalIndex))}
                                      onChange={() => toggleChapter(secQs)}
                                   />
                                   <div onClick={() => toggleExpandSection(secKey)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', userSelect: 'none' }}>
                                      <FileText size={16} style={{ marginRight: '0.5rem' }}/> {sec} ({secQs.length} 題)
                                   </div>
                                 </div>
                                 
                                 {isSecExpanded && (
                                    <div style={{ marginLeft: '1.5rem' }}>
                                     {secQs.map(q => (
                                        <div key={q.originalIndex} className="question-row" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '0.4rem', fontSize: '0.95rem', padding: '0.2rem', borderRadius: '4px' }}>
                                           <input type="checkbox" style={{ marginTop: '0.2rem', marginRight: '0.5rem' }} 
                                              checked={selectedCustomQIdxs.has(q.originalIndex)}
                                              onChange={() => toggleCustomQ(q.originalIndex)}
                                           />
                                           <div style={{ flex: 1 }}>
                                             <span style={{ color: q.Type==='true_false' ? 'var(--primary-dark)' : 'var(--secondary-color)', marginRight: '0.5rem', fontWeight: 'bold', fontSize: '0.8rem', background: '#f5f5f5', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>
                                               {q.Type==='true_false' ? '是非' : '選擇'}
                                             </span> 
                                             {q.Question}
                                           </div>
                                           <div 
                                             onClick={(e) => deleteQuestion(e, q.originalIndex)}
                                             style={{ cursor: 'pointer', color: '#ef5350', marginLeft: '0.5rem', padding: '0.1rem', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                                             title="刪除此題"
                                           >
                                             <Trash2 size={16} />
                                           </div>
                                        </div>
                                      ))}
                                    </div>
                                 )}
                               </div>
                             );
                           })}
                         </div>
                       );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
          <ParticleButton className="btn back-btn" onClick={onGoBack}>返回</ParticleButton>
          <ParticleButton className="btn primary-btn" onClick={createRoom} disabled={selectedBankQuestions.length === 0 && setupTab === 'select'}>
             {dashboardMode === 'live' ? '建立測驗房間' : '派發單人任務'}
          </ParticleButton>
        </div>
        </>
        )}
      </div>
    );
  }

  // --- WAITING ---
  if (step === 'waiting') {
    const joinUrl = `${window.location.origin}/?code=${roomCode}`;
    return (
      <div className="card teacher-waiting animate-fade-in" style={{ textAlign: 'center' }}>
        <h2 className="title" style={{ color: 'var(--primary-dark)' }}>等待永續夥伴加入...</h2>
        <div className="room-info" style={{ background: '#f1f8e9', padding: '2rem', borderRadius: '12px' }}>
          <h3>學生請前往首頁並輸入代碼：</h3>
          <div className="room-code" style={{ fontSize: '4rem', letterSpacing: '8px', color: 'var(--primary-color)' }}>{roomCode}</div>
          <div className="qr-container" style={{ marginTop: '1rem' }}>
             <QRCodeSVG value={joinUrl} size={180} />
          </div>
        </div>
        
        <div className="players-list" style={{ marginTop: '2rem' }}>
          <h3>已報到 ({players.length} 人)</h3>
          <div className="player-badges" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
            {players.map(p => (
              <div key={p.id} className="player-badge animate-pop" style={{ background: 'var(--primary-light)', padding: '0.5rem 1rem', borderRadius: '20px', fontWeight: 'bold' }}>{p.nickname}</div>
            ))}
          </div>
        </div>
        
        <ParticleButton className="btn primary-btn xl-btn" onClick={startGame} style={{ marginTop: '2rem', width: '100%' }}>開始作答！</ParticleButton>
      </div>
    );
  }

  // --- PLAYING ---
  if (step === 'playing' && currentQuestion) {
    return (
      <div className="teacher-playing animate-fade-in">
        <div className="game-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-dark)', padding: '1rem', background: 'rgba(255,255,255,0.7)', borderRadius: '15px' }}>
          <div className="question-counter" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><BarChart3 /> 第 {currentQuestion.qIndex + 1} 題 / 共 {currentQuestion.total} 題</div>
          <div className="timer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Clock /> {timeLeft}s</div>
        </div>
        
        <h1 className="question-text" style={{ textAlign: 'center', fontSize: '2.5rem', margin: '3rem 0', textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>{currentQuestion.question}</h1>
        
        <div className="options-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', padding: '0 2rem' }}>
           {['A', 'B'].map((opt) => (
             <div key={opt} className={`option-card opt-${opt.toLowerCase()}`} style={{ padding: '2rem', fontSize: '1.8rem', borderRadius: '16px', textAlign: 'center', boxShadow: '0 10px 20px rgba(0,0,0,0.1)', cursor: 'default' }}>
               <span className="opt-label" style={{ fontWeight: 'bold', marginRight: '1rem', background: 'rgba(255,255,255,0.3)', padding: '0.5rem 1rem', borderRadius: '12px' }}>{opt}</span> {currentQuestion.options[opt]}
             </div>
           ))}
           {/* If C and D exists */}
           {currentQuestion.options.C && (
             <div className={`option-card opt-c`} style={{ padding: '2rem', fontSize: '1.8rem', borderRadius: '16px', textAlign: 'center', boxShadow: '0 10px 20px rgba(0,0,0,0.1)', cursor: 'default' }}>
               <span className="opt-label" style={{ fontWeight: 'bold', marginRight: '1rem', background: 'rgba(255,255,255,0.3)', padding: '0.5rem 1rem', borderRadius: '12px' }}>C</span> {currentQuestion.options.C}
             </div>
           )}
           {currentQuestion.options.D && (
             <div className={`option-card opt-d`} style={{ padding: '2rem', fontSize: '1.8rem', borderRadius: '16px', textAlign: 'center', boxShadow: '0 10px 20px rgba(0,0,0,0.1)', cursor: 'default' }}>
               <span className="opt-label" style={{ fontWeight: 'bold', marginRight: '1rem', background: 'rgba(255,255,255,0.3)', padding: '0.5rem 1rem', borderRadius: '12px' }}>D</span> {currentQuestion.options.D}
             </div>
           )}
        </div>
        
        <div className="status-bar" style={{ textAlign: 'center', marginTop: '3rem', fontSize: '1.4rem', color: 'var(--text-main)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
          <Users /> 作答進度: {answeredCount} / {players.length} 人
        </div>
      </div>
    );
  }

  // --- RESULT ---
  if (step === 'question_result' && currentQuestion) {
    const totalAns = distribution ? Object.values(distribution).reduce((a, b) => a + b, 0) : 0;
    
    return (
      <div className="teacher-result animate-fade-in" style={{ padding: '2rem' }}>
        <h2 style={{ textAlign: 'center', color: '#d32f2f', fontSize: '2rem' }}>作答結束！</h2>
        <h3 className="correct-answer-display" style={{ textAlign: 'center', background: '#e8f5e9', padding: '1rem', borderRadius: '12px', margin: '1rem 0' }}>✅ 正確解答：{currentQuestion.correctOption}</h3>
        
        <div className="distribution-section" style={{ maxWidth: '800px', margin: 'auto' }}>
          <h3 style={{ marginBottom: '1.5rem', textAlign: 'center', color: 'var(--primary-dark)' }}>📊 各選項作答人數比例</h3>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', height: '220px', gap: '2.5rem', padding: '1.5rem', background: 'rgba(255,255,255,0.6)', borderRadius: '16px', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.05)' }}>
          {['A', 'B', 'C', 'D'].filter(opt => currentQuestion.options[opt]).map((opt) => {
            const count = distribution ? (distribution[opt] || 0) : 0;
            const pct = totalAns > 0 ? (count / totalAns) * 100 : 0;
            const isCorrect = currentQuestion.correctOption === opt;
            
            return (
              <div key={opt} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', width: '80px' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                     <div style={{ 
                         width: '100%', 
                         height: `${pct}%`, 
                         background: isCorrect ? 'linear-gradient(to top, #43a047, #81c784)' : 'linear-gradient(to top, #9e9e9e, #e0e0e0)',
                         borderRadius: '12px 12px 0 0',
                         transition: 'height 1s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                         boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                         position: 'relative'
                     }}>
                        <div style={{ position: 'absolute', top: '-30px', width: '100%', textAlign: 'center', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--text-main)' }}>{count}</div>
                     </div>
                </div>
                <div style={{ textAlign: 'center', fontWeight: 'bold', color: isCorrect ? '#2e7d32' : '#777', marginTop: '12px', fontSize: '1.4rem', background: isCorrect ? 'rgba(76, 175, 80, 0.2)' : 'transparent', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{opt}</div>
              </div>
            );
          })}
          </div>
        </div>
        
        <div className="leaderboard" style={{ maxWidth: '800px', margin: '2rem auto', background: '#fff', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <h2 style={{ textAlign: 'center', color: 'var(--secondary-color)' }}>🏆 英雄榜 🏆</h2>
          {leaderboard.map((player, idx) => (
            <div key={idx} className="leaderboard-item animate-slide-up" style={{ animationDelay: `${idx * 0.1}s`, display: 'flex', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #eee' }}>
              <span className="rank" style={{ fontWeight: 'bold', color: '#d4af37' }}>#{idx + 1}</span>
              <span className="nick" style={{ flex: 1, marginLeft: '1rem' }}>{player.nickname}</span>
              <span className="score" style={{ fontWeight: 'bold' }}>{player.score} 分</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center' }}>
          <ParticleButton className="btn primary-btn mt-4 xl-btn" onClick={nextQuestion}>
            {(currentQuestion.qIndex + 1) === currentQuestion.total ? '查看最終總成績' : '前往下一題'}
          </ParticleButton>
        </div>
      </div>
    );
  }

  // --- GAME OVER ---
  if (step === 'game_over') {
    return (
      <div className="teacher-game-over animate-fade-in" style={{ maxWidth: '800px', margin: 'auto', padding: '2rem', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        <h1 className="title" style={{ textAlign: 'center', color: 'var(--primary-dark)', fontSize: '3rem' }}>🎉 測驗圓滿結束</h1>
        <div className="leaderboard final-leaderboard" style={{ marginTop: '2rem' }}>
          {finalReport.sort((a,b)=>b.score - a.score).map((player, idx) => (
            <div key={idx} className="leaderboard-item" style={{ display: 'flex', alignItems: 'center', padding: '1.5rem', background: idx < 3 ? '#fff9c4' : '#f5f5f5', borderRadius: '12px', marginBottom: '1rem' }}>
              <span className="rank" style={{ fontSize: '2rem', fontWeight: 'bold', width: '60px', color: '#fbc02d' }}>{idx < 3 ? ['🥇','🥈','🥉'][idx] : `#${idx + 1}`}</span>
              <span className="nick" style={{ flex: 1, fontSize: '1.5rem', fontWeight: 'bold' }}>{player.nickname}</span>
              <span className="score" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2e7d32' }}>{player.score} 分</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          <ParticleButton className="btn primary-btn xl-btn" onClick={() => window.location.reload()}>回到控制面板</ParticleButton>
        </div>
      </div>
    );
  }

  return <div style={{ textAlign: 'center', padding: '4rem', fontSize: '1.5rem' }}>系統載入中...🌿</div>;
}
