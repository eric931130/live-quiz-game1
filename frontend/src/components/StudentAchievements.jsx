import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Trophy, Star, Medal, BookX, ArrowLeft, Target } from 'lucide-react';
import ParticleButton from './ParticleButton';

export default function StudentAchievements({ currentUser, onGoBack }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ totalScore: 0, completedAssignments: 0, correctAnswers: 0, wrongAnswers: 0 });
  const [wrongQuestions, setWrongQuestions] = useState([]);
  const [competitionTarget, setCompetitionTarget] = useState(null);
  const [playerProfile, setPlayerProfile] = useState(null);

  const loadProfileAndStats = useCallback(async () => {
    try {
      // 1. Load Profile
      const userDoc = await getDoc(doc(db, 'Users', currentUser.uid));
      if (userDoc.exists()) {
        setProfile(userDoc.data());
      } else {
        setProfile({ nickname: currentUser.displayName || '未知使用者', avatar: '👤', playFrequency: '尚未設定' });
      }

      // 2. Load Stats from AssignmentResults
      const resultsQ = query(collection(db, 'AssignmentResults'), where('studentId', '==', currentUser.uid));
      const resultsSnap = await getDocs(resultsQ);
      
      let totalScore = 0;
      let correct = 0;
      let wrong = 0;
      let mistakes = [];

      resultsSnap.forEach(rDoc => {
         const data = rDoc.data();
         totalScore += data.score || 0;
         if (data.answers) {
            data.answers.forEach(ans => {
               if (ans.correct) correct++;
               else {
                  wrong++;
                  mistakes.push({ ...ans, assignmentId: data.assignmentId });
               }
            });
         }
      });

      setStats({
         totalScore,
         completedAssignments: resultsSnap.size,
         correctAnswers: correct,
         wrongAnswers: wrong
      });
      setWrongQuestions(mistakes);

      // 3. Load Competition Target & Player Progression Profile
      const targetSnap = await getDoc(doc(db, "CompetitionRound", "current"));
      if (targetSnap.exists()) {
         setCompetitionTarget(targetSnap.data());
      }

      const playerProgressQuery = query(
         collection(db, "PlayerCompetitionProgress"),
         where("playerId", "==", currentUser.uid)
      );
      const playerProgressSnap = await getDocs(playerProgressQuery);
      
      if (!playerProgressSnap.empty) {
         let aggregatedProfile = {
            playerId: currentUser.uid,
            perfectClearCount: 0,
            failedAttemptCount: 0,
            retryCount: 0,
            farthestWorldOrder: 0,
            farthestStageIndex: 0
         };
         playerProgressSnap.forEach(d => {
            const data = d.data();
            aggregatedProfile.perfectClearCount += (data.perfectClearCount || 0);
            aggregatedProfile.failedAttemptCount += (data.failedAttemptCount || 0);
            aggregatedProfile.retryCount += (data.retryCount || 0);
            if (data.farthestWorldOrder > aggregatedProfile.farthestWorldOrder) {
               aggregatedProfile.farthestWorldOrder = data.farthestWorldOrder;
               aggregatedProfile.farthestStageIndex = data.farthestStageIndex;
            } else if (data.farthestWorldOrder === aggregatedProfile.farthestWorldOrder && data.farthestStageIndex > aggregatedProfile.farthestStageIndex) {
               aggregatedProfile.farthestStageIndex = data.farthestStageIndex;
            }
         });
         setPlayerProfile(aggregatedProfile);
      } else {
         // Fallback/Legacy direct fetch in case playerId field isn't set
         const playerProfileSnap = await getDoc(doc(db, "PlayerCompetitionProgress", currentUser.uid));
         if (playerProfileSnap.exists()) {
            setPlayerProfile(playerProfileSnap.data());
         } else {
            setPlayerProfile(null);
         }
      }

    } catch(e) {
      console.error("Failed to load achievements", e);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(() => {
      loadProfileAndStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [currentUser, loadProfileAndStats]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.5rem', color: 'var(--primary-dark)' }}>讀取成就中...</div>;
  }

  // Calculate Title
  let title = "初學探索者";
  if (stats.totalScore > 10000) title = "永續大師";
  else if (stats.totalScore > 5000) title = "知識菁英";
  else if (stats.totalScore > 1000) title = "進階挑戰者";

  return (
    <div className="home-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-color)', padding: '2rem' }}>
      <div className="app-tool-window large animate-fade-in">
        <div className="app-tool-window-header">
          <div className="app-tool-window-header-title">
             <button onClick={onGoBack} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}>
                <ArrowLeft size={20} /> 返回 Dashboard
             </button>
             <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
             <span>🏆 個人成就與錯題本</span>
          </div>
          <div className="app-tool-window-controls">
             <span className="app-tool-window-control-dot minimize" />
             <span className="app-tool-window-control-dot maximize" />
             <span className="app-tool-window-control-dot close" onClick={onGoBack} title="關閉視窗" />
          </div>
        </div>
        <div className="app-tool-window-body">
         <div className="card glass-panel animate-fade-in" style={{ padding: '2rem', borderRadius: '24px', display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '2rem' }}>
            <div style={{ fontSize: '5rem', background: '#e3f2fd', padding: '1rem', borderRadius: '50%', border: '4px solid var(--primary-light)', minWidth: '120px', textAlign: 'center' }}>
               {profile?.avatar}
            </div>
            <div style={{ flex: 1 }}>
               <h2 style={{ fontSize: '2.5rem', color: 'var(--primary-dark)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {profile?.nickname} 
                  <span style={{ fontSize: '1rem', background: '#FFD54F', color: '#B71C1C', padding: '0.2rem 1rem', borderRadius: '50px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                     <Medal size={16}/> {title}
                  </span>
               </h2>
               <p style={{ color: '#666', fontSize: '1.2rem', margin: '0 0 1rem 0' }}><Target size={18} style={{ verticalAlign: 'text-bottom' }}/> 目標頻率：{profile?.playFrequency}</p>
            </div>
         </div>

         {competitionTarget && (
            <div className="card glass-panel animate-fade-in" style={{ padding: '2rem', borderRadius: '24px', marginBottom: '2rem', background: '#ffffff', borderLeft: '8px solid var(--primary-color)' }}>
               <h3 style={{ fontSize: '1.6rem', color: 'var(--primary-dark)', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🏆 當前季度挑戰目標
               </h3>
               {(() => {
                  const farthestWorld = playerProfile?.farthestWorldOrder || 0;
                  const farthestStage = playerProfile?.farthestStageIndex || 0;
                  const targetWorld = competitionTarget.targetWorldId;
                  const targetStage = competitionTarget.targetStageIndex;
                  
                  const isReached = farthestWorld * 100 + farthestStage >= targetWorld * 100 + targetStage;

                  if (isReached) {
                     return (
                        <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '16px', padding: '1.5rem', color: '#2e7d32' }}>
                           <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', fontWeight: 'bold' }}>
                              🎉 恭喜！您已達成季度目標！
                           </h4>
                           <p style={{ margin: '0.5rem 0 0 0', fontSize: '1rem', color: '#4caf50', fontWeight: 'bold' }}>
                              目標：世界 {targetWorld} - 第 {targetStage} 關 ({competitionTarget.targetDescription})
                           </p>
                           <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: '#666' }}>
                              達成時間：{playerProfile?.targetReachedAt ? new Date(playerProfile.targetReachedAt).toLocaleString() : '已完成'}
                           </p>
                        </div>
                     );
                  } else {
                     const targetPos = (targetWorld - 1) * 10 + targetStage;
                     const currentPos = farthestWorld > 0 ? (farthestWorld - 1) * 10 + farthestStage : 0;
                     const diff = Math.max(0, targetPos - currentPos);
                     
                     return (
                        <div style={{ background: '#f1f8e9', border: '1px solid #dcedc8', borderRadius: '16px', padding: '1.5rem', color: '#33691e' }}>
                           <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary-dark)' }}>
                              🎯 挑戰目標：世界 {targetWorld} - 第 {targetStage} 關
                           </h4>
                           <p style={{ margin: '0.5rem 0', fontSize: '1rem', color: '#555' }}>
                              <strong>目標說明：</strong>{competitionTarget.targetDescription}
                           </p>
                           <hr style={{ border: 'none', borderTop: '1px solid #dcedc8', margin: '1rem 0' }} />
                           <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                              您目前最遠進度：世界 {farthestWorld} - 第 {farthestStage} 關
                           </p>
                           <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.05rem', color: '#d84315', fontWeight: 'bold' }}>
                              距離達成目標還差 {diff} 個 Checkpoint 關卡！繼續挑戰，你一定可以做得到的！🔥
                           </p>
                        </div>
                     );
                  }
               })()}
            </div>
         )}

         <h3 style={{ fontSize: '1.5rem', color: 'var(--primary-dark)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Star size={24} color="#FBC02D" /> 學習數據
         </h3>
         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '3rem' }}>
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', background: 'white' }}>
               <div style={{ color: '#666', marginBottom: '0.5rem' }}>總積分</div>
               <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--primary-color)' }}>{stats.totalScore}</div>
            </div>
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', background: 'white' }}>
               <div style={{ color: '#666', marginBottom: '0.5rem' }}>完成任務數</div>
               <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#1976D2' }}>{stats.completedAssignments}</div>
            </div>
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', background: 'white' }}>
               <div style={{ color: '#666', marginBottom: '0.5rem' }}>累積答對</div>
               <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#388E3C' }}>{stats.correctAnswers}</div>
            </div>
         </div>

         <h3 style={{ fontSize: '1.5rem', color: 'var(--primary-dark)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookX size={24} color="#D32F2F" /> 我的錯題本
         </h3>
         <div className="card" style={{ background: 'white', padding: '2rem' }}>
            {wrongQuestions.length === 0 ? (
               <div style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>
                  太厲害了！你目前沒有任何錯題紀錄。
               </div>
            ) : (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <p style={{ color: '#666' }}>（錯題本將會記錄單人任務中的錯誤，協助您日後複習！）</p>
                  {wrongQuestions.map((wq, i) => (
                     <div key={i} style={{ borderLeft: '4px solid #EF5350', padding: '1rem', background: '#FFEBEE', borderRadius: '0 8px 8px 0' }}>
                        <div style={{ fontWeight: 'bold', color: '#C62828', marginBottom: '0.5rem' }}>題號索引：{wq.qIndex + 1}</div>
                        <div style={{ color: '#D32F2F', fontSize: '0.95rem' }}>你選擇了：{wq.selected} (答錯)</div>
                     </div>
                  ))}
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
