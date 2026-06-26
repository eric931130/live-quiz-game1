import React, { useState } from 'react';
import { doc, setDoc, updateDoc, getDoc, addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { Plus, Copy, RotateCcw, Map, Archive, Edit, Trash2, ChevronDown, ChevronRight, X, Folder, FileText, Check } from 'lucide-react';
import { db, auth } from '../firebase';

export default function WorldStageEditor({ worldsList, roundsList, fetchWorldsAndRounds }) {
  const [showArchivedWorlds, setShowArchivedWorlds] = useState(false);
  const [selectedWorldForEdit, setSelectedWorldForEdit] = useState(null);
  
  // World Edit details
  const [editWorldName, setEditWorldName] = useState('');
  const [editWorldPerfectClear, setEditWorldPerfectClear] = useState(true);
  const [editStagesList, setEditStagesList] = useState([]);
  
  // Create World
  const [showCreateWorldModal, setShowCreateWorldModal] = useState(false);
  const [newWorldName, setNewWorldName] = useState('');

  // Restart Round
  const [worldToRestart, setWorldToRestart] = useState(null);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartTargetStageIndex, setRestartTargetStageIndex] = useState(5);
  const [restartTargetCheckpointId, setRestartTargetCheckpointId] = useState('');
  const [restartTargetQuestionCount, setRestartTargetQuestionCount] = useState(20);
  const [restartTargetDescription, setRestartTargetDescription] = useState('');
  const [restartTargetDeadline, setRestartTargetDeadline] = useState('');
  const [restartLeaderboardLimit, setRestartLeaderboardLimit] = useState(10);

  // Edit Target Progress
  const [selectedRoundForTargetEdit, setSelectedRoundForTargetEdit] = useState(null);
  const [showEditTargetModal, setShowEditTargetModal] = useState(false);
  const [editTargetStageIndex, setEditTargetStageIndex] = useState(5);
  const [editTargetCheckpointId, setEditTargetCheckpointId] = useState('');
  const [editTargetQuestionCount, setEditTargetQuestionCount] = useState(20);
  const [editTargetDescription, setEditTargetDescription] = useState('');
  const [editTargetDeadline, setEditTargetDeadline] = useState('');
  const [editLeaderboardLimit, setEditLeaderboardLimit] = useState(10);

  const logTeacherAudit = async (action, details) => {
    try {
      const userEmail = auth.currentUser?.email || "教師帳號";
      const userUid = auth.currentUser?.uid || "teacher_admin";
      await addDoc(collection(db, "TeacherAuditLogs"), {
        teacherId: userUid,
        teacherEmail: userEmail,
        action,
        details,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error("寫入稽核日誌失敗", err);
    }
  };

  const handleCreateWorld = async () => {
    if (!newWorldName.trim()) return alert("請輸入世界名稱！");
    try {
      const nextWorldNum = worldsList.length > 0 
        ? Math.max(...worldsList.map(w => parseInt(w.id.replace(/\D/g, ''), 10) || 0)) + 1 
        : 1;
      const worldId = `world_${nextWorldNum}`;
      const activeRoundId = `world_${nextWorldNum}_round_1`;

      const newWorld = {
        id: worldId,
        name: newWorldName,
        worldTemplateId: `template_${nextWorldNum}`,
        sourceWorldId: null,
        duplicatedFromWorldId: null,
        restartedFromRoundId: null,
        roundVersion: 1,
        isArchived: false,
        archivedAt: null,
        activeRoundId: activeRoundId,
        perfectClearRequired: true,
        stages: [
          {
            id: 1,
            name: "階段 1",
            perfectClearRequired: true,
            checkpoints: [
              {
                id: "cp_1",
                name: "Checkpoint 1",
                questionCount: 20,
                perfectClearRequired: true
              }
            ]
          }
        ]
      };

      const newRound = {
        id: activeRoundId,
        worldId: worldId,
        roundVersion: 1,
        createdAt: new Date().toISOString(),
        isArchived: false,
        archivedAt: null,
        targetWorldId: worldId,
        targetStageIndex: 5,
        targetDescription: `達到世界 ${nextWorldNum} 第 5 關`,
        leaderboardLimit: 10
      };

      await setDoc(doc(db, "Worlds", worldId), newWorld);
      await setDoc(doc(db, "ChallengeRounds", activeRoundId), newRound);

      await logTeacherAudit("create_world", { worldId, name: newWorldName, activeRoundId });

      alert("✅ 成功建立新世界與首輪挑戰！");
      setNewWorldName("");
      setShowCreateWorldModal(false);
      await fetchWorldsAndRounds();
    } catch (err) {
      alert("建立失敗：" + err.message);
    }
  };

  const handleDuplicateWorld = async (srcWorld) => {
    const confirmCopy = window.confirm(`確定要複製世界「${srcWorld.name}」嗎？這會複製其關卡結構與題庫內容。`);
    if (!confirmCopy) return;

    try {
      const nextWorldNum = worldsList.length > 0 
        ? Math.max(...worldsList.map(w => parseInt(w.id.replace(/\D/g, ''), 10) || 0)) + 1 
        : 1;
      const worldId = `world_${nextWorldNum}`;
      const activeRoundId = `world_${nextWorldNum}_round_1`;

      const newWorld = {
        ...srcWorld,
        id: worldId,
        name: `${srcWorld.name} (複製)`,
        worldTemplateId: `template_${nextWorldNum}`,
        sourceWorldId: srcWorld.id,
        duplicatedFromWorldId: srcWorld.id,
        restartedFromRoundId: null,
        roundVersion: 1,
        isArchived: false,
        archivedAt: null,
        activeRoundId: activeRoundId
      };

      let targetStage = 5;
      let targetDescription = `達到世界 ${nextWorldNum} 第 5 關`;
      let leaderboardLimit = 10;
      if (srcWorld.activeRoundId) {
        const srcRoundSnap = await getDoc(doc(db, "ChallengeRounds", srcWorld.activeRoundId));
        if (srcRoundSnap.exists()) {
          const srcRound = srcRoundSnap.data();
          targetStage = srcRound.targetStageIndex || 5;
          targetDescription = srcRound.targetDescription || `達到世界 ${nextWorldNum} 第 ${targetStage} 關`;
          leaderboardLimit = srcRound.leaderboardLimit || 10;
        }
      }

      const newRound = {
        id: activeRoundId,
        worldId: worldId,
        roundVersion: 1,
        createdAt: new Date().toISOString(),
        isArchived: false,
        archivedAt: null,
        targetWorldId: worldId,
        targetStageIndex: targetStage,
        targetDescription: targetDescription,
        leaderboardLimit: leaderboardLimit
      };

      await setDoc(doc(db, "Worlds", worldId), newWorld);
      await setDoc(doc(db, "ChallengeRounds", activeRoundId), newRound);

      // Duplicate questions in QuizBanks
      const srcNumeric = parseInt(srcWorld.id.replace(/\D/g, ''), 10) || srcWorld.id;
      const q1 = query(collection(db, "QuizBanks"), where("world", "in", [srcWorld.id, srcNumeric, String(srcNumeric)]));
      const snap = await getDocs(q1);
      
      const duplicatePromises = [];
      snap.forEach(d => {
        const bankData = d.data();
        const newBank = {
          ...bankData,
          world: worldId,
          name: `${bankData.name} (複製)`,
          createdAt: new Date().toISOString()
        };
        duplicatePromises.push(addDoc(collection(db, "QuizBanks"), newBank));
      });
      if (duplicatePromises.length > 0) {
        await Promise.all(duplicatePromises);
      }

      await logTeacherAudit("duplicate_world", { srcWorldId: srcWorld.id, newWorldId: worldId });
      alert("✅ 世界與題庫複製完成！");
      await fetchWorldsAndRounds();
    } catch (err) {
      alert("複製失敗：" + err.message);
    }
  };

  const handleRestartRound = async () => {
    if (!worldToRestart) return;
    const confirmRestart = window.confirm(`⚠️ 警告：確定要將世界「${worldToRestart.name}」重開為新的挑戰輪次嗎？\n\n這將會：\n1. 建立新的挑戰輪次，學員進度重新由零開始。\n2. 前一輪的學員進度將會封存，歷史資料仍可透過下拉選單查詢。\n3. 排行榜將會清空重新計算。`);
    if (!confirmRestart) return;

    try {
      const nextRoundVer = (worldToRestart.roundVersion || 1) + 1;
      const newRoundId = `${worldToRestart.id}_round_${nextRoundVer}`;

      const newRound = {
        id: newRoundId,
        worldId: worldToRestart.id,
        roundVersion: nextRoundVer,
        createdAt: new Date().toISOString(),
        isArchived: false,
        archivedAt: null,
        targetWorldId: worldToRestart.id,
        targetStageIndex: parseInt(restartTargetStageIndex, 10) || 5,
        targetCheckpointId: restartTargetCheckpointId || null,
        targetQuestionCount: parseInt(restartTargetQuestionCount, 10) || null,
        targetDescription: restartTargetDescription || `達到世界 ${worldToRestart.id.replace(/\D/g, '')} 第 ${restartTargetStageIndex} 關`,
        targetDeadline: restartTargetDeadline || null,
        leaderboardLimit: parseInt(restartLeaderboardLimit, 10) || 10
      };

      await updateDoc(doc(db, "Worlds", worldToRestart.id), {
        activeRoundId: newRoundId,
        roundVersion: nextRoundVer,
        restartedFromRoundId: worldToRestart.activeRoundId || null
      });

      await setDoc(doc(db, "ChallengeRounds", newRoundId), newRound);

      await setDoc(doc(db, "CompetitionRound", "current"), {
        ...newRound,
        id: "current",
        activeRoundId: newRoundId
      });

      await logTeacherAudit("restart_world", {
        worldId: worldToRestart.id,
        oldRoundId: worldToRestart.activeRoundId || null,
        newRoundId: newRoundId,
        roundVersion: nextRoundVer,
        targetStageIndex: restartTargetStageIndex
      });

      alert("✅ 成功開啟新挑戰輪次！學員進度與排行榜已重置，舊輪次已封存。");
      setWorldToRestart(null);
      setShowRestartModal(false);
      await fetchWorldsAndRounds();
    } catch (err) {
      alert("重開挑戰輪次失敗：" + err.message);
    }
  };

  const handleArchiveWorld = async (world) => {
    const actionText = world.isArchived ? "解封" : "封存";
    const confirmArchive = window.confirm(`確定要${actionText}世界「${world.name}」嗎？\n\n這會將此世界在學員挑戰選單中${world.isArchived ? "顯示" : "隱藏"}，但不會刪除任何歷史挑戰資料。`);
    if (!confirmArchive) return;

    try {
      await updateDoc(doc(db, "Worlds", world.id), {
        isArchived: !world.isArchived,
        archivedAt: !world.isArchived ? new Date().toISOString() : null
      });

      await logTeacherAudit("archive_world", { worldId: world.id, isArchived: !world.isArchived });
      alert(`✅ 已成功${actionText}世界！`);
      await fetchWorldsAndRounds();
    } catch (err) {
      alert("操作失敗：" + err.message);
    }
  };

  const handleChangeTargetProgress = async () => {
    if (!selectedRoundForTargetEdit) return;
    try {
      const roundRef = doc(db, "ChallengeRounds", selectedRoundForTargetEdit.id);
      await updateDoc(roundRef, {
        targetStageIndex: parseInt(editTargetStageIndex, 10) || 5,
        targetCheckpointId: editTargetCheckpointId || null,
        targetQuestionCount: parseInt(editTargetQuestionCount, 10) || null,
        targetDescription: editTargetDescription,
        targetDeadline: editTargetDeadline || null,
        leaderboardLimit: parseInt(editLeaderboardLimit, 10) || 10
      });

      const currentSnap = await getDoc(doc(db, "CompetitionRound", "current"));
      if (currentSnap.exists() && currentSnap.data().activeRoundId === selectedRoundForTargetEdit.id) {
        await setDoc(doc(db, "CompetitionRound", "current"), {
          ...selectedRoundForTargetEdit,
          targetStageIndex: parseInt(editTargetStageIndex, 10) || 5,
          targetCheckpointId: editTargetCheckpointId || null,
          targetQuestionCount: parseInt(editTargetQuestionCount, 10) || null,
          targetDescription: editTargetDescription,
          targetDeadline: editTargetDeadline || null,
          leaderboardLimit: parseInt(editLeaderboardLimit, 10) || 10
        }, { merge: true });
      }

      await logTeacherAudit("change_target_progress", {
        roundId: selectedRoundForTargetEdit.id,
        targetStageIndex: editTargetStageIndex,
        targetDescription: editTargetDescription
      });

      alert("✅ 目標進度更新成功！");
      setShowEditTargetModal(false);
      setSelectedRoundForTargetEdit(null);
      await fetchWorldsAndRounds();
    } catch (err) {
      alert("更新失敗：" + err.message);
    }
  };

  const handleSaveStages = async () => {
    if (!selectedWorldForEdit) return;
    if (!editWorldName.trim()) return alert("請輸入世界名稱！");
    try {
      await updateDoc(doc(db, "Worlds", selectedWorldForEdit.id), {
        name: editWorldName,
        perfectClearRequired: editWorldPerfectClear,
        stages: editStagesList
      });

      await logTeacherAudit("update_world_structure", {
        worldId: selectedWorldForEdit.id,
        name: editWorldName,
        perfectClearRequired: editWorldPerfectClear,
        stagesCount: editStagesList.length
      });

      alert("✅ 世界關卡結構變更儲存成功！");
      setSelectedWorldForEdit(null);
      await fetchWorldsAndRounds();
    } catch (err) {
      alert("儲存失敗：" + err.message);
    }
  };



  return (
    <div className="animate-fade-in" style={{ width: '100%' }}>
      <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
         🗺️ 闖關大世界與關卡設定
      </h3>

      {/* Worlds Table Card */}
      <div className="card glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', background: 'white', marginBottom: '2rem' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', color: '#555', cursor: 'pointer' }}>
               <input type="checkbox" checked={showArchivedWorlds} onChange={e => setShowArchivedWorlds(e.target.checked)} style={{ width: '16px', height: '16px' }} />
               顯示已封存世界
            </label>
            <button onClick={() => setShowCreateWorldModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.75rem 1.25rem', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
               <Plus size={18} /> 建立新世界圖
            </button>
         </div>

         <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
               <thead>
                  <tr style={{ background: '#f5f7fa', borderBottom: '2px solid #cfd8dc' }}>
                     <th style={{ padding: '1rem' }}>世界代碼</th>
                     <th style={{ padding: '1rem' }}>名稱</th>
                     <th style={{ padding: '1rem' }}>目前挑戰輪次</th>
                     <th style={{ padding: '1rem' }}>輪次版本</th>
                     <th style={{ padding: '1rem' }}>滿分通關限制</th>
                     <th style={{ padding: '1rem' }}>目標進度設定</th>
                     <th style={{ padding: '1rem' }}>狀態</th>
                     <th style={{ padding: '1rem' }}>管理操作</th>
                  </tr>
               </thead>
               <tbody>
                  {worldsList.filter(w => showArchivedWorlds || !w.isArchived).map(w => {
                     const roundDetails = roundsList.find(r => r.id === w.activeRoundId);
                     return (
                        <tr key={w.id} style={{ borderBottom: '1px solid #eceff1' }}>
                           <td style={{ padding: '1rem', fontWeight: 'bold' }}>{w.id}</td>
                           <td style={{ padding: '1rem', fontWeight: 'bold', color: 'var(--primary-dark)' }}>{w.name}</td>
                           <td style={{ padding: '1rem' }}>
                              <span style={{ fontFamily: 'monospace', background: '#f1f1f1', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{w.activeRoundId}</span>
                           </td>
                           <td style={{ padding: '1rem', fontWeight: 'bold' }}>V{w.roundVersion || 1}</td>
                           <td style={{ padding: '1rem' }}>
                              <button 
                                 onClick={async () => {
                                    const updatedVal = !w.perfectClearRequired;
                                    await updateDoc(doc(db, "Worlds", w.id), { perfectClearRequired: updatedVal });
                                    await fetchWorldsAndRounds();
                                 }}
                                 style={{ padding: '0.2rem 0.6rem', border: '1px solid #ccc', background: w.perfectClearRequired ? '#e8f5e9' : '#fafafa', color: w.perfectClearRequired ? '#2e7d32' : '#777', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                 {w.perfectClearRequired ? "強制滿分" : "一般通關"}
                              </button>
                           </td>
                           <td style={{ padding: '1rem' }}>
                              {roundDetails ? (
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.9rem', color: '#555' }}>
                                       世界 {roundDetails.targetWorldId?.replace(/\D/g, '')} - 關卡 {roundDetails.targetStageIndex} ({roundDetails.targetDescription || '無說明'})
                                    </span>
                                    <button 
                                       onClick={() => {
                                          setSelectedRoundForTargetEdit(roundDetails);
                                          setEditTargetStageIndex(roundDetails.targetStageIndex || 5);
                                          setEditTargetCheckpointId(roundDetails.targetCheckpointId || '');
                                          setEditTargetQuestionCount(roundDetails.targetQuestionCount || 20);
                                          setEditTargetDescription(roundDetails.targetDescription || '');
                                          setEditTargetDeadline(roundDetails.targetDeadline || '');
                                          setEditLeaderboardLimit(roundDetails.leaderboardLimit || 10);
                                          setShowEditTargetModal(true);
                                       }}
                                       style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--primary-color)' }}
                                       title="編輯目標設定"
                                    >
                                       <Edit size={14} />
                                    </button>
                                 </div>
                              ) : "-"}
                           </td>
                           <td style={{ padding: '1rem' }}>
                              {w.isArchived ? (
                                 <span style={{ background: '#ffebee', color: '#c62828', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>已封存</span>
                              ) : (
                                 <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>啟用中</span>
                              )}
                           </td>
                           <td style={{ padding: '1rem' }}>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                 <button 
                                    onClick={() => {
                                       setSelectedWorldForEdit(w);
                                       setEditWorldName(w.name);
                                       setEditWorldPerfectClear(w.perfectClearRequired !== false);
                                       setEditStagesList(w.stages || []);
                                    }}
                                    style={{ padding: '0.4rem 0.8rem', background: '#3f51b5', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                 >
                                    <Edit size={14} /> 編輯關卡
                                 </button>
                                 <button 
                                    onClick={() => {
                                       setWorldToRestart(w);
                                       setRestartTargetStageIndex(5);
                                       setRestartTargetCheckpointId('');
                                       setRestartTargetQuestionCount(20);
                                       setRestartTargetDescription(`達到世界 ${w.id.replace(/\D/g, '')} 第 5 關`);
                                       setRestartTargetDeadline('');
                                       setRestartLeaderboardLimit(10);
                                       setShowRestartModal(true);
                                    }}
                                    style={{ padding: '0.4rem 0.8rem', background: '#009688', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                 >
                                    <RotateCcw size={14} /> 重開輪次
                                 </button>
                                 <button 
                                    onClick={() => handleDuplicateWorld(w)}
                                    style={{ padding: '0.4rem 0.8rem', background: '#ff9800', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                 >
                                    <Copy size={14} /> 複製
                                 </button>
                                 <button 
                                    onClick={() => handleArchiveWorld(w)}
                                    style={{ padding: '0.4rem 0.8rem', background: w.isArchived ? '#4caf50' : '#e53935', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                 >
                                    <Archive size={14} /> {w.isArchived ? "解封" : "封存"}
                                 </button>
                              </div>
                           </td>
                        </tr>
                     );
                  })}
               </tbody>
            </table>
         </div>
      </div>

      {/* Stage/Checkpoint Editor Section */}
      {selectedWorldForEdit && (
         <div className="card glass-panel animate-slide-up" style={{ padding: '1.5rem', borderRadius: '16px', background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--primary-light)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
               <div>
                  <h4 style={{ color: 'var(--primary-dark)', fontSize: '1.4rem', margin: 0 }}>
                     🛠️ 關卡結構編輯器 - {selectedWorldForEdit.id}
                  </h4>
                  <span style={{ fontSize: '0.9rem', color: '#666' }}>編輯將直接套用於所有新發起的挑戰與答題內容</span>
               </div>
               <button onClick={() => setSelectedWorldForEdit(null)} style={{ padding: '0.5rem 1rem', background: '#ccc', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                  關閉編輯器
               </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
               <div>
                  <label style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>世界名稱</label>
                  <input type="text" className="input-field" style={{ width: '100%' }} value={editWorldName} onChange={e => setEditWorldName(e.target.value)} />
               </div>
               <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
                     <input type="checkbox" checked={editWorldPerfectClear} onChange={e => setEditWorldPerfectClear(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                     強制滿分通關才能晉級下一個 Checkpoint (世界層級)
                  </label>
               </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
               {editStagesList.map((st, sIdx) => (
                  <div key={sIdx} style={{ border: '1px solid #cfd8dc', borderRadius: '12px', background: '#fcfdfe', padding: '1.2rem' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '0.8rem', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                           <span style={{ background: 'var(--primary-color)', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                              階段 {st.id}
                           </span>
                           <input 
                              type="text" 
                              className="input-field" 
                              style={{ width: '200px', marginBottom: 0, padding: '0.4rem 0.8rem' }} 
                              value={st.name} 
                              onChange={e => {
                                 const val = e.target.value;
                                 setEditStagesList(prev => prev.map((s, idx) => idx === sIdx ? { ...s, name: val } : s));
                              }} 
                           />
                           <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}>
                              <input 
                                 type="checkbox" 
                                 checked={st.perfectClearRequired !== false} 
                                 onChange={e => {
                                    const val = e.target.checked;
                                    setEditStagesList(prev => prev.map((s, idx) => idx === sIdx ? { ...s, perfectClearRequired: val } : s));
                                 }} 
                              />
                              階段強制滿分
                           </label>
                        </div>
                        <button 
                           onClick={() => {
                              const confirmDel = window.confirm(`確定要刪除「階段 ${st.id}」嗎？這將會刪除該階段內所有的 Checkpoints！`);
                              if (confirmDel) {
                                 setEditStagesList(prev => prev.filter((_, idx) => idx !== sIdx).map((s, idx) => ({ ...s, id: idx + 1 })));
                              }
                           }} 
                           style={{ padding: '0.3rem 0.6rem', background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.85rem' }}
                        >
                           <Trash2 size={14} /> 刪除階段
                        </button>
                     </div>

                     <div style={{ background: '#f5f7fa', padding: '1rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#555' }}>📍 檢查點 (Checkpoints)</span>
                           <button 
                              onClick={() => {
                                 const newCp = {
                                    id: `cp_${st.id}_${(st.checkpoints || []).length + 1}`,
                                    name: `Checkpoint ${(st.checkpoints || []).length + 1}`,
                                    questionCount: 20,
                                    perfectClearRequired: true
                                 };
                                 setEditStagesList(prev => prev.map((s, idx) => idx === sIdx ? { ...s, checkpoints: [...(s.checkpoints || []), newCp] } : s));
                              }}
                              style={{ padding: '0.3rem 0.6rem', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                           >
                              <Plus size={12} /> 新增 Checkpoint
                           </button>
                        </div>

                        {(!st.checkpoints || st.checkpoints.length === 0) ? (
                           <p style={{ fontSize: '0.85rem', color: '#888', textAlign: 'center', padding: '0.5rem' }}>此階段無任何檢查點。</p>
                        ) : (
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                              {st.checkpoints.map((cp, cpIdx) => (
                                 <div key={cpIdx} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#fff', padding: '0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '0.85rem', color: '#777', fontWeight: 'bold', fontFamily: 'monospace' }}>{cp.id}</span>
                                    <input 
                                       type="text" 
                                       className="input-field" 
                                       style={{ flex: 2, marginBottom: 0, padding: '0.3rem 0.6rem', fontSize: '0.9rem' }} 
                                       value={cp.name} 
                                       onChange={e => {
                                          const val = e.target.value;
                                          setEditStagesList(prev => prev.map((s, idx) => idx === sIdx ? {
                                             ...s,
                                             checkpoints: s.checkpoints.map((c, cIdx) => cIdx === cpIdx ? { ...c, name: val } : c)
                                          } : s));
                                       }}
                                    />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                       <span style={{ fontSize: '0.85rem', color: '#555' }}>題數:</span>
                                       <input 
                                          type="number" 
                                          className="input-field" 
                                          style={{ width: '70px', marginBottom: 0, padding: '0.3rem 0.6rem', fontSize: '0.9rem', textAlign: 'center' }} 
                                          value={cp.questionCount || 20} 
                                          min="1"
                                          onChange={e => {
                                             const val = parseInt(e.target.value, 10) || 20;
                                             setEditStagesList(prev => prev.map((s, idx) => idx === sIdx ? {
                                                ...s,
                                                checkpoints: s.checkpoints.map((c, cIdx) => cIdx === cpIdx ? { ...c, questionCount: val } : c)
                                             } : s));
                                          }}
                                       />
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}>
                                       <input 
                                          type="checkbox" 
                                          checked={cp.perfectClearRequired !== false} 
                                          onChange={e => {
                                             const val = e.target.checked;
                                             setEditStagesList(prev => prev.map((s, idx) => idx === sIdx ? {
                                                ...s,
                                                checkpoints: s.checkpoints.map((c, cIdx) => cIdx === cpIdx ? { ...c, perfectClearRequired: val } : c)
                                             } : s));
                                          }}
                                       />
                                       強制滿分
                                    </label>
                                    <button 
                                       onClick={() => {
                                          const confirmDelCp = window.confirm("確定要刪除此 Checkpoint 嗎？");
                                          if (confirmDelCp) {
                                             setEditStagesList(prev => prev.map((s, idx) => idx === sIdx ? {
                                                ...s,
                                                checkpoints: s.checkpoints.filter((_, cIdx) => cIdx !== cpIdx)
                                             } : s));
                                          }
                                       }}
                                       style={{ padding: '0.2rem', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e53935', display: 'flex', alignItems: 'center' }}
                                    >
                                       <Trash2 size={16} />
                                    </button>
                                 </div>
                              ))}
                           </div>
                        )}
                     </div>
                  </div>
               ))}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
               <button 
                  onClick={() => {
                     const newStage = {
                        id: editStagesList.length + 1,
                        name: `階段 ${editStagesList.length + 1}`,
                        perfectClearRequired: true,
                        checkpoints: [
                           {
                              id: `cp_${editStagesList.length + 1}_1`,
                              name: "Checkpoint 1",
                              questionCount: 20,
                              perfectClearRequired: true
                           }
                        ]
                     };
                     setEditStagesList(prev => [...prev, newStage]);
                  }}
                  style={{ padding: '0.8rem 1.5rem', background: '#f5f5f5', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
               >
                  <Plus size={18} /> 新增階段 Stage
               </button>
               <button 
                  onClick={handleSaveStages}
                  style={{ padding: '0.8rem 2rem', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
               >
                  <Check size={18} /> 儲存世界關卡變更
               </button>
            </div>
         </div>
      )}

      {/* Create World Modal */}
      {showCreateWorldModal && (
         <div className="app-tool-window-modal-overlay" onClick={() => setShowCreateWorldModal(false)}>
            <div className="app-tool-window-modal animate-pop-in" style={{ width: '100%', maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
               <div className="app-tool-window-header">
                  <div className="app-tool-window-header-title">
                     <button onClick={() => setShowCreateWorldModal(false)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}>
                        <ArrowLeft size={20} /> 返回
                     </button>
                     <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
                     <span>🆕 建立新世界圖</span>
                  </div>
                  <div className="app-tool-window-controls">
                     <span className="app-tool-window-control-dot minimize" />
                     <span className="app-tool-window-control-dot maximize" />
                     <span className="app-tool-window-control-dot close" onClick={() => setShowCreateWorldModal(false)} title="關閉" />
                  </div>
               </div>
               <div style={{ padding: '1.5rem' }}>
                  <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>世界名稱</label>
                  <input 
                     type="text" 
                     className="input-field" 
                     placeholder="例如：世界 21: ESG 金融實務指標" 
                     style={{ width: '100%' }} 
                     value={newWorldName} 
                     onChange={e => setNewWorldName(e.target.value)} 
                  />
               </div>
               <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', padding: '1.5rem', borderTop: '1px solid rgba(214, 168, 79, 0.2)', background: 'transparent' }}>
                  <button onClick={() => setShowCreateWorldModal(false)} style={{ padding: '0.6rem 1.2rem', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>取消</button>
                  <button onClick={handleCreateWorld} style={{ padding: '0.6rem 1.2rem', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>建立</button>
               </div>
            </div>
         </div>
      )}

      {/* Restart Round Modal */}
      {showRestartModal && worldToRestart && (
         <div className="app-tool-window-modal-overlay" onClick={() => setShowRestartModal(false)}>
            <div className="app-tool-window-modal animate-pop-in" style={{ width: '100%', maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
               <div className="app-tool-window-header">
                  <div className="app-tool-window-header-title">
                     <button onClick={() => setShowRestartModal(false)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}>
                        <ArrowLeft size={20} /> 返回
                     </button>
                     <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
                     <span>🔄 重開「{worldToRestart.name}」新挑戰輪次</span>
                  </div>
                  <div className="app-tool-window-controls">
                     <span className="app-tool-window-control-dot minimize" />
                     <span className="app-tool-window-control-dot maximize" />
                     <span className="app-tool-window-control-dot close" onClick={() => setShowRestartModal(false)} title="關閉" />
                  </div>
               </div>
               <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '60vh', overflowY: 'auto' }}>
                  <p style={{ color: '#ef5350', fontWeight: 'bold', fontSize: '0.95rem', margin: 0, padding: '0.8rem', background: 'rgba(229,57,53,0.1)', border: '1px solid rgba(229,57,53,0.2)', borderRadius: '8px' }}>
                     ⚠️ 確定要開啟新的一輪挑戰嗎？前一輪學員進度與排行榜將會被歸檔，新一輪進度從零開始。
                  </p>
                  <div>
                     <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.3rem' }}>目標通關階段 (Stage Index)</label>
                     <select className="input-field" style={{ width: '100%' }} value={restartTargetStageIndex} onChange={e => setRestartTargetStageIndex(e.target.value)}>
                        {Array.from({ length: 10 }, (_, i) => (
                           <option key={i+1} value={i+1} style={{ background: '#14532D', color: '#fff' }}>達到第 {i+1} 階段</option>
                        ))}
                     </select>
                  </div>
                  <div>
                     <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.3rem' }}>目標 Checkpoint ID (可選)</label>
                     <input type="text" placeholder="例如：cp_5" className="input-field" style={{ width: '100%' }} value={restartTargetCheckpointId} onChange={e => setRestartTargetCheckpointId(e.target.value)} />
                  </div>
                  <div>
                     <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.3rem' }}>目標挑戰題目數 (可選)</label>
                     <input type="number" placeholder="例如：20" className="input-field" style={{ width: '100%' }} value={restartTargetQuestionCount} onChange={e => setRestartTargetQuestionCount(e.target.value)} />
                  </div>
                  <div>
                     <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.3rem' }}>目標描述文字</label>
                     <input type="text" placeholder="例如：首位達到世界 1 第 5 階段即獲勝" className="input-field" style={{ width: '100%' }} value={restartTargetDescription} onChange={e => setRestartTargetDescription(e.target.value)} />
                  </div>
                  <div>
                     <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.3rem' }}>截止挑戰時間 (可選)</label>
                     <input type="datetime-local" className="input-field" style={{ width: '100%' }} value={restartTargetDeadline} onChange={e => setRestartTargetDeadline(e.target.value)} />
                  </div>
                  <div>
                     <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.3rem' }}>排行榜顯示人數 (5 或 10)</label>
                     <select className="input-field" style={{ width: '100%' }} value={restartLeaderboardLimit} onChange={e => setRestartLeaderboardLimit(e.target.value)}>
                        <option value="5" style={{ background: '#14532D', color: '#fff' }}>顯示前 5 名</option>
                        <option value="10" style={{ background: '#14532D', color: '#fff' }}>顯示前 10 名</option>
                     </select>
                  </div>
               </div>
               <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', padding: '1.5rem', borderTop: '1px solid rgba(214, 168, 79, 0.2)', background: 'transparent' }}>
                  <button onClick={() => setShowRestartModal(false)} style={{ padding: '0.6rem 1.2rem', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>取消</button>
                  <button onClick={handleRestartRound} style={{ padding: '0.6rem 1.2rem', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>確認重開</button>
               </div>
            </div>
         </div>
      )}

      {/* Edit Target Modal */}
      {showEditTargetModal && selectedRoundForTargetEdit && (
         <div className="app-tool-window-modal-overlay" onClick={() => setShowEditTargetModal(false)}>
            <div className="app-tool-window-modal animate-pop-in" style={{ width: '100%', maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
               <div className="app-tool-window-header">
                  <div className="app-tool-window-header-title">
                     <button onClick={() => setShowEditTargetModal(false)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}>
                        <ArrowLeft size={20} /> 返回
                     </button>
                     <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
                     <span>✏️ 編輯挑戰輪次目標設定</span>
                  </div>
                  <div className="app-tool-window-controls">
                     <span className="app-tool-window-control-dot minimize" />
                     <span className="app-tool-window-control-dot maximize" />
                     <span className="app-tool-window-control-dot close" onClick={() => setShowEditTargetModal(false)} title="關閉" />
                  </div>
               </div>
               <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '60vh', overflowY: 'auto' }}>
                  <div>
                     <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.3rem' }}>目標通關階段 (Stage Index)</label>
                     <select className="input-field" style={{ width: '100%' }} value={editTargetStageIndex} onChange={e => setEditTargetStageIndex(e.target.value)}>
                        {Array.from({ length: 10 }, (_, i) => (
                           <option key={i+1} value={i+1} style={{ background: '#14532D', color: '#fff' }}>達到第 {i+1} 階段</option>
                        ))}
                     </select>
                  </div>
                  <div>
                     <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.3rem' }}>目標 Checkpoint ID (可選)</label>
                     <input type="text" className="input-field" style={{ width: '100%' }} value={editTargetCheckpointId} onChange={e => setEditTargetCheckpointId(e.target.value)} />
                  </div>
                  <div>
                     <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.3rem' }}>目標挑戰題目數 (可選)</label>
                     <input type="number" className="input-field" style={{ width: '100%' }} value={editTargetQuestionCount} onChange={e => setEditTargetQuestionCount(e.target.value)} />
                  </div>
                  <div>
                     <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.3rem' }}>目標描述文字</label>
                     <input type="text" className="input-field" style={{ width: '100%' }} value={editTargetDescription} onChange={e => setEditTargetDescription(e.target.value)} />
                  </div>
                  <div>
                     <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.3rem' }}>截止挑戰時間 (可選)</label>
                     <input type="datetime-local" className="input-field" style={{ width: '100%' }} value={editTargetDeadline} onChange={e => setEditTargetDeadline(e.target.value)} />
                  </div>
                  <div>
                     <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.3rem' }}>排行榜顯示人數 (5 或 10)</label>
                     <select className="input-field" style={{ width: '100%' }} value={editLeaderboardLimit} onChange={e => setEditLeaderboardLimit(e.target.value)}>
                        <option value="5" style={{ background: '#14532D', color: '#fff' }}>顯示前 5 名</option>
                        <option value="10" style={{ background: '#14532D', color: '#fff' }}>顯示前 10 名</option>
                     </select>
                  </div>
               </div>
               <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', padding: '1.5rem', borderTop: '1px solid rgba(214, 168, 79, 0.2)', background: 'transparent' }}>
                  <button onClick={() => setShowEditTargetModal(false)} style={{ padding: '0.6rem 1.2rem', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>取消</button>
                  <button onClick={handleChangeTargetProgress} style={{ padding: '0.6rem 1.2rem', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>儲存變更</button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}
