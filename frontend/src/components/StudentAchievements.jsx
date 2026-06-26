import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Trophy, Star, Medal, BookX, ArrowLeft, Target, Lock, Sparkles, ChevronRight, Award, Shield, User, RefreshCw } from 'lucide-react';
import ParticleButton from './ParticleButton';

export default function StudentAchievements({ currentUser, onGoBack, API_BASE_URL, onEvolveTriggered }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ totalScore: 0, completedAssignments: 0, correctAnswers: 0, wrongAnswers: 0 });
  const [wrongQuestions, setWrongQuestions] = useState([]);
  const [competitionTarget, setCompetitionTarget] = useState(null);
  const [playerProfile, setPlayerProfile] = useState(null);

  // New states for player profile & evolution
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'stats'
  const [playerInfo, setPlayerInfo] = useState(null); // from /api/player/profile
  const [stages, setStages] = useState([]); // from /api/player/character-stages/:id
  const [selectedTimelineStage, setSelectedTimelineStage] = useState(null);
  const [checkingEvol, setCheckingEvol] = useState(false);

  const fetchPlayerProfileData = useCallback(async () => {
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/player/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPlayerInfo(data);
        if (data.profile?.selectedEvolutionChainId) {
          const stagesRes = await fetch(`${API_BASE_URL}/api/player/character-stages/${data.profile.selectedEvolutionChainId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (stagesRes.ok) {
            const stagesData = await stagesRes.json();
            setStages(stagesData);
            // Default selected stage details to current player stage
            const currStage = stagesData.find(s => s.stageNumber === data.profile.currentEvolutionStage);
            setSelectedTimelineStage(currStage || stagesData[0]);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load player profile data:", err);
    }
  }, [currentUser, API_BASE_URL]);

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
         const playerProfileSnap = await getDoc(doc(db, "PlayerCompetitionProgress", currentUser.uid));
         if (playerProfileSnap.exists()) {
            setPlayerProfile(playerProfileSnap.data());
         } else {
            setPlayerProfile(null);
         }
      }

      // 4. Fetch Evolution Profile
      await fetchPlayerProfileData();

    } catch(e) {
      console.error("Failed to load achievements", e);
    } finally {
      setLoading(false);
    }
  }, [currentUser, fetchPlayerProfileData]);

  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(() => {
      loadProfileAndStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [currentUser, loadProfileAndStats]);

  const handleCheckEvolution = async () => {
    setCheckingEvol(true);
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/player/check-evolution`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.evolved) {
          onEvolveTriggered && onEvolveTriggered(data);
        } else {
          if (data.status === 'max_stage') {
            alert('恭喜！你的夥伴已達到最終進化形態，無法再繼續進化！');
          } else if (data.status === 'not_satisfied') {
            let msg = '尚未滿足進化條件！\n\n';
            if (data.checks) {
              if (data.checks.points && !data.checks.points.met) {
                msg += `• 積分未達標：需要 ${data.checks.points.required} (目前：${data.checks.points.current})\n`;
              }
              if (data.checks.perfectClears && !data.checks.perfectClears.met) {
                msg += `• 滿分通關數不足：需要 ${data.checks.perfectClears.required} (目前：${data.checks.perfectClears.current})\n`;
              }
              if (data.checks.checkpointClears && !data.checks.checkpointClears.met) {
                msg += `• Checkpoint 通關數不足：需要 ${data.checks.checkpointClears.required} (目前：${data.checks.checkpointClears.current})\n`;
              }
              if (data.checks.worldClear && !data.checks.worldClear.met) {
                msg += `• 尚未通過指定世界\n`;
              }
              if (data.checks.stageClear && !data.checks.stageClear.met) {
                msg += `• 尚未通過指定階段：第 ${data.checks.stageClear.required} 階段\n`;
              }
              if (data.checks.checkpointClear && !data.checks.checkpointClear.met) {
                msg += `• 尚未通過指定檢查點\n`;
              }
              if (data.checks.loginDays && !data.checks.loginDays.met) {
                msg += `• 學習天數不足：需要 ${data.checks.loginDays.required} 天 (目前：${data.checks.loginDays.current} 天)\n`;
              }
              if (data.checks.learningDaysThisWeek && !data.checks.learningDaysThisWeek.met) {
                msg += `• 本週學習天數不足：需要 ${data.checks.learningDaysThisWeek.required} 天 (目前：${data.checks.learningDaysThisWeek.current} 天)\n`;
              }
              if (data.checks.targetReached && !data.checks.targetReached.met) {
                msg += `• 尚未達成季度挑戰目標\n`;
              }
              if (data.checks.badges && !data.checks.badges.met) {
                msg += `• 缺少必要徽章：${data.checks.badges.missing.join(', ')}\n`;
              }
              if (data.checks.tokens && !data.checks.tokens.met) {
                msg += `• 缺少必要令牌\n`;
              }
              if (data.checks.items && !data.checks.items.met) {
                msg += `• 缺少必要道具\n`;
              }
            }
            alert(msg);
          } else {
            alert(`無法進化：${data.reason || '條件尚未達成。'}`);
          }
        }
      } else {
        alert('檢查進化失敗，請稍後再試。');
      }
    } catch (err) {
      console.error(err);
      alert('檢查進化時發生錯誤。');
    } finally {
      setCheckingEvol(false);
      await fetchPlayerProfileData();
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.5rem', color: 'var(--primary-dark)' }}>讀取成就與角色檔案中...</div>;
  }

  // Calculate Title
  let title = "初學探索者";
  if (stats.totalScore > 10000) title = "永續大師";
  else if (stats.totalScore > 5000) title = "知識菁英";
  else if (stats.totalScore > 1000) title = "進階挑戰者";

  const pDoc = playerInfo?.profile || {};
  const activeChar = playerInfo?.activeCharacter || null;
  const currentStage = playerInfo?.currentStage || null;

  return (
    <div className="home-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-color)', padding: '2rem' }}>
      <div className="app-tool-window large animate-fade-in">
        <div className="app-tool-window-header">
          <div className="app-tool-window-header-title">
             <button onClick={onGoBack} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}>
                <ArrowLeft size={20} /> 返回 Dashboard
             </button>
             <span style={{ color: 'rgba(31, 107, 58, 0.4)' }}>|</span>
             <span>🏆 個人學員中心 & 角色進化</span>
          </div>
          <div className="app-tool-window-controls">
             <span className="app-tool-window-control-dot minimize" />
             <span className="app-tool-window-control-dot maximize" />
             <span className="app-tool-window-control-dot close" onClick={onGoBack} title="關閉" />
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="app-tabs-bar" style={{ display: 'flex', gap: '0.5rem', padding: '1rem 2rem 0 2rem', background: 'var(--white-1)', borderBottom: '1px solid rgba(129, 199, 132, 0.2)' }}>
          <button 
            onClick={() => setActiveTab('profile')} 
            style={{
              padding: '0.75rem 1.5rem',
              background: activeTab === 'profile' ? 'var(--white-3)' : 'transparent',
              border: '1px solid rgba(129,199,132,0.25)',
              borderBottom: activeTab === 'profile' ? '1px solid transparent' : '1px solid rgba(129,199,132,0.25)',
              borderRadius: '12px 12px 0 0',
              fontWeight: 'bold',
              color: activeTab === 'profile' ? 'var(--primary-dark)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            <Sparkles size={16} /> 個人資訊 & 角色進化
          </button>
          <button 
            onClick={() => setActiveTab('stats')} 
            style={{
              padding: '0.75rem 1.5rem',
              background: activeTab === 'stats' ? 'var(--white-3)' : 'transparent',
              border: '1px solid rgba(129,199,132,0.25)',
              borderBottom: activeTab === 'stats' ? '1px solid transparent' : '1px solid rgba(129,199,132,0.25)',
              borderRadius: '12px 12px 0 0',
              fontWeight: 'bold',
              color: activeTab === 'stats' ? 'var(--primary-dark)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            <Trophy size={16} /> 學習數據 & 錯題本
          </button>
        </div>

        <div className="app-tool-window-body" style={{ padding: '2rem' }}>
          
          {/* PROFILE & EVOLUTION TAB */}
          {activeTab === 'profile' && (
            <div className="animate-fade-in">
              {/* Participant Profile Banner */}
              <div className="card glass-panel" style={{ padding: '2rem', borderRadius: '24px', display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '2rem' }}>
                <div style={{ fontSize: '5rem', background: '#e8f5e9', padding: '1rem', borderRadius: '50%', border: '4px solid var(--primary-light)', minWidth: '120px', textAlign: 'center' }}>
                   {profile?.avatar || '🧑‍🚀'}
                </div>
                <div style={{ flex: 1 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', background: 'rgba(129, 199, 132, 0.2)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--primary-dark)', fontWeight: 'bold' }}>
                        學員代碼：{pDoc.anonymizedStudentCode || '無'}
                      </span>
                      {pDoc.displayName && (
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                          ({pDoc.displayName})
                        </span>
                      )}
                   </div>
                   <h2 style={{ fontSize: '2.5rem', color: 'var(--primary-dark)', margin: '0.5rem 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {profile?.nickname || '去識別化學員'} 
                      <span style={{ fontSize: '1rem', background: '#FFD54F', color: '#B71C1C', padding: '0.2rem 1rem', borderRadius: '50px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                         <Medal size={16}/> {title}
                      </span>
                   </h2>
                   <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', color: '#555', fontSize: '1rem' }}>
                      <span><Target size={16} style={{ verticalAlign: 'text-bottom' }}/> 積分餘額：{pDoc.points || 0} pt</span>
                      <span><Target size={16} style={{ verticalAlign: 'text-bottom' }}/> 學習目標：{profile?.playFrequency || '尚未設定'}</span>
                   </div>
                </div>
              </div>

              {/* Active Character Visual and 6-Stage Timeline */}
              {activeChar ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', marginBottom: '2rem' }}>
                  
                  {/* Left: Active character stage details */}
                  <div className="card" style={{ padding: '2rem', background: 'white', border: '1px solid rgba(129, 199, 132, 0.25)', borderRadius: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <h3 style={{ color: 'var(--primary-dark)', fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '2px solid var(--green-2)', paddingBottom: '0.5rem', width: '100%' }}>
                      目前夥伴形態
                    </h3>
                    
                    <div style={{ 
                      width: '200px', 
                      height: '200px', 
                      borderRadius: '50%', 
                      background: 'linear-gradient(135deg, rgba(129, 199, 132, 0.1), rgba(255, 213, 79, 0.15))',
                      border: '4px solid var(--primary-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      marginBottom: '1rem',
                      boxShadow: '0 8px 32px rgba(76, 175, 80, 0.08)'
                    }}>
                      {currentStage?.imageUrl ? (
                        <img src={currentStage.imageUrl} alt={activeChar.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: '4rem' }}>🥚</span>
                      )}
                    </div>

                    <h4 style={{ fontSize: '1.5rem', color: 'var(--primary-dark)', margin: '0.5rem 0' }}>
                      {activeChar.name}
                    </h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0 }}>
                      第 {pDoc.currentEvolutionStage} 階段：{currentStage?.stageName || '未命名'}
                    </p>
                    {currentStage?.stageTitle && (
                      <p style={{ color: 'var(--gold-bright)', fontWeight: 'bold', fontSize: '1rem', marginTop: '0.2rem' }}>
                        称号：{currentStage.stageTitle}
                      </p>
                    )}
                    
                    <div style={{ width: '100%', marginTop: '1.5rem' }}>
                      <ParticleButton 
                        onClick={handleCheckEvolution} 
                        disabled={checkingEvol || pDoc.currentEvolutionStage >= 6} 
                        className="btn primary-btn btn-block" 
                        style={{ padding: '0.8rem', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                      >
                        {checkingEvol ? '檢查中...' : pDoc.currentEvolutionStage >= 6 ? '已達最終形態 (MAX)' : (
                          <>
                            <RefreshCw size={16} className={checkingEvol ? 'animate-spin' : ''} /> 檢查進化條件 (Check Evolution)
                          </>
                        )}
                      </ParticleButton>
                      {pDoc.currentEvolutionStage >= 6 && (
                        <div style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#fff9c4', color: '#f57f17', padding: '0.3rem 1rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                          <Award size={16} /> 最終形態徽章已解鎖
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Evolution Timeline */}
                  <div className="card" style={{ padding: '2rem', background: 'white', border: '1px solid rgba(129, 199, 132, 0.25)', borderRadius: '24px', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ color: 'var(--primary-dark)', fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '2px solid var(--green-2)', paddingBottom: '0.5rem' }}>
                      六階段進化時間軸 (Evolution Timeline)
                    </h3>

                    {/* Timeline Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem', marginBottom: '2rem', position: 'relative' }}>
                      {/* Line connector */}
                      <div style={{ position: 'absolute', top: '24px', left: '8%', right: '8%', height: '4px', background: 'rgba(129,199,132,0.2)', zIndex: 1 }} />
                      
                      {stages.map((st) => {
                        const isReached = st.stageNumber <= pDoc.currentEvolutionStage;
                        const isSelected = selectedTimelineStage?.stageNumber === st.stageNumber;
                        
                        return (
                          <div 
                            key={st.id} 
                            onClick={() => setSelectedTimelineStage(st)}
                            style={{ textAlign: 'center', zIndex: 2, cursor: 'pointer' }}
                          >
                            <div style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '50%',
                              background: isReached ? 'var(--white-3)' : '#cbd5e1',
                              border: isSelected ? '3px solid var(--gold-bright)' : isReached ? '2px solid var(--primary-color)' : '2px solid #94a3b8',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              margin: '0 auto',
                              boxShadow: isSelected ? '0 0 10px rgba(212,175,55,0.6)' : 'none',
                              filter: isReached ? 'none' : 'grayscale(100%) brightness(50%) blur(0.5px)',
                              transition: 'all 0.2s'
                            }}>
                              {isReached ? (
                                st.imageUrl ? (
                                  <img src={st.imageUrl} alt={`Stage ${st.stageNumber}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <span style={{ fontSize: '1.2rem' }}>🥚</span>
                                )
                              ) : (
                                <Lock size={16} color="#475569" />
                              )}
                            </div>
                            <span style={{ display: 'block', fontSize: '0.75rem', marginTop: '0.5rem', color: isSelected ? 'var(--primary-dark)' : 'var(--text-muted)', fontWeight: isSelected ? 'bold' : 'normal' }}>
                              St. {st.stageNumber}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Timeline stage detail details */}
                    {selectedTimelineStage && (
                      <div style={{ 
                        flex: 1, 
                        background: 'rgba(129, 199, 132, 0.04)', 
                        border: '1px solid rgba(129, 199, 132, 0.15)', 
                        borderRadius: '16px', 
                        padding: '1.25rem',
                        textAlign: 'left'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '1.1rem', fontWeight: 'bold' }}>
                            階段 {selectedTimelineStage.stageNumber}：{selectedTimelineStage.stageName || '未命名'}
                          </h4>
                          {selectedTimelineStage.stageNumber <= pDoc.currentEvolutionStage ? (
                            <span style={{ fontSize: '0.75rem', background: '#e8f5e9', color: '#2e7d32', padding: '0.1rem 0.5rem', borderRadius: '10px', fontWeight: 'bold' }}>
                              已解鎖
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', background: '#eceff1', color: '#546e7a', padding: '0.1rem 0.5rem', borderRadius: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                              <Lock size={10} /> 未解鎖
                            </span>
                          )}
                        </div>
                        {selectedTimelineStage.stageTitle && (
                          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--gold-bright)', fontWeight: 'bold' }}>
                            稱號：{selectedTimelineStage.stageTitle}
                          </p>
                        )}
                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#555', lineHeight: '1.5' }}>
                          {selectedTimelineStage.description || '暫無描述。'}
                        </p>

                        {/* Evolution condition checklist for this stage */}
                        {selectedTimelineStage.stageNumber > 1 && selectedTimelineStage.conditions && (
                          <div>
                            <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--primary-dark)', fontWeight: 'bold', borderTop: '1px solid rgba(129,199,132,0.15)', paddingTop: '0.5rem' }}>
                              進化條件需求：
                            </h5>
                            <ul style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', color: '#444' }}>
                              {selectedTimelineStage.conditions.requiredPoints > 0 && (
                                <li style={{ color: (pDoc.points || 0) >= selectedTimelineStage.conditions.requiredPoints ? '#2e7d32' : '#c62828', fontWeight: (pDoc.points || 0) >= selectedTimelineStage.conditions.requiredPoints ? 'bold' : 'normal' }}>
                                  積分達到 {selectedTimelineStage.conditions.requiredPoints} pt (目前：{pDoc.points || 0} pt)
                                </li>
                              )}
                              {selectedTimelineStage.conditions.requiredPerfectClears > 0 && (
                                <li>
                                  滿分通關數達到 {selectedTimelineStage.conditions.requiredPerfectClears} 次
                                </li>
                              )}
                              {selectedTimelineStage.conditions.requiredCheckpointClears > 0 && (
                                <li>
                                  Checkpoint 通關數達到 {selectedTimelineStage.conditions.requiredCheckpointClears} 次
                                </li>
                              )}
                              {selectedTimelineStage.conditions.requiredWorldId && (
                                <li>
                                  通關世界：{selectedTimelineStage.conditions.requiredWorldId}
                                </li>
                              )}
                              {selectedTimelineStage.conditions.requiredLoginDays > 0 && (
                                <li style={{ color: (pDoc.loginDates?.length || 0) >= selectedTimelineStage.conditions.requiredLoginDays ? '#2e7d32' : '#c62828', fontWeight: (pDoc.loginDates?.length || 0) >= selectedTimelineStage.conditions.requiredLoginDays ? 'bold' : 'normal' }}>
                                  累計學習天數達 {selectedTimelineStage.conditions.requiredLoginDays} 天 (目前：{pDoc.loginDates?.length || 0} 天)
                                </li>
                              )}
                              {selectedTimelineStage.conditions.requiredLearningDaysThisWeek > 0 && (
                                <li>
                                  本週學習天數達 {selectedTimelineStage.conditions.requiredLearningDaysThisWeek} 天
                                </li>
                              )}
                              {selectedTimelineStage.conditions.requiredTargetReached && (
                                <li>
                                  達成季度挑戰指標
                                </li>
                              )}
                              {selectedTimelineStage.conditions.conditionDescription && (
                                <li style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                  說明：{selectedTimelineStage.conditions.conditionDescription}
                                </li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', background: 'white', border: '1px solid rgba(129, 199, 132, 0.25)', borderRadius: '24px', marginBottom: '2rem' }}>
                  <p style={{ color: '#888', margin: 0 }}>您目前尚未選擇任何初始夥伴。請重新登入或聯絡管理員以重啟 onboarding 選擇畫面。</p>
                </div>
              )}

              {/* Items & Badges Owned */}
              <div className="card" style={{ padding: '2rem', background: 'white', border: '1px solid rgba(129, 199, 132, 0.25)', borderRadius: '24px' }}>
                <h3 style={{ color: 'var(--primary-dark)', fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '2px solid var(--green-2)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Award size={20} color="var(--gold-bright)" /> 已解鎖榮譽與獎勵 (Badges & Rewards)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', textAlign: 'center' }}>
                  {pDoc.badges && pDoc.badges.length > 0 ? (
                    pDoc.badges.map((b, i) => (
                      <div key={i} style={{ padding: '1rem', background: '#fffde7', border: '1px solid #fff59d', borderRadius: '12px', color: '#f57f17', fontWeight: 'bold' }}>
                         🏅 {b}
                      </div>
                    ))
                  ) : (
                    <div style={{ gridColumn: '1 / -1', padding: '1rem', color: '#999', fontSize: '0.95rem' }}>
                      目前尚無獲得的徽章獎勵。完成世界季度目標或手動考核來解鎖它們！
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STATS & WRONG ANSWERS TAB */}
          {activeTab === 'stats' && (
            <div className="animate-fade-in">
              {competitionTarget && (
                 <div className="card glass-panel" style={{ padding: '2rem', borderRadius: '24px', marginBottom: '2rem', background: '#ffffff', borderLeft: '8px solid var(--primary-color)' }}>
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
                 <div className="card" style={{ padding: '1.5rem', textAlign: 'center', background: 'white', border: '1px solid rgba(129,199,132,0.2)' }}>
                    <div style={{ color: '#666', marginBottom: '0.5rem' }}>總積分</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--primary-color)' }}>{stats.totalScore}</div>
                 </div>
                 <div className="card" style={{ padding: '1.5rem', textAlign: 'center', background: 'white', border: '1px solid rgba(129,199,132,0.2)' }}>
                    <div style={{ color: '#666', marginBottom: '0.5rem' }}>完成任務數</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#1976D2' }}>{stats.completedAssignments}</div>
                 </div>
                 <div className="card" style={{ padding: '1.5rem', textAlign: 'center', background: 'white', border: '1px solid rgba(129,199,132,0.2)' }}>
                    <div style={{ color: '#666', marginBottom: '0.5rem' }}>累積答對</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#388E3C' }}>{stats.correctAnswers}</div>
                 </div>
              </div>

              <h3 style={{ fontSize: '1.5rem', color: 'var(--primary-dark)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                 <BookX size={24} color="#D32F2F" /> 我的錯題本
              </h3>
              <div className="card" style={{ background: 'white', padding: '2rem', border: '1px solid rgba(129,199,132,0.2)', borderRadius: '16px' }}>
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
          )}
        </div>
      </div>
    </div>
  );
}
