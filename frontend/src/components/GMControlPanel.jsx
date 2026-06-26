import React, { useState, useEffect, useCallback } from 'react';
import { 
  Shield, Users, Trophy, Award, BookOpen, Layers, Volume2, Globe, Clock, 
  FileSpreadsheet, History, Sparkles, Plus, Edit, Trash, Eye, EyeOff, Check, X, 
  RefreshCw, Copy, Archive, ArrowLeft, Download, Search
} from 'lucide-react';
import { questionBankApi } from '../questionBankApi';
const compressImage = (file, maxWidth = 300, maxHeight = 300, quality = 0.75) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function GMControlPanel({ onGoBack, user }) {
  const [activeTab, setActiveTab] = useState('Overview');
  
  // Loading & Error states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Data lists
  const [studentsList, setStudentsList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [items, setItems] = useState([]);
  const [introductions, setIntroductions] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [pointTransactions, setPointTransactions] = useState([]);

  // Reveal email state
  const [revealedEmails, setRevealedEmails] = useState({});

  // Point / Reward Grant Form States
  const [selectedStudents, setSelectedStudents] = useState([]); // Array of student IDs
  const [grantTarget, setGrantTarget] = useState('selected'); // 'selected' or 'all'
  const [rewardType, setRewardType] = useState('points'); // points, badges, tokens, outfits, items, stage_unlock
  const [rewardAmount, setRewardAmount] = useState(100);
  const [rewardDetail, setRewardDetail] = useState('');
  const [grantReason, setGrantReason] = useState('季度學習獎勵');

  // CRUD Forms States
  // Characters & Evolution
  const [charSubTab, setCharSubTab] = useState('chains'); // 'chains' | 'upload' | 'players'
  const [evolutionChains, setEvolutionChains] = useState([]);
  const [playerProgressList, setPlayerProgressList] = useState([]);
  const [activeChainValidation, setActiveChainValidation] = useState(null);
  const [allowCharChange, setAllowCharChange] = useState(false);
  const [libraryModalStageIndex, setLibraryModalStageIndex] = useState(null);

  const initialChainForm = {
    character: {
      characterCode: '',
      name: '',
      type: 'Indicator',
      rarity: 'Normal',
      description: '',
      isStarterAvailable: true,
      isActive: true
    },
    stages: Array.from({ length: 6 }, (_, i) => ({
      stageNumber: i + 1,
      stageName: '',
      stageTitle: '',
      description: '',
      imageUrl: '',
      thumbnailUrl: '',
      conditions: {
        conditionName: '',
        conditionDescription: '',
        requiredPoints: '',
        requiredPerfectClears: '',
        requiredCheckpointClears: '',
        requiredWorldId: '',
        requiredStageIndex: '',
        requiredCheckpointIndex: '',
        requiredBadgeIds: [],
        requiredTokenIds: [],
        requiredItemIds: [],
        requiredLoginDays: '',
        requiredLearningDaysThisWeek: '',
        requiredTargetReached: false,
        customRuleJson: ''
      }
    }))
  };

  const [chainForm, setChainForm] = useState(initialChainForm);
  const [isEditingChain, setIsEditingChain] = useState(false);
  const [editingChainId, setEditingChainId] = useState(null);
  const [isPreviewingChain, setIsPreviewingChain] = useState(false);
  
  // Legacy Character states kept for compatibility
  const [charForm] = useState({ id: '', name: '', description: '', unlockConditions: '', avatarSymbol: '🧑‍🚀', imageUrl: '' });

  
  // Scenes
  const [sceneForm, setSceneForm] = useState({ id: '', name: '', description: '', linkedWorldId: '', imageUrl: '' });
  const [isEditingScene, setIsEditingScene] = useState(false);

  // Items
  const [itemForm, setItemForm] = useState({ id: '', name: '', description: '', effect: '' });
  const [isEditingItem, setIsEditingItem] = useState(false);

  // Introductions
  const [introForm, setIntroForm] = useState({ id: '', targetType: 'general', targetId: '', title: '', content: '' });
  const [isEditingIntro, setIsEditingIntro] = useState(false);

  // Announcements
  const [annForm, setAnnForm] = useState({ id: '', title: '', content: '', status: 'active' });
  const [isEditingAnn, setIsEditingAnn] = useState(false);

  // Worlds & Levels Form States
  const [worldForm, setWorldForm] = useState({ worldId: '1', stageId: '1', checkpointId: 'CP-1', perfectClearRequired: true, targetProgress: 'All' });
  const [restartForm, setRestartForm] = useState({ worldId: '1', roundId: 'legacy' });
  const [duplicateForm, setDuplicateForm] = useState({ srcWorldId: '1', newWorldId: '2', newWorldName: 'SDGs 第 2 世界' });
  const [archiveWorldId, setArchiveWorldId] = useState('1');

  // Manual Progress Adjustment Form States
  const [progressAdjust, setProgressAdjust] = useState({ playerId: '', roundId: 'legacy', worldId: '1', stageId: '1', checkpointId: 'CP-1', isPerfect: true });

  // Question Bank Upload Preview States
  const [questionBankFile, setQuestionBankFile] = useState(null);
  const [importValidOnly, setImportValidOnly] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [bankMetadata, setBankMetadata] = useState({ title: '', subject: 'ESG 永續金融', gradeLevel: '大專院校', visibility: 'public', chapter: '第 1 章' });

  // Search queries
  const [studentSearch, setStudentSearch] = useState('');

  // Image Library States
  const [imagesLibrary, setImagesLibrary] = useState([]);
  const [showImageLibraryModal, setShowImageLibraryModal] = useState(false);
  const [libraryModalTarget, setLibraryModalTarget] = useState(''); // 'character' | 'scene'

  // Fetch API base URL
  const isLocalDevHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const API_BASE = isLocalDevHost ? 'http://localhost:3001' : 'https://live-quiz-game1.onrender.com';

  // Helper: Get headers for API
  const getHeaders = useCallback(async () => {
    const token = user?.getIdToken ? await user.getIdToken() : null;
    return {
      'Content-Type': 'application/json',
      'x-user-id': user?.uid || 'anonymous-teacher',
      'x-user-email': user?.email || '',
      'x-user-name': user?.displayName || user?.email || '',
      'x-user-role': 'gm_teacher_admin',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }, [user]);

  const logGMAction = useCallback(async (actor, actionType, targetType, targetId, description, metadata = {}) => {
    try {
      await fetch(`${API_BASE}/api/admin/log-action`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ actionType, targetType, targetId, description, metadata })
      });
    } catch (err) {
      console.error("Failed to log GM action:", err);
    }
  }, [API_BASE, getHeaders]);

  // Show status utility
  const flashSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const flashError = (msg) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4000);
  };

  // Loaders
  const fetchStudents = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/all-users`, { headers: await getHeaders() });
      if (!response.ok) throw new Error('無法載入學員資料');
      const data = await response.json();
      setStudentsList(data);
    } catch (err) {
      console.error(err);
    }
  }, [API_BASE, getHeaders]);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/gm-logs`, { headers: await getHeaders() });
      if (!response.ok) throw new Error('無法載入日誌');
      const data = await response.json();
      setAuditLogs(data);
    } catch (err) {
      console.error(err);
    }
  }, [API_BASE, getHeaders]);

  const fetchEvolutionChains = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/evolution-chains`, { headers: await getHeaders() });
      if (!response.ok) throw new Error('無法載入進化鏈資料');
      const data = await response.json();
      setEvolutionChains(data);
    } catch (err) {
      console.error(err);
    }
  }, [API_BASE, getHeaders]);

  const fetchPlayerProgressList = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/player-character-progress`, { headers: await getHeaders() });
      if (!response.ok) throw new Error('無法載入學員進度');
      const data = await response.json();
      setPlayerProgressList(data);
    } catch (err) {
      console.error(err);
    }
  }, [API_BASE, getHeaders]);

  const fetchSystemSettings = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/system-settings/character`);
      if (response.ok) {
        const data = await response.json();
        setAllowCharChange(!!data.allowCharacterChange);
      }
    } catch (err) {
      console.error("Failed to fetch system character settings", err);
    }
  }, [API_BASE]);

  const fetchCharacters = useCallback(async () => {
    try {
      await Promise.all([
        fetchEvolutionChains(),
        fetchPlayerProgressList(),
        fetchSystemSettings()
      ]);
      // Call standard endpoint for fallback/compatibility
      const response = await fetch(`${API_BASE}/api/admin/characters`, { headers: await getHeaders() });
      if (response.ok) {
        const data = await response.json();
        setCharacters(data);
      }
    } catch (err) {
      console.error(err);
    }
  }, [fetchEvolutionChains, fetchPlayerProgressList, fetchSystemSettings, API_BASE, getHeaders]);


  const fetchScenes = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/scenes`, { headers: await getHeaders() });
      const data = await response.json();
      setScenes(data);
    } catch (err) {
      console.error(err);
    }
  }, [API_BASE, getHeaders]);

  const fetchItems = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/items`, { headers: await getHeaders() });
      const data = await response.json();
      setItems(data);
    } catch (err) {
      console.error(err);
    }
  }, [API_BASE, getHeaders]);

  const fetchIntroductions = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/introductions`, { headers: await getHeaders() });
      const data = await response.json();
      setIntroductions(data);
    } catch (err) {
      console.error(err);
    }
  }, [API_BASE, getHeaders]);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/announcements`, { headers: await getHeaders() });
      const data = await response.json();
      setAnnouncements(data);
    } catch (err) {
      console.error(err);
    }
  }, [API_BASE, getHeaders]);

  const fetchPointTransactions = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/points/transactions`, { headers: await getHeaders() });
      const data = await response.json();
      setPointTransactions(data);
    } catch (err) {
      console.error(err);
    }
  }, [API_BASE, getHeaders]);

  const fetchImagesLibrary = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/images-library`, { headers: await getHeaders() });
      if (response.ok) {
        const data = await response.json();
        setImagesLibrary(data);
      }
    } catch (err) {
      console.error("Failed to load images library:", err);
    }
  }, [API_BASE, getHeaders]);

  const getCombinedImageLibrary = () => {
    const lib = [...imagesLibrary];
    const seenUrls = new Set(lib.map(img => img.imageUrl));
    
    // Add characters images if not already seen
    characters.forEach(char => {
      if (char.imageUrl && !seenUrls.has(char.imageUrl)) {
        lib.push({
          id: char.id,
          name: char.name || '角色頭像',
          type: 'character',
          imageUrl: char.imageUrl,
          createdAt: char.createdAt || new Date().toISOString()
        });
        seenUrls.add(char.imageUrl);
      }
    });

    // Add evolution stages images if not already seen
    evolutionChains.forEach(chain => {
      if (chain.stages) {
        chain.stages.forEach(st => {
          if (st.imageUrl && !seenUrls.has(st.imageUrl)) {
            lib.push({
              id: st.id,
              name: `${chain.character.name} - ${st.stageName || `第${st.stageNumber}階段`}`,
              type: 'character',
              imageUrl: st.imageUrl,
              createdAt: st.createdAt || new Date().toISOString()
            });
            seenUrls.add(st.imageUrl);
          }
        });
      }
    });

    // Add scenes images if not already seen
    scenes.forEach(scene => {
      if (scene.imageUrl && !seenUrls.has(scene.imageUrl)) {
        lib.push({
          id: scene.id,
          name: scene.name || '場景地圖',
          type: 'scene',
          imageUrl: scene.imageUrl,
          createdAt: scene.createdAt || new Date().toISOString()
        });
        seenUrls.add(scene.imageUrl);
      }
    });

    return lib;
  };

  const handleTabChange = (tab) => {
    setLoading(true);
    setActiveTab(tab);
  };

  // Trigger loading when tab changes
  useEffect(() => {
    const loadData = async () => {
      try {
        if (activeTab === 'Overview') {
          await Promise.all([fetchStudents(), fetchAuditLogs()]);
        } else if (activeTab === 'Students') {
          await fetchStudents();
        } else if (activeTab === 'Progress') {
          await fetchStudents();
        } else if (activeTab === 'Rewards') {
          await Promise.all([fetchStudents(), fetchPointTransactions()]);
        } else if (activeTab === 'Characters') {
          await Promise.all([fetchCharacters(), fetchImagesLibrary()]);
        } else if (activeTab === 'Scenes') {
          await Promise.all([fetchScenes(), fetchImagesLibrary()]);
        } else if (activeTab === 'Items') {
          await fetchItems();
        } else if (activeTab === 'Introductions') {
          await fetchIntroductions();
        } else if (activeTab === 'Announcements') {
          await fetchAnnouncements();
        } else if (activeTab === 'Audit Logs') {
          await fetchAuditLogs();
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [activeTab, fetchStudents, fetchAuditLogs, fetchCharacters, fetchScenes, fetchItems, fetchIntroductions, fetchAnnouncements, fetchPointTransactions, fetchImagesLibrary]);

  // Log GM Login once on mount
  useEffect(() => {
    const logLogin = async () => {
      try {
        await fetch(`${API_BASE}/api/admin/login-audit`, {
          method: 'POST',
          headers: await getHeaders()
        });
      } catch (err) {
        console.error("Failed to log GM login audit", err);
      }
    };
    if (user) logLogin();
  }, [user, API_BASE, getHeaders]);

  // Email reveal API handler
  const revealEmail = async (studentId) => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${studentId}/reveal-email`, {
        method: 'POST',
        headers: await getHeaders()
      });
      if (!response.ok) throw new Error('揭露信箱失敗');
      const data = await response.json();
      setRevealedEmails(prev => ({
        ...prev,
        [studentId]: data.email
      }));
      flashSuccess('成功解鎖信箱，已寫入安全稽核日誌。');
    } catch (err) {
      flashError(err.message);
    }
  };

  // CSV Export utility
  const exportStudentsToCSV = () => {
    if (!studentsList.length) return;
    const headers = ['AnonymizedCode', 'Nickname', 'Points', 'Role', 'PlayFrequency', 'LastActive'];
    const rows = studentsList.map(s => [
      s.anonymizedStudentCode || '無',
      s.nickname || s.displayName || '未知',
      s.points || 0,
      s.role || 'player',
      s.playFrequency || '無設定',
      s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '無資料'
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `student_progress_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Audit the CSV export
    logGMAction(
      { userId: user.uid, email: user.email }, 
      'export_student_data', 
      'users', 
      null, 
      `GM exported all student progress to CSV`
    );
  };

  // Points / Rewards Submit
  const handleGrantReward = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        target: grantTarget,
        playerIds: grantTarget === 'selected' ? selectedStudents : [],
        rewardType,
        amount: rewardType === 'points' ? Number(rewardAmount) : undefined,
        badge: rewardType === 'badges' ? rewardDetail : undefined,
        token: rewardType === 'tokens' ? rewardDetail : undefined,
        outfit: rewardType === 'outfits' ? rewardDetail : undefined,
        item: rewardType === 'items' ? rewardDetail : undefined,
        stageUnlock: rewardType === 'stage_unlock' ? { worldId: '1', stageId: 1 } : undefined,
        reason: grantReason
      };

      const response = await fetch(`${API_BASE}/api/admin/rewards`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('獎勵發放失敗');
      const data = await response.json();
      flashSuccess(`成功發放獎勵給 ${data.count} 位學員！`);
      setSelectedStudents([]);
      fetchStudents();
    } catch (err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Evolution Chain & Character API Calls
  const validateChain = async (chainId) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/evolution-chains/${chainId}/validate`, {
        method: 'POST',
        headers: await getHeaders()
      });
      if (!response.ok) throw new Error('驗證失敗');
      const data = await response.json();
      setActiveChainValidation({ chainId, ...data });
      if (data.valid) {
        flashSuccess('該進化鏈完整性驗證通過！');
      } else {
        flashError('該進化鏈驗證失敗，請檢查錯誤資訊。');
      }
    } catch(err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEditChain = (chain) => {
    setIsEditingChain(true);
    setEditingChainId(chain.character.id);
    
    const formattedStages = chain.stages.map(s => ({
      stageNumber: s.stageNumber,
      stageName: s.stageName || '',
      stageTitle: s.stageTitle || '',
      description: s.description || '',
      imageUrl: s.imageUrl || '',
      thumbnailUrl: s.thumbnailUrl || '',
      conditions: s.conditions ? {
        conditionName: s.conditions.conditionName || '',
        conditionDescription: s.conditions.conditionDescription || '',
        requiredPoints: s.conditions.requiredPoints !== null ? String(s.conditions.requiredPoints) : '',
        requiredPerfectClears: s.conditions.requiredPerfectClears !== null ? String(s.conditions.requiredPerfectClears) : '',
        requiredCheckpointClears: s.conditions.requiredCheckpointClears !== null ? String(s.conditions.requiredCheckpointClears) : '',
        requiredWorldId: s.conditions.requiredWorldId || '',
        requiredStageIndex: s.conditions.requiredStageIndex !== null ? String(s.conditions.requiredStageIndex) : '',
        requiredCheckpointIndex: s.conditions.requiredCheckpointIndex !== null ? String(s.conditions.requiredCheckpointIndex) : '',
        requiredBadgeIds: Array.isArray(s.conditions.requiredBadgeIds) ? s.conditions.requiredBadgeIds : [],
        requiredTokenIds: Array.isArray(s.conditions.requiredTokenIds) ? s.conditions.requiredTokenIds : [],
        requiredItemIds: Array.isArray(s.conditions.requiredItemIds) ? s.conditions.requiredItemIds : [],
        requiredLoginDays: s.conditions.requiredLoginDays !== null ? String(s.conditions.requiredLoginDays) : '',
        requiredLearningDaysThisWeek: s.conditions.requiredLearningDaysThisWeek !== null ? String(s.conditions.requiredLearningDaysThisWeek) : '',
        requiredTargetReached: !!s.conditions.requiredTargetReached,
        customRuleJson: s.conditions.customRuleJson ? JSON.stringify(s.conditions.customRuleJson, null, 2) : ''
      } : {
        conditionName: '',
        conditionDescription: '',
        requiredPoints: '',
        requiredPerfectClears: '',
        requiredCheckpointClears: '',
        requiredWorldId: '',
        requiredStageIndex: '',
        requiredCheckpointIndex: '',
        requiredBadgeIds: [],
        requiredTokenIds: [],
        requiredItemIds: [],
        requiredLoginDays: '',
        requiredLearningDaysThisWeek: '',
        requiredTargetReached: false,
        customRuleJson: ''
      }
    }));

    while (formattedStages.length < 6) {
      const nextNum = formattedStages.length + 1;
      formattedStages.push({
        stageNumber: nextNum,
        stageName: '',
        stageTitle: '',
        description: '',
        imageUrl: '',
        thumbnailUrl: '',
        conditions: {
          conditionName: '',
          conditionDescription: '',
          requiredPoints: '',
          requiredPerfectClears: '',
          requiredCheckpointClears: '',
          requiredWorldId: '',
          requiredStageIndex: '',
          requiredCheckpointIndex: '',
          requiredBadgeIds: [],
          requiredTokenIds: [],
          requiredItemIds: [],
          requiredLoginDays: '',
          requiredLearningDaysThisWeek: '',
          requiredTargetReached: false,
          customRuleJson: ''
        }
      });
    }

    setChainForm({
      character: {
        ...chain.character
      },
      stages: formattedStages
    });
    setCharSubTab('upload');
  };

  const handleChainFormSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      if (!chainForm.character.characterCode.trim()) {
        throw new Error('必須填寫角色代碼 (characterCode)');
      }
      if (!chainForm.character.name.trim()) {
        throw new Error('必須填寫角色名稱');
      }
      
      for (let i = 0; i < 6; i++) {
        const s = chainForm.stages[i];
        if (!s.stageName.trim()) throw new Error(`請填寫第 ${i + 1} 階段的名稱`);
        if (!s.stageTitle.trim()) throw new Error(`請填寫第 ${i + 1} 階段的稱號`);
        if (!s.description.trim()) throw new Error(`請填寫第 ${i + 1} 階段的描述`);
        if (!s.imageUrl) throw new Error(`請為第 ${i + 1} 階段提供/上傳圖片`);
      }

      const formattedStages = chainForm.stages.map((s, idx) => {
        if (idx === 0) {
          return {
            stageNumber: 1,
            stageName: s.stageName.trim(),
            stageTitle: s.stageTitle.trim(),
            description: s.description.trim(),
            imageUrl: s.imageUrl,
            thumbnailUrl: s.thumbnailUrl || null,
            conditions: null
          };
        }
        
        const cond = s.conditions;
        let parsedCustomJson = null;
        if (cond.customRuleJson && cond.customRuleJson.trim()) {
          try {
            parsedCustomJson = JSON.parse(cond.customRuleJson);
          } catch {
            throw new Error(`第 ${idx + 1} 階段自訂規則的 JSON 格式不正確。`);
          }
        }

        return {
          stageNumber: idx + 1,
          stageName: s.stageName.trim(),
          stageTitle: s.stageTitle.trim(),
          description: s.description.trim(),
          imageUrl: s.imageUrl,
          thumbnailUrl: s.thumbnailUrl || null,
          conditions: {
            conditionName: cond.conditionName.trim() || `進化至 ${s.stageName.trim()}`,
            conditionDescription: cond.conditionDescription.trim() || '',
            requiredPoints: cond.requiredPoints ? Number(cond.requiredPoints) : null,
            requiredPerfectClears: cond.requiredPerfectClears ? Number(cond.requiredPerfectClears) : null,
            requiredCheckpointClears: cond.requiredCheckpointClears ? Number(cond.requiredCheckpointClears) : null,
            requiredWorldId: cond.requiredWorldId || null,
            requiredStageIndex: cond.requiredStageIndex ? Number(cond.requiredStageIndex) : null,
            requiredCheckpointIndex: cond.requiredCheckpointIndex ? Number(cond.requiredCheckpointIndex) : null,
            requiredBadgeIds: Array.isArray(cond.requiredBadgeIds) ? cond.requiredBadgeIds : (typeof cond.requiredBadgeIds === 'string' ? cond.requiredBadgeIds.split(',').map(x => x.trim()).filter(Boolean) : []),
            requiredTokenIds: Array.isArray(cond.requiredTokenIds) ? cond.requiredTokenIds : (typeof cond.requiredTokenIds === 'string' ? cond.requiredTokenIds.split(',').map(x => x.trim()).filter(Boolean) : []),
            requiredItemIds: Array.isArray(cond.requiredItemIds) ? cond.requiredItemIds : (typeof cond.requiredItemIds === 'string' ? cond.requiredItemIds.split(',').map(x => x.trim()).filter(Boolean) : []),
            requiredLoginDays: cond.requiredLoginDays ? Number(cond.requiredLoginDays) : null,
            requiredLearningDaysThisWeek: cond.requiredLearningDaysThisWeek ? Number(cond.requiredLearningDaysThisWeek) : null,
            requiredTargetReached: !!cond.requiredTargetReached,
            customRuleJson: parsedCustomJson
          }
        };
      });

      const payload = {
        character: {
          ...chainForm.character,
          characterCode: chainForm.character.characterCode.trim()
        },
        stages: formattedStages
      };

      const method = isEditingChain ? 'PUT' : 'POST';
      const url = isEditingChain 
        ? `${API_BASE}/api/admin/evolution-chains/${editingChainId}` 
        : `${API_BASE}/api/admin/evolution-chains`;

      const response = await fetch(url, {
        method,
        headers: await getHeaders(),
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '儲存角色進化鏈失敗');
      
      flashSuccess(isEditingChain ? '角色進化鏈編輯成功！' : '新角色進化鏈發布成功！');
      setChainForm(initialChainForm);
      setIsEditingChain(false);
      setEditingChainId(null);
      setCharSubTab('chains');
      await fetchCharacters();
    } catch (err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForceEvolve = async (playerId) => {
    if (!window.confirm('確定要手動觸發該學員的下一次進化嗎？這將記錄在系統稽核日誌中。')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/player-character-progress/${playerId}/trigger-evolution`, {
        method: 'POST',
        headers: await getHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '進化觸發失敗');
      flashSuccess(`手動進化觸發成功！學員角色已升至第 ${data.toStageNumber} 階段。`);
      await fetchPlayerProgressList();
    } catch(e) {
      flashError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetCharacter = async (playerId) => {
    if (!window.confirm('確定要將該學員的角色狀態重置回第 1 階段（蛋）嗎？此操作不可逆！這將記錄在系統稽核日誌中。')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/player-character-progress/${playerId}/reset-character`, {
        method: 'POST',
        headers: await getHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '重置角色失敗');
      flashSuccess('學員角色已成功重置回第 1 階段！');
      await fetchPlayerProgressList();
    } catch(e) {
      flashError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConditionChange = (stageIndex, field, value) => {
    const updatedStages = [...chainForm.stages];
    updatedStages[stageIndex] = {
      ...updatedStages[stageIndex],
      conditions: {
        ...updatedStages[stageIndex].conditions,
        [field]: value
      }
    };
    setChainForm({ ...chainForm, stages: updatedStages });
  };

  const handleStageFieldChange = (stageIndex, field, value) => {
    const updatedStages = [...chainForm.stages];
    updatedStages[stageIndex] = {
      ...updatedStages[stageIndex],
      [field]: value
    };
    setChainForm({ ...chainForm, stages: updatedStages });
  };

  const handleStageImageUpload = async (e, index) => {
    if (e.target.files.length) {
      try {
        const file = e.target.files[0];
        const compressed = await compressImage(file, 400, 400, 0.8);
        
        // Post to backend image library immediately to store in DB
        const response = await fetch(`${API_BASE}/api/admin/images-library`, {
          method: 'POST',
          headers: await getHeaders(),
          body: JSON.stringify({
            imageUrl: compressed,
            name: file.name,
            type: 'character'
          })
        });
        
        if (response.ok) {
          const savedImage = await response.json();
          const updatedStages = [...chainForm.stages];
          updatedStages[index] = { ...updatedStages[index], imageUrl: savedImage.imageUrl };
          setChainForm({ ...chainForm, stages: updatedStages });
          fetchImagesLibrary();
          flashSuccess(`階段 ${index + 1} 圖片上傳並儲存成功！`);
        } else {
          const updatedStages = [...chainForm.stages];
          updatedStages[index] = { ...updatedStages[index], imageUrl: compressed };
          setChainForm({ ...chainForm, stages: updatedStages });
          flashSuccess(`階段 ${index + 1} 圖片讀取成功！`);
        }
      } catch (err) {
        alert('圖片讀取或儲存失敗：' + err.message);
      }
    }
  };

  const archiveCharacter = async (id) => {
    if (!window.confirm('確定要封存此角色進化鏈？此操作將使新玩家無法選擇該角色，但已持有該角色的玩家進度將安全保留。')) return;
    try {
      const response = await fetch(`${API_BASE}/api/admin/evolution-chains/${id}`, {
        method: 'DELETE',
        headers: await getHeaders()
      });
      if (!response.ok) throw new Error('封存失敗');
      flashSuccess('角色進化鏈已封存');
      await fetchCharacters();
    } catch (err) {
      flashError(err.message);
    }
  };




  // CRUD Scenes API Calls
  const handleSceneSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const method = isEditingScene ? 'PUT' : 'POST';
      const url = isEditingScene ? `${API_BASE}/api/admin/scenes/${sceneForm.id}` : `${API_BASE}/api/admin/scenes`;
      
      const response = await fetch(url, {
        method,
        headers: await getHeaders(),
        body: JSON.stringify(sceneForm)
      });
      if (!response.ok) throw new Error('儲存場景失敗');
      
      flashSuccess('學習場景儲存成功！');
      setSceneForm({ id: '', name: '', description: '', linkedWorldId: '' });
      setIsEditingScene(false);
      fetchScenes();
    } catch (err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const archiveScene = async (id) => {
    if (!window.confirm('確定要封存此場景？')) return;
    try {
      const response = await fetch(`${API_BASE}/api/admin/scenes/${id}`, {
        method: 'DELETE',
        headers: await getHeaders()
      });
      if (!response.ok) throw new Error('封存失敗');
      flashSuccess('場景已封存');
      fetchScenes();
    } catch (err) {
      flashError(err.message);
    }
  };

  // CRUD Items API Calls
  const handleItemSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const method = isEditingItem ? 'PUT' : 'POST';
      const url = isEditingItem ? `${API_BASE}/api/admin/items/${itemForm.id}` : `${API_BASE}/api/admin/items`;
      
      const response = await fetch(url, {
        method,
        headers: await getHeaders(),
        body: JSON.stringify(itemForm)
      });
      if (!response.ok) throw new Error('儲存道具道具失敗');
      
      flashSuccess('服裝道具儲存成功！');
      setItemForm({ id: '', name: '', description: '', effect: '' });
      setIsEditingItem(false);
      fetchItems();
    } catch (err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const archiveItem = async (id) => {
    if (!window.confirm('確定要封存此項目？')) return;
    try {
      const response = await fetch(`${API_BASE}/api/admin/items/${id}`, {
        method: 'DELETE',
        headers: await getHeaders()
      });
      if (!response.ok) throw new Error('封存失敗');
      flashSuccess('項目已封存');
      fetchItems();
    } catch (err) {
      flashError(err.message);
    }
  };

  // CRUD Introductions API Calls
  const handleIntroSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const method = isEditingIntro ? 'PUT' : 'POST';
      const url = isEditingIntro ? `${API_BASE}/api/admin/introductions/${introForm.id}` : `${API_BASE}/api/admin/introductions`;
      
      const response = await fetch(url, {
        method,
        headers: await getHeaders(),
        body: JSON.stringify(introForm)
      });
      if (!response.ok) throw new Error('儲存引言失敗');
      
      flashSuccess('引言與教學內容儲存成功！');
      setIntroForm({ id: '', targetType: 'general', targetId: '', title: '', content: '' });
      setIsEditingIntro(false);
      fetchIntroductions();
    } catch (err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteIntroduction = async (id) => {
    if (!window.confirm('確定要刪除此引言？')) return;
    try {
      const response = await fetch(`${API_BASE}/api/admin/introductions/${id}`, {
        method: 'DELETE',
        headers: await getHeaders()
      });
      if (!response.ok) throw new Error('刪除失敗');
      flashSuccess('引言已刪除');
      fetchIntroductions();
    } catch (err) {
      flashError(err.message);
    }
  };

  // CRUD Announcements API Calls
  const handleAnnSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const method = isEditingAnn ? 'PUT' : 'POST';
      const url = isEditingAnn ? `${API_BASE}/api/admin/announcements/${annForm.id}` : `${API_BASE}/api/admin/announcements`;
      
      const response = await fetch(url, {
        method,
        headers: await getHeaders(),
        body: JSON.stringify(annForm)
      });
      if (!response.ok) throw new Error('發布公告失敗');
      
      flashSuccess('平台公告儲存發布成功！');
      setAnnForm({ id: '', title: '', content: '', status: 'active' });
      setIsEditingAnn(false);
      fetchAnnouncements();
    } catch (err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const archiveAnnouncement = async (id) => {
    if (!window.confirm('確定要封存此公告？')) return;
    try {
      const response = await fetch(`${API_BASE}/api/admin/announcements/${id}`, {
        method: 'DELETE',
        headers: await getHeaders()
      });
      if (!response.ok) throw new Error('封存失敗');
      flashSuccess('公告已封存');
      fetchAnnouncements();
    } catch (err) {
      flashError(err.message);
    }
  };

  // World and Stage Management API Calls
  const handleOpenWorldProgress = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/worlds/open`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify(worldForm)
      });
      if (!response.ok) throw new Error('開啟世界進度失敗');
      flashSuccess('已成功更新世界關卡開放進度！');
    } catch (err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRestartWorld = async (e) => {
    e.preventDefault();
    if (!window.confirm(`確定要將世界 ${restartForm.worldId} 重置為新一輪挑戰嗎？這將會增加 roundVersion!`)) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/worlds/restart`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify(restartForm)
      });
      if (!response.ok) throw new Error('重置新輪次失敗');
      const data = await response.json();
      flashSuccess(`成功開啟新一輪挑戰！最新版本代碼為：V${data.roundVersion}`);
    } catch (err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateWorld = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/worlds/duplicate`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify(duplicateForm)
      });
      if (!response.ok) throw new Error('複製世界失敗');
      flashSuccess('成功複製新世界！');
    } catch (err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveWorld = async (e) => {
    e.preventDefault();
    if (!window.confirm(`確定要封存世界 ${archiveWorldId} 嗎？此操作不會刪除歷史學生通關紀錄。`)) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/worlds/archive`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ worldId: archiveWorldId })
      });
      if (!response.ok) throw new Error('封存世界失敗');
      flashSuccess('世界已成功封存！');
    } catch (err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Manual Progress Adjustment API Call
  const handleManualAdjustProgress = async (e) => {
    e.preventDefault();
    if (!progressAdjust.playerId) {
      alert('請先輸入或點選學員 ID！');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${progressAdjust.playerId}/adjust-progress`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify(progressAdjust)
      });
      if (!response.ok) throw new Error('調整學員進度失敗');
      flashSuccess('已成功手動更新學員闖關進度！');
      fetchStudents();
    } catch (err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Question Bank Importer Preview and Commit
  const handleFileChange = (e) => {
    if (e.target.files.length) {
      setQuestionBankFile(e.target.files[0]);
    }
  };

  const renderHumanReadableConditions = (cond) => {
    if (!cond) return '無條件 (第一階段/永遠可用)';
    const reqs = [];
    if (cond.requiredPoints) reqs.push(`積分達到 ${cond.requiredPoints} 分`);
    if (cond.requiredPerfectClears) reqs.push(`滿分通關數達 ${cond.requiredPerfectClears} 次`);
    if (cond.requiredCheckpointClears) reqs.push(`Checkpoint 通關數達 ${cond.requiredCheckpointClears} 次`);
    if (cond.requiredWorldId) reqs.push(`通過第 ${cond.requiredWorldId} 世界`);
    if (cond.requiredStageIndex) reqs.push(`通關階段索引達 ${cond.requiredStageIndex}`);
    if (cond.requiredCheckpointIndex) reqs.push(`通關 Checkpoint 索引達 ${cond.requiredCheckpointIndex}`);
    if (cond.requiredBadgeIds && cond.requiredBadgeIds.length) reqs.push(`擁有勳章: ${cond.requiredBadgeIds.join(', ')}`);
    if (cond.requiredTokenIds && cond.requiredTokenIds.length) reqs.push(`擁有令牌: ${cond.requiredTokenIds.join(', ')}`);
    if (cond.requiredItemIds && cond.requiredItemIds.length) reqs.push(`擁有道具: ${cond.requiredItemIds.join(', ')}`);
    if (cond.requiredLoginDays) reqs.push(`累計登入天數達 ${cond.requiredLoginDays} 天`);
    if (cond.requiredLearningDaysThisWeek) reqs.push(`本週學習天數達 ${cond.requiredLearningDaysThisWeek} 天`);
    if (cond.requiredTargetReached) reqs.push(`達成本週學習目標`);
    if (cond.customRuleJson) reqs.push(`自訂 JSON 規則: ${typeof cond.customRuleJson === 'object' ? JSON.stringify(cond.customRuleJson) : cond.customRuleJson}`);
    
    return reqs.length > 0 ? reqs.join(' 且 ') : '無設定特定條件';
  };

  const renderStageConditionsEditor = (stage, index) => {
    if (index === 0) return (
      <div style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', fontSize: '0.9rem', color: '#9ca3af' }}>
        第一階段（蛋）不需要任何進化條件，玩家選擇後即可直接持有。
      </div>
    );

    const cond = stage.conditions || {};
    
    const isEnabled = (field) => {
      if (field === 'requiredBadgeIds' || field === 'requiredTokenIds' || field === 'requiredItemIds') {
        return Array.isArray(cond[field]) ? cond[field].length > 0 : !!cond[field];
      }
      if (field === 'requiredTargetReached') {
        return !!cond[field];
      }
      return cond[field] !== undefined && cond[field] !== null && cond[field] !== '';
    };

    const toggleCondition = (field, defaultValue) => {
      const isCurrentlyEnabled = isEnabled(field);
      const newValue = isCurrentlyEnabled 
        ? (field === 'requiredBadgeIds' || field === 'requiredTokenIds' || field === 'requiredItemIds' ? [] : (field === 'requiredTargetReached' ? false : null)) 
        : defaultValue;
      handleConditionChange(index, field, newValue);
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255, 255, 255, 0.02)', padding: '1.25rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <h5 style={{ color: 'var(--green-4)', margin: '0 0 0.5rem 0' }}>⚙️ 設定進化條件 (滿足以下所有勾選之條件才能進化至 Stage {index + 1})</h5>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.85rem' }}>條件名稱 (可留空，預設為 "進化至 [名稱]")</label>
            <input 
              className="gm-input" 
              value={cond.conditionName || ''} 
              onChange={e => handleConditionChange(index, 'conditionName', e.target.value)} 
              placeholder={`進化至 ${stage.stageName || '下一階段'}`}
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.85rem' }}>條件描述 (說明如何達成，供學員閱讀)</label>
            <input 
              className="gm-input" 
              value={cond.conditionDescription || ''} 
              onChange={e => handleConditionChange(index, 'conditionDescription', e.target.value)} 
              placeholder="例如：通關第一世界且累積積分達到 100 分"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input 
                type="checkbox" 
                checked={isEnabled('requiredPoints')} 
                onChange={() => toggleCondition('requiredPoints', '100')} 
              />
              需求積分 (requiredPoints)
            </label>
            {isEnabled('requiredPoints') && (
              <input 
                type="number" 
                className="gm-input" 
                style={{ marginTop: '0.25rem', padding: '0.4rem 0.6rem' }} 
                value={cond.requiredPoints || ''} 
                onChange={e => handleConditionChange(index, 'requiredPoints', e.target.value)} 
                placeholder="例如：100"
              />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input 
                type="checkbox" 
                checked={isEnabled('requiredPerfectClears')} 
                onChange={() => toggleCondition('requiredPerfectClears', '5')} 
              />
              需求滿分通關數 (requiredPerfectClears)
            </label>
            {isEnabled('requiredPerfectClears') && (
              <input 
                type="number" 
                className="gm-input" 
                style={{ marginTop: '0.25rem', padding: '0.4rem 0.6rem' }} 
                value={cond.requiredPerfectClears || ''} 
                onChange={e => handleConditionChange(index, 'requiredPerfectClears', e.target.value)} 
                placeholder="例如：5"
              />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input 
                type="checkbox" 
                checked={isEnabled('requiredCheckpointClears')} 
                onChange={() => toggleCondition('requiredCheckpointClears', '10')} 
              />
              需求 CP 通關數 (requiredCheckpointClears)
            </label>
            {isEnabled('requiredCheckpointClears') && (
              <input 
                type="number" 
                className="gm-input" 
                style={{ marginTop: '0.25rem', padding: '0.4rem 0.6rem' }} 
                value={cond.requiredCheckpointClears || ''} 
                onChange={e => handleConditionChange(index, 'requiredCheckpointClears', e.target.value)} 
                placeholder="例如：10"
              />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input 
                type="checkbox" 
                checked={isEnabled('requiredLoginDays')} 
                onChange={() => toggleCondition('requiredLoginDays', '3')} 
              />
              需求累積登入天數 (requiredLoginDays)
            </label>
            {isEnabled('requiredLoginDays') && (
              <input 
                type="number" 
                className="gm-input" 
                style={{ marginTop: '0.25rem', padding: '0.4rem 0.6rem' }} 
                value={cond.requiredLoginDays || ''} 
                onChange={e => handleConditionChange(index, 'requiredLoginDays', e.target.value)} 
                placeholder="例如：3"
              />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input 
                type="checkbox" 
                checked={isEnabled('requiredLearningDaysThisWeek')} 
                onChange={() => toggleCondition('requiredLearningDaysThisWeek', '2')} 
              />
              需求本週學習天數 (requiredLearningDays)
            </label>
            {isEnabled('requiredLearningDaysThisWeek') && (
              <input 
                type="number" 
                className="gm-input" 
                style={{ marginTop: '0.25rem', padding: '0.4rem 0.6rem' }} 
                value={cond.requiredLearningDaysThisWeek || ''} 
                onChange={e => handleConditionChange(index, 'requiredLearningDaysThisWeek', e.target.value)} 
                placeholder="例如：2"
              />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', justifyContent: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input 
                type="checkbox" 
                checked={isEnabled('requiredTargetReached')} 
                onChange={() => toggleCondition('requiredTargetReached', true)} 
              />
              需求達成本週進度目標 (requiredTargetReached)
            </label>
          </div>

          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <input 
                type="checkbox" 
                checked={isEnabled('requiredWorldId')} 
                onChange={() => {
                  const active = isEnabled('requiredWorldId');
                  handleConditionChange(index, 'requiredWorldId', active ? null : '1');
                  handleConditionChange(index, 'requiredStageIndex', active ? null : '0');
                  handleConditionChange(index, 'requiredCheckpointIndex', active ? null : '0');
                }} 
              />
              指定世界 / 階段 / Checkpoint 通關限制
            </label>
            {isEnabled('requiredWorldId') && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>世界 ID</span>
                  <input 
                    type="text" 
                    className="gm-input" 
                    style={{ padding: '0.4rem 0.6rem' }}
                    value={cond.requiredWorldId || ''} 
                    onChange={e => handleConditionChange(index, 'requiredWorldId', e.target.value)} 
                    placeholder="例如：1"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>階段索引 (0 開始)</span>
                  <input 
                    type="number" 
                    className="gm-input" 
                    style={{ padding: '0.4rem 0.6rem' }}
                    value={cond.requiredStageIndex !== undefined && cond.requiredStageIndex !== null ? cond.requiredStageIndex : ''} 
                    onChange={e => handleConditionChange(index, 'requiredStageIndex', e.target.value)} 
                    placeholder="例如：0"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Checkpoint 索引 (0 開始)</span>
                  <input 
                    type="number" 
                    className="gm-input" 
                    style={{ padding: '0.4rem 0.6rem' }}
                    value={cond.requiredCheckpointIndex !== undefined && cond.requiredCheckpointIndex !== null ? cond.requiredCheckpointIndex : ''} 
                    onChange={e => handleConditionChange(index, 'requiredCheckpointIndex', e.target.value)} 
                    placeholder="例如：0"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input 
                type="checkbox" 
                checked={isEnabled('requiredBadgeIds')} 
                onChange={() => toggleCondition('requiredBadgeIds', 'BADGE_ESG_NEWBIE')} 
              />
              需求持有稱號勳章 (逗號分隔，例如：ESG_MASTER, SDG_EXPERT)
            </label>
            {isEnabled('requiredBadgeIds') && (
              <input 
                type="text" 
                className="gm-input" 
                style={{ marginTop: '0.25rem', padding: '0.4rem 0.6rem' }} 
                value={Array.isArray(cond.requiredBadgeIds) ? cond.requiredBadgeIds.join(', ') : (cond.requiredBadgeIds || '')} 
                onChange={e => handleConditionChange(index, 'requiredBadgeIds', e.target.value)} 
                placeholder="例如：ESG_MASTER"
              />
            )}
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input 
                type="checkbox" 
                checked={isEnabled('requiredTokenIds')} 
                onChange={() => toggleCondition('requiredTokenIds', 'TOKEN_GEN_1')} 
              />
              需求持有交易令牌 (逗號分隔)
            </label>
            {isEnabled('requiredTokenIds') && (
              <input 
                type="text" 
                className="gm-input" 
                style={{ marginTop: '0.25rem', padding: '0.4rem 0.6rem' }} 
                value={Array.isArray(cond.requiredTokenIds) ? cond.requiredTokenIds.join(', ') : (cond.requiredTokenIds || '')} 
                onChange={e => handleConditionChange(index, 'requiredTokenIds', e.target.value)} 
                placeholder="例如：TOKEN_GEN_1"
              />
            )}
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input 
                type="checkbox" 
                checked={isEnabled('requiredItemIds')} 
                onChange={() => toggleCondition('requiredItemIds', 'item_esg_book')} 
              />
              需求持有特定道具 (逗號分隔)
            </label>
            {isEnabled('requiredItemIds') && (
              <input 
                type="text" 
                className="gm-input" 
                style={{ marginTop: '0.25rem', padding: '0.4rem 0.6rem' }} 
                value={Array.isArray(cond.requiredItemIds) ? cond.requiredItemIds.join(', ') : (cond.requiredItemIds || '')} 
                onChange={e => handleConditionChange(index, 'requiredItemIds', e.target.value)} 
                placeholder="例如：item_esg_book"
              />
            )}
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input 
                type="checkbox" 
                checked={isEnabled('customRuleJson')} 
                onChange={() => toggleCondition('customRuleJson', '{\n  "customRule": true\n}')} 
              />
              自訂 JSON 規則 (開發者進階擴充用)
            </label>
            {isEnabled('customRuleJson') && (
              <textarea 
                className="gm-textarea" 
                rows="3" 
                style={{ marginTop: '0.25rem', fontFamily: 'monospace', fontSize: '0.85rem' }} 
                value={cond.customRuleJson || ''} 
                onChange={e => handleConditionChange(index, 'customRuleJson', e.target.value)} 
                placeholder={'{\n  "customKey": "customValue"\n}'}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleUploadPreview = async (e) => {
    e.preventDefault();
    if (!questionBankFile) {
      alert('請先選擇檔案');
      return;
    }
    setLoading(true);
    try {
      const result = await questionBankApi.previewExcel(user, questionBankFile, bankMetadata);
      setPreviewData(result);
      flashSuccess('試算表上傳解析完成，請於下方預覽區檢視驗證結果。');
    } catch (err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCommitImport = async () => {
    if (!previewData || !previewData.rows) return;
    if (!window.confirm(`確定要匯入此題庫嗎？共包含 ${previewData.rows.length} 題。`)) return;
    setLoading(true);
    try {
      const payload = {
        metadata: bankMetadata,
        rows: previewData.rows,
        legalAcknowledged: true,
        importValidOnly: importValidOnly
      };
      
      const response = await fetch(`${API_BASE}/api/question-banks/import/commit`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '匯入提交失敗');
      }
      
      flashSuccess('題庫正式匯入成功！');
      setPreviewData(null);
      setQuestionBankFile(null);
    } catch (err) {
      flashError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter students based on query
  const filteredStudents = studentsList.filter(s => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.nickname || '').toLowerCase().includes(q) ||
      (s.displayName || '').toLowerCase().includes(q) ||
      (s.anonymizedStudentCode || '').toLowerCase().includes(q) ||
      (s.id || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="gm-admin-container">
      {/* Dynamic Futuristic Styling Tag */}
      <style>{`
        .gm-admin-container {
          background: var(--white-2);
          background-image: radial-gradient(circle at 10% 20%, rgba(123, 196, 127, 0.08) 0%, transparent 90%), radial-gradient(circle at 90% 80%, rgba(62, 154, 82, 0.05) 0%, transparent 90%);
          color: var(--green-5);
          font-family: 'Outfit', 'Inter', 'Noto Sans TC', sans-serif;
          min-height: 100vh;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        
        .gm-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 2rem;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(62, 154, 82, 0.15);
          border-radius: 16px;
          backdrop-filter: blur(15px);
          box-shadow: 0 8px 32px rgba(31, 107, 58, 0.03);
        }

        .gm-logo-badge {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .gold-badge {
          background: linear-gradient(135deg, #f2d56b, #d4a72c);
          color: #1f6b3a;
          padding: 0.25rem 0.75rem;
          font-size: 0.8rem;
          font-weight: 800;
          border-radius: 50px;
          box-shadow: 0 2px 10px rgba(212, 167, 44, 0.15);
          letter-spacing: 0.5px;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }

        .gm-nav-tabs {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          padding: 0.5rem 0;
          border-bottom: 2px solid rgba(62, 154, 82, 0.1);
        }

        .gm-tab-btn {
          background: rgba(255, 255, 255, 0.8);
          color: #4a5d4e;
          border: 1px solid rgba(62, 154, 82, 0.1);
          padding: 0.75rem 1.25rem;
          border-radius: 12px;
          cursor: pointer;
          font-weight: bold;
          font-size: 0.9rem;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .gm-tab-btn:hover {
          background: #ffffff;
          color: var(--green-4);
          border-color: rgba(62, 154, 82, 0.3);
          box-shadow: 0 4px 12px rgba(31, 107, 58, 0.04);
        }

        .gm-tab-btn.active {
          background: linear-gradient(135deg, #7bc47f, #3e9a52);
          color: #ffffff;
          border-color: #3e9a52;
          box-shadow: 0 4px 15px rgba(62, 154, 82, 0.15);
        }

        .gm-panel {
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(62, 154, 82, 0.15);
          border-radius: 20px;
          padding: 2rem;
          backdrop-filter: blur(15px);
          box-shadow: 0 12px 40px rgba(31, 107, 58, 0.03);
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .gm-card {
          background: #ffffff;
          border: 1px solid rgba(62, 154, 82, 0.1);
          border-radius: 16px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          box-shadow: 0 4px 20px rgba(31, 107, 58, 0.01);
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.25rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group label {
          font-weight: 700;
          font-size: 0.85rem;
          color: var(--green-5);
          letter-spacing: 0.5px;
        }

        .gm-input, .gm-select, .gm-textarea {
          background: #ffffff;
          border: 1px solid rgba(62, 154, 82, 0.2);
          color: #0f172a;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          font-size: 0.95rem;
          transition: all 0.2s;
        }

        .gm-input:focus, .gm-select:focus, .gm-textarea:focus {
          border-color: var(--green-4);
          box-shadow: 0 0 10px rgba(62, 154, 82, 0.15);
          outline: none;
        }

        .gm-table-container {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid rgba(62, 154, 82, 0.1);
          background: #ffffff;
        }

        .gm-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.9rem;
        }

        .gm-table th {
          background: #eaf7ec;
          color: var(--green-5);
          font-weight: 800;
          padding: 1rem;
          border-bottom: 2px solid rgba(62, 154, 82, 0.15);
        }

        .gm-table td {
          padding: 1rem;
          border-bottom: 1px solid rgba(62, 154, 82, 0.08);
          color: #1e293b;
        }

        .gm-table tr:hover td {
          background: rgba(62, 154, 82, 0.03);
        }

        .gm-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          font-weight: bold;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .btn-gold {
          background: linear-gradient(135deg, #7bc47f, #3e9a52);
          color: #ffffff;
          box-shadow: 0 4px 15px rgba(62, 154, 82, 0.15);
        }

        .btn-gold:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(62, 154, 82, 0.25);
        }

        .btn-outline {
          background: transparent;
          color: var(--green-5);
          border: 1px solid rgba(62, 154, 82, 0.3);
        }

        .btn-outline:hover {
          background: rgba(62, 154, 82, 0.05);
          color: var(--green-5);
          border-color: var(--green-4);
        }

        .btn-danger {
          background: rgba(220, 38, 38, 0.08);
          color: #dc2626;
          border: 1px solid rgba(220, 38, 38, 0.2);
        }

        .btn-danger:hover {
          background: #dc2626;
          color: #ffffff;
        }

        .notification {
          padding: 1rem;
          border-radius: 10px;
          font-weight: bold;
          text-align: center;
          animation: slideDown 0.3s ease-out;
        }

        .note-success {
          background: rgba(16, 185, 129, 0.1);
          color: #059669;
          border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .note-error {
          background: rgba(220, 38, 38, 0.1);
          color: #dc2626;
          border: 1px solid rgba(220, 38, 38, 0.2);
        }

        /* Image Library Modal and Gallery styles */
        .gm-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.3);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease-out;
        }

        .gm-modal-content {
          background: #ffffff;
          border: 1px solid rgba(62, 154, 82, 0.2);
          border-radius: 20px;
          padding: 2rem;
          width: 90%;
          max-width: 650px;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: 0 20px 50px rgba(31, 107, 58, 0.1);
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          animation: scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .gm-gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 1rem;
          overflow-y: auto;
          max-height: 350px;
          padding: 0.5rem;
          border: 1px dashed rgba(62, 154, 82, 0.2);
          border-radius: 12px;
          background: #fbfdfc;
        }

        .gm-gallery-item {
          border: 2px solid transparent;
          border-radius: 10px;
          padding: 0.25rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          background: #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .gm-gallery-item:hover {
          transform: translateY(-2px);
          border-color: rgba(62, 154, 82, 0.4);
          box-shadow: 0 4px 12px rgba(62, 154, 82, 0.1);
        }

        .gm-gallery-item.selected {
          border-color: var(--green-4);
          background: rgba(62, 154, 82, 0.05);
        }

        .gm-gallery-thumb {
          width: 100%;
          height: 90px;
          border-radius: 8px;
          object-fit: cover;
          background: #f5f5f5;
        }

        .gm-gallery-name {
          font-size: 0.75rem;
          font-weight: 700;
          color: #4a5d4e;
          text-align: center;
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>

      {/* 1. Header with Back Button and GM Gold Badge */}
      <header className="gm-header">
        <div className="gm-logo-badge">
          <button onClick={onGoBack} className="gm-btn btn-outline" style={{ padding: '0.5rem 1rem' }}>
            <ArrowLeft size={16} /> 返回 Dashboard
          </button>
          <span style={{ color: 'rgba(62, 154, 82, 0.3)' }}>|</span>
          <Shield size={24} color="var(--green-4)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--green-5)', margin: 0 }}>AI 金融學習平台特權主控面板</h2>
          <span className="gold-badge">🥇 GM ADMIN</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.9rem', color: '#4a5d4e' }}>
          <span>管理者: <strong>{user?.email || '管理員'}</strong></span>
        </div>
      </header>

      {/* Status Notifications */}
      {successMsg && <div className="notification note-success">{successMsg}</div>}
      {errorMsg && <div className="notification note-error">{errorMsg}</div>}

      {/* 2. Navigation Tabs (12 Tabs) */}
      <nav className="gm-nav-tabs">
        {[
          { id: 'Overview', label: '📊 概覽 (Overview)', icon: Globe },
          { id: 'Students', label: '👥 學員 (Students)', icon: Users },
          { id: 'Progress', label: '📈 進度管理 (Progress)', icon: Trophy },
          { id: 'Rewards', label: '🎁 獎勵發放 (Rewards)', icon: Award },
          { id: 'Characters', label: '🧑‍🚀 角色 (Characters)', icon: Sparkles },
          { id: 'Scenes', label: '🗺️ 場景 (Scenes)', icon: Layers },
          { id: 'Items', label: '🎒 道具 (Items)', icon: BookOpen },
          { id: 'Introductions', label: '📝 引言 (Introductions)', icon: FileSpreadsheet },
          { id: 'Announcements', label: '📢 公告 (Announcements)', icon: Volume2 },
          { id: 'Worlds & Levels', label: '🌍 關卡 (Worlds & Levels)', icon: Clock },
          { id: 'Question Bank', label: '📂 題庫 (Question Bank)', icon: FileSpreadsheet },
          { id: 'Audit Logs', label: '🛡️ 稽核 (Audit Logs)', icon: History }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`gm-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* 3. Panel Body depending on Active Tab */}
      <main className="gm-panel">
        {loading && <div style={{ textAlign: 'center', padding: '3rem', fontSize: '1.2rem', color: 'var(--green-4)' }}>連線資料庫讀取中...</div>}
        
        {!loading && (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === 'Overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
                  <div className="gm-card" style={{ borderLeft: '4px solid var(--green-4)', textAlign: 'center' }}>
                    <span style={{ color: '#4a5d4e', fontWeight: 600 }}>註冊學員總數</span>
                    <h1 style={{ fontSize: '3rem', margin: 0, color: 'var(--green-5)' }}>{studentsList.length} 人</h1>
                  </div>
                  <div className="gm-card" style={{ borderLeft: '4px solid #1a73e8', textAlign: 'center' }}>
                    <span style={{ color: '#4a5d4e', fontWeight: 600 }}>最近稽核日誌數</span>
                    <h1 style={{ fontSize: '3rem', margin: 0, color: '#1a73e8' }}>{auditLogs.length} 筆</h1>
                  </div>
                  <div className="gm-card" style={{ borderLeft: '4px solid #10b981', textAlign: 'center' }}>
                    <span style={{ color: '#4a5d4e', fontWeight: 600 }}>平台運作狀態</span>
                    <h1 style={{ fontSize: '2rem', margin: '0.5rem 0', color: '#10b981' }}>🟢 在線正常</h1>
                  </div>
                </div>

                <div className="gm-card">
                  <h3 style={{ borderBottom: '1px solid rgba(62,154,82,0.1)', paddingBottom: '0.5rem', color: 'var(--green-5)' }}>🛡️ 最近 GM 稽核日誌</h3>
                  <div className="gm-table-container">
                    <table className="gm-table">
                      <thead>
                        <tr>
                          <th>操作時間</th>
                          <th>操作者 ID</th>
                          <th>信箱</th>
                          <th>動作類型</th>
                          <th>描述說明</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.slice(0, 5).map(log => (
                          <tr key={log.id}>
                            <td>{new Date(log.createdAt).toLocaleString()}</td>
                            <td style={{ fontFamily: 'monospace' }}>{log.actorUserId}</td>
                            <td>{log.actorEmail}</td>
                            <td><span className="gold-badge" style={{ padding: '0.1rem 0.5rem', fontSize: '0.7rem' }}>{log.actionType}</span></td>
                            <td>{log.description}</td>
                          </tr>
                        ))}
                        {!auditLogs.length && <tr><td colSpan="5" style={{ textAlign: 'center' }}>目前無操作日誌。</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* STUDENTS TAB */}
            {activeTab === 'Students' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ffffff', border: '1px solid rgba(62,154,82,0.2)', padding: '0.5rem 1rem', borderRadius: '8px', width: '300px' }}>
                    <Search size={16} color="var(--green-5)" />
                    <input 
                      value={studentSearch} 
                      onChange={e => setStudentSearch(e.target.value)} 
                      placeholder="搜尋學員代碼、暱稱、ID" 
                      style={{ background: 'transparent', border: 'none', color: 'var(--green-5)', width: '100%', outline: 'none' }} 
                    />
                  </div>
                  <button onClick={exportStudentsToCSV} className="gm-btn btn-gold">
                    <Download size={16} /> 匯出學員進度 CSV
                  </button>
                </div>

                <div className="gm-table-container">
                  <table className="gm-table">
                    <thead>
                      <tr>
                        <th>學員代碼</th>
                        <th>資料庫 ID</th>
                        <th>學員信箱 (Reveal / 揭露)</th>
                        <th>顯示暱稱</th>
                        <th>點數餘額</th>
                        <th>學習目標頻率</th>
                        <th>最後活躍時間</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map(student => (
                        <tr key={student.id}>
                          <td style={{ fontWeight: 'bold', color: 'var(--green-5)' }}>{student.anonymizedStudentCode || '無'}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{student.id}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span>{revealedEmails[student.id] || student.email}</span>
                              {!revealedEmails[student.id] && (
                                <button 
                                  onClick={() => revealEmail(student.id)} 
                                  className="gm-btn btn-outline" 
                                  style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px' }}
                                >
                                  揭露信箱
                                </button>
                              )}
                            </div>
                          </td>
                          <td>{student.nickname || student.displayName || '未命名'}</td>
                          <td style={{ fontWeight: 'bold', color: '#10b981' }}>💰 {student.points || 0}</td>
                          <td>{student.playFrequency || '未設定'}</td>
                          <td>{student.updatedAt ? new Date(student.updatedAt).toLocaleString() : '未知'}</td>
                        </tr>
                      ))}
                      {!filteredStudents.length && <tr><td colSpan="7" style={{ textAlign: 'center' }}>查無任何學員資料。</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PROGRESS TAB */}
            {activeTab === 'Progress' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className="gm-card">
                  <h3 style={{ color: 'var(--green-5)' }}>⚙️ 手動調整/核准學員進度</h3>
                  <form onSubmit={handleManualAdjustProgress} className="form-grid">
                    <div className="form-group">
                      <label>選擇學員</label>
                      <select 
                        className="gm-select"
                        value={progressAdjust.playerId} 
                        onChange={e => setProgressAdjust(prev => ({ ...prev, playerId: e.target.value }))}
                      >
                        <option value="">-- 請選擇學員 --</option>
                        {studentsList.map(s => (
                          <option key={s.id} value={s.id}>{s.anonymizedStudentCode} - {s.nickname || s.displayName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>挑戰輪次 (Round ID)</label>
                      <input 
                        className="gm-input"
                        value={progressAdjust.roundId} 
                        onChange={e => setProgressAdjust(prev => ({ ...prev, roundId: e.target.value }))} 
                      />
                    </div>
                    <div className="form-group">
                      <label>世界編號 (World ID)</label>
                      <input 
                        className="gm-input"
                        value={progressAdjust.worldId} 
                        onChange={e => setProgressAdjust(prev => ({ ...prev, worldId: e.target.value }))} 
                      />
                    </div>
                    <div className="form-group">
                      <label>關卡編號 (Stage ID)</label>
                      <input 
                        className="gm-input"
                        value={progressAdjust.stageId} 
                        onChange={e => setProgressAdjust(prev => ({ ...prev, stageId: e.target.value }))} 
                      />
                    </div>
                    <div className="form-group">
                      <label>Checkpoint ID</label>
                      <input 
                        className="gm-input"
                        value={progressAdjust.checkpointId} 
                        onChange={e => setProgressAdjust(prev => ({ ...prev, checkpointId: e.target.value }))} 
                      />
                    </div>
                    <div className="form-group">
                      <label>通關狀態</label>
                      <select 
                        className="gm-select"
                        value={progressAdjust.isPerfect ? 'true' : 'false'} 
                        onChange={e => setProgressAdjust(prev => ({ ...prev, isPerfect: e.target.value === 'true' }))}
                      >
                        <option value="true">滿分通關 (Perfect Clear)</option>
                        <option value="false">一般通關 (Passed)</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: '1 / -1', textAlign: 'right' }}>
                      <button type="submit" className="gm-btn btn-gold">套用並手動變更</button>
                    </div>
                  </form>
                </div>

                <div className="gm-card">
                  <h3 style={{ color: 'var(--green-5)' }}>學員目前最遠進度快照</h3>
                  <div className="gm-table-container">
                    <table className="gm-table">
                      <thead>
                        <tr>
                          <th>學員代碼</th>
                          <th>暱稱</th>
                          <th>手動調整進度</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentsList.map(s => (
                          <tr key={s.id}>
                            <td>{s.anonymizedStudentCode}</td>
                            <td>{s.nickname || s.displayName}</td>
                            <td>
                              <button 
                                onClick={() => setProgressAdjust(prev => ({ ...prev, playerId: s.id }))} 
                                className="gm-btn btn-outline" 
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                              >
                                選取以調整
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* REWARDS TAB */}
            {activeTab === 'Rewards' && (
              <div className="gm-card">
                <h3 style={{ color: 'var(--green-5)' }}>🎁 派發系統獎勵與點數給學員</h3>
                <form onSubmit={handleGrantReward} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>受獎學員對象</label>
                      <select className="gm-select" value={grantTarget} onChange={e => setGrantTarget(e.target.value)}>
                        <option value="selected">所選取的多個學員</option>
                        <option value="all">全體註冊學員 (發放至所有人)</option>
                      </select>
                    </div>
                    
                    {grantTarget === 'selected' && (
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>點選要獎勵的學員 (按住 Ctrl 可複選)</label>
                        <select 
                          className="gm-select" 
                          multiple 
                          style={{ height: '150px' }}
                          value={selectedStudents}
                          onChange={e => {
                            const options = [...e.target.options];
                            const selected = options.filter(o => o.selected).map(o => o.value);
                            setSelectedStudents(selected);
                          }}
                        >
                          {studentsList.map(s => (
                            <option key={s.id} value={s.id}>{s.anonymizedStudentCode} - {s.nickname || s.displayName}</option>
                          ))}
                        </select>
                        <span style={{ fontSize: '0.8rem', color: '#4a5d4e' }}>目前選取了 {selectedStudents.length} 位學員</span>
                      </div>
                    )}

                    <div className="form-group">
                      <label>獎勵類型</label>
                      <select className="gm-select" value={rewardType} onChange={e => setRewardType(e.target.value)}>
                        <option value="points">💰 點數 (Points)</option>
                        <option value="badges">🏆 稱號勳章 (Badges)</option>
                        <option value="tokens">🎫 交易令牌 (Tokens)</option>
                        <option value="outfits">👕 虛擬分身服裝 (Outfits)</option>
                        <option value="items">🎒 功能性道具 (Items)</option>
                        <option value="stage_unlock">🔓 關卡解鎖權限 (Stage Unlock)</option>
                      </select>
                    </div>

                    {rewardType === 'points' ? (
                      <div className="form-group">
                        <label>點數數量 (可正或負值進行扣減)</label>
                        <input className="gm-input" type="number" value={rewardAmount} onChange={e => setRewardAmount(e.target.value)} />
                      </div>
                    ) : (
                      <div className="form-group">
                        <label>獎勵標籤 / 識別名稱 (Badge/Item name)</label>
                        <input className="gm-input" type="text" value={rewardDetail} onChange={e => setRewardDetail(e.target.value)} placeholder="例如：sdg_champion" />
                      </div>
                    )}

                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>發放理由 / 備註說明</label>
                      <input className="gm-input" type="text" value={grantReason} onChange={e => setGrantReason(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <button type="submit" className="gm-btn btn-gold">確認並發送獎勵</button>
                  </div>
                </form>

                {/* Point Transactions History */}
                <div style={{ marginTop: '2.5rem' }}>
                  <h4 style={{ color: 'var(--green-5)', marginBottom: '1rem' }}>📈 積分發放與交易歷程紀錄</h4>
                  {pointTransactions.length === 0 ? (
                    <p style={{ color: '#4a5d4e' }}>暫無積分交易紀錄。</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="gm-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid rgba(62, 154, 82, 0.15)' }}>
                            <th style={{ textAlign: 'left', padding: '0.75rem' }}>學員代碼</th>
                            <th style={{ textAlign: 'left', padding: '0.75rem' }}>調整量</th>
                            <th style={{ textAlign: 'left', padding: '0.75rem' }}>發放原因 / 備註</th>
                            <th style={{ textAlign: 'left', padding: '0.75rem' }}>時間</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pointTransactions.map(tx => {
                            const student = studentsList.find(x => x.id === tx.playerId);
                            const displayCode = student ? student.anonymizedStudentCode : tx.playerId;
                            return (
                              <tr key={tx.id} style={{ borderBottom: '1px solid rgba(62, 154, 82, 0.08)' }}>
                                <td style={{ padding: '0.75rem' }}>{displayCode}</td>
                                <td style={{ padding: '0.75rem', color: tx.amount >= 0 ? '#10b981' : '#dc2626', fontWeight: 'bold' }}>
                                  {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                                </td>
                                <td style={{ padding: '0.75rem' }}>{tx.reason}</td>
                                <td style={{ padding: '0.75rem', color: '#4a5d4e' }}>
                                  {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : '最近'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CHARACTERS TAB */}
            {/* CHARACTERS TAB */}
            {activeTab === 'Characters' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Sub-tab navigation */}
                <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(62, 154, 82, 0.2)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setCharSubTab('chains')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: charSubTab === 'chains' ? 'var(--green-5)' : '#9ca3af',
                      borderBottom: charSubTab === 'chains' ? '2px solid var(--green-5)' : 'none',
                      padding: '0.5rem 1rem',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    🧬 角色進化鏈列表 ({evolutionChains.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCharSubTab('upload');
                      if (!isEditingChain) {
                        setChainForm(initialChainForm);
                        setIsEditingChain(false);
                        setEditingChainId(null);
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: charSubTab === 'upload' ? 'var(--green-5)' : '#9ca3af',
                      borderBottom: charSubTab === 'upload' ? '2px solid var(--green-5)' : 'none',
                      padding: '0.5rem 1rem',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    {isEditingChain ? '✏️ 編輯角色進化鏈' : '➕ 上傳/建立角色進化鏈'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCharSubTab('players')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: charSubTab === 'players' ? 'var(--green-5)' : '#9ca3af',
                      borderBottom: charSubTab === 'players' ? '2px solid var(--green-5)' : 'none',
                      padding: '0.5rem 1rem',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    📊 學員角色進度監控
                  </button>
                </div>

                {/* SUBTAB 1: CHAINS LIST */}
                {charSubTab === 'chains' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Setting Section */}
                    <div className="gm-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid var(--green-4)' }}>
                      <div>
                        <h4 style={{ color: 'var(--green-5)', margin: 0 }}>⚙️ 角色更換與選擇機制</h4>
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#9ca3af' }}>設定玩家是否可以在個人資訊頁面更換持有的角色進度。</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={allowCharChange} 
                            onChange={(e) => setAllowCharChange(e.target.checked)} 
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>允許更換角色</span>
                        </label>
                        <button 
                          type="button" 
                          onClick={async () => {
                            setLoading(true);
                            try {
                              const res = await fetch(`${API_BASE}/api/admin/system-settings/character`, {
                                method: 'POST',
                                headers: await getHeaders(),
                                body: JSON.stringify({ allowCharacterChange: allowCharChange })
                              });
                              if (!res.ok) throw new Error('儲存設定失敗');
                              flashSuccess('角色選擇設定已成功儲存！');
                            } catch(e) {
                              flashError(e.message);
                            } finally {
                              setLoading(false);
                            }
                          }}
                          className="gm-btn btn-gold"
                          style={{ padding: '0.5rem 1rem' }}
                        >
                          儲存設定
                        </button>
                      </div>
                    </div>

                    {/* Validation message overlay */}
                    {activeChainValidation && (
                      <div className="gm-card" style={{ border: activeChainValidation.valid ? '1px solid #10b981' : '1px solid #dc2626', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <h4 style={{ color: activeChainValidation.valid ? '#10b981' : '#f87171', margin: 0 }}>
                            {activeChainValidation.valid ? '✅ 進化鏈完整性檢查通過' : '❌ 進化鏈完整性檢查有瑕疵'}
                          </h4>
                          <button type="button" className="gm-btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setActiveChainValidation(null)}>關閉</button>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>
                          進化鏈識別碼: <strong>{activeChainValidation.chainId}</strong>
                        </p>
                        {activeChainValidation.errors && activeChainValidation.errors.length > 0 ? (
                          <ul style={{ color: '#f87171', fontSize: '0.9rem', marginTop: '0.5rem', paddingLeft: '1.2rem' }}>
                            {activeChainValidation.errors.map((err, idx) => (
                              <li key={idx}>{err}</li>
                            ))}
                          </ul>
                        ) : (
                          <p style={{ color: '#34d399', fontSize: '0.9rem', marginTop: '0.5rem' }}>進化鏈結構完整！包含剛好 6 個階段，圖片與演化條件皆配置妥當。</p>
                        )}
                      </div>
                    )}

                    {/* Chains List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {evolutionChains.map((chain) => {
                        const char = chain.character;
                        return (
                          <div key={char.id} className="gm-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                              <div>
                                <h3 style={{ color: 'var(--green-5)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span>{char.name}</span>
                                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(212,175,55,0.2)', color: 'var(--green-5)', border: '1px solid rgba(212,175,55,0.3)' }}>
                                    {char.rarity}
                                  </span>
                                  {!char.isActive && (
                                    <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: '#374151', color: '#9ca3af' }}>已封存</span>
                                  )}
                                  {char.isStarterAvailable && (
                                    <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: '#10b981', color: '#fff' }}>初始Starter角色</span>
                                  )}
                                </h3>
                                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#9ca3af' }}>
                                  代碼: <strong>{char.characterCode}</strong> | 類型: {char.type} | 創立者: {char.createdBy}
                                </p>
                                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: '#e5e7eb' }}>{char.description || '無描述。'}</p>
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button 
                                  type="button" 
                                  onClick={() => validateChain(char.evolutionChainId)} 
                                  className="gm-btn btn-outline" 
                                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                                >
                                  🔍 驗證完整性
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => startEditChain(chain)} 
                                  className="gm-btn btn-outline" 
                                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                                >
                                  <Edit size={14} style={{ marginRight: '0.25rem' }} /> 編輯
                                </button>
                                {char.isActive && (
                                  <button 
                                    type="button" 
                                    onClick={() => archiveCharacter(char.id)} 
                                    className="gm-btn btn-danger" 
                                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                                  >
                                    <Archive size={14} style={{ marginRight: '0.25rem' }} /> 封存
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Stages timeline */}
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#9ca3af' }}>🐾 六階段進化預覽：</h4>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem' }}>
                                {chain.stages.map((stage) => (
                                  <div key={stage.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--green-4)', background: 'rgba(62,154,82,0.1)', padding: '0.15rem 0.4rem', borderRadius: '10px', marginBottom: '0.4rem' }}>
                                      St. {stage.stageNumber}
                                    </span>
                                    <img 
                                      src={stage.imageUrl || 'https://placehold.co/100'} 
                                      alt={stage.stageName} 
                                      style={{ width: '50px', height: '50px', objectFit: 'contain', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}
                                    />
                                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '0.4rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}>
                                      {stage.stageName || '未命名'}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}>
                                      {stage.stageTitle || '無稱號'}
                                    </div>
                                    <div 
                                      style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.25rem', width: '100%', height: '35px', overflow: 'hidden' }}
                                      title={renderHumanReadableConditions(stage.conditions)}
                                    >
                                      {stage.stageNumber === 1 ? '初始蛋形態' : (stage.conditions ? renderHumanReadableConditions(stage.conditions) : '無設定條件')}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {evolutionChains.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '4rem', color: '#4a5d4e' }}>
                          目前尚無 any 發布的角色進化鏈。請點擊上方「上傳/建立角色進化鏈」以發布第一個角色！
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* SUBTAB 2: UPLOAD / EDIT FORM */}
                {charSubTab === 'upload' && (
                  !isPreviewingChain ? (
                    <form onSubmit={(e) => { e.preventDefault(); setIsPreviewingChain(true); }} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <div className="gm-card">
                        <h3 style={{ color: 'var(--green-5)', margin: '0 0 1.25rem 0' }}>
                          {isEditingChain ? '✏️ 編輯角色主資料' : '➕ 建立全新角色進化鏈'}
                        </h3>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                          <div className="form-group">
                            <label>角色代碼 (characterCode - 建立後不可更改，必須唯一)</label>
                            <input 
                              className="gm-input" 
                              required 
                              disabled={isEditingChain} 
                              value={chainForm.character.characterCode} 
                              onChange={e => setChainForm({
                                ...chainForm,
                                character: { ...chainForm.character, characterCode: e.target.value }
                              })} 
                              placeholder="例如：ECO_DRAGON_001" 
                            />
                          </div>
                          
                          <div className="form-group">
                            <label>角色名稱</label>
                            <input 
                              className="gm-input" 
                              required 
                              value={chainForm.character.name} 
                              onChange={e => setChainForm({
                                ...chainForm,
                                character: { ...chainForm.character, name: e.target.value }
                              })} 
                              placeholder="例如：永續守護小綠龍" 
                            />
                          </div>

                          <div className="form-group">
                            <label>角色類型 (e.g. SDG_Eco, Financial, Indicator)</label>
                            <input 
                              className="gm-input" 
                              required 
                              value={chainForm.character.type} 
                              onChange={e => setChainForm({
                                ...chainForm,
                                character: { ...chainForm.character, type: e.target.value }
                              })} 
                              placeholder="例如：SDG_Eco" 
                            />
                          </div>

                          <div className="form-group">
                            <label>稀有度</label>
                            <select 
                              className="gm-input" 
                              required 
                              value={chainForm.character.rarity} 
                              onChange={e => setChainForm({
                                ...chainForm,
                                character: { ...chainForm.character, rarity: e.target.value }
                              })}
                            >
                              <option value="Normal">普通 (Normal)</option>
                              <option value="Rare">優秀 (Rare)</option>
                              <option value="Epic">史詩 (Epic)</option>
                              <option value="Legendary">傳說 (Legendary)</option>
                              <option value="Mythic">神話 (Mythic)</option>
                            </select>
                          </div>

                          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>角色描述與引言</label>
                            <textarea 
                              className="gm-textarea" 
                              rows="3" 
                              value={chainForm.character.description} 
                              onChange={e => setChainForm({
                                ...chainForm,
                                character: { ...chainForm.character, description: e.target.value }
                              })} 
                              placeholder="請輸入角色的背景故事或宣導引言..."
                            />
                          </div>

                          <div style={{ display: 'flex', gap: '2rem', gridColumn: '1 / -1' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={chainForm.character.isStarterAvailable} 
                                onChange={e => setChainForm({
                                  ...chainForm,
                                  character: { ...chainForm.character, isStarterAvailable: e.target.checked }
                                })} 
                              />
                              是否開放做為初始 Starter 角色 (玩家註冊後可選)
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={chainForm.character.isActive} 
                                onChange={e => setChainForm({
                                  ...chainForm,
                                  character: { ...chainForm.character, isActive: e.target.checked }
                                })} 
                              />
                              是否直接啟用發布
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* 6 Stages cards list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <h3 style={{ color: 'var(--green-5)', margin: 0 }}>🐾 設定進化鏈的 6 個階段圖片與進化條件 (必須完整設定 1~6 階段)</h3>
                        {chainForm.stages.map((stage, idx) => (
                          <div key={idx} className="gm-card" style={{ borderLeft: `4px solid ${idx === 0 ? '#10b981' : 'var(--green-4)'}` }}>
                            <h4 style={{ color: 'var(--green-5)', margin: '0 0 1rem 0' }}>
                              <span>第 {stage.stageNumber} 階段 {idx === 0 ? '🥚 (初始形態/蛋)' : idx === 5 ? '👑 (最終形態)' : `(第 ${stage.stageNumber} 形態)`}</span>
                            </h4>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
                              {/* Stage Left: Image Selection & Details */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="form-group">
                                  <label>階段名稱 (e.g. 永續守護卵, 覺醒綠能龍)</label>
                                  <input 
                                    className="gm-input" 
                                    required 
                                    value={stage.stageName} 
                                    onChange={e => handleStageFieldChange(idx, 'stageName', e.target.value)} 
                                    placeholder="例如：永續之卵"
                                  />
                                </div>

                                <div className="form-group">
                                  <label>階段進化稱號 (e.g. 綠能先鋒)</label>
                                  <input 
                                    className="gm-input" 
                                    required 
                                    value={stage.stageTitle} 
                                    onChange={e => handleStageFieldChange(idx, 'stageTitle', e.target.value)} 
                                    placeholder="例如：初生守護者"
                                  />
                                </div>

                                <div className="form-group">
                                  <label>階段描述</label>
                                  <textarea 
                                    className="gm-textarea" 
                                    rows="3" 
                                    required 
                                    value={stage.description} 
                                    onChange={e => handleStageFieldChange(idx, 'description', e.target.value)} 
                                    placeholder="請輸入此階段的簡介或故事..."
                                  />
                                </div>
                              </div>

                              {/* Stage Right: Image upload & condition selector */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="form-group">
                                  <label>階段圖片</label>
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <input 
                                      type="file" 
                                      accept="image/*" 
                                      className="gm-input" 
                                      style={{ flex: 1 }}
                                      onChange={e => handleStageImageUpload(e, idx)} 
                                    />
                                    <button 
                                      type="button" 
                                      className="gm-btn btn-outline" 
                                      style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}
                                      onClick={() => {
                                        setLibraryModalTarget('stage');
                                        setLibraryModalStageIndex(idx);
                                        setShowImageLibraryModal(true);
                                      }}
                                    >
                                      從媒體庫選擇
                                    </button>
                                  </div>
                                  {stage.imageUrl && (
                                    <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <span style={{ fontSize: '0.85rem', color: 'var(--green-5)' }}>預覽：</span>
                                      <img 
                                        src={stage.imageUrl} 
                                        alt="Stage Preview" 
                                        style={{ width: '60px', height: '60px', borderRadius: '4px', objectFit: 'contain', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--green-4)' }} 
                                      />
                                      <button 
                                        type="button" 
                                        className="gm-btn" 
                                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', background: '#dc2626', color: '#fff', border: 'none' }} 
                                        onClick={() => handleStageFieldChange(idx, 'imageUrl', '')}
                                      >
                                        移除
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Conditions Editor */}
                                {renderStageConditionsEditor(stage, idx)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Form footer */}
                      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', padding: '1rem 0' }}>
                        <button 
                          type="button" 
                          className="gm-btn btn-outline" 
                          onClick={() => {
                            setIsEditingChain(false);
                            setEditingChainId(null);
                            setChainForm(initialChainForm);
                            setCharSubTab('chains');
                          }}
                        >
                          取消並返回列表
                        </button>
                        <button type="submit" className="gm-btn btn-gold" style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
                          👀 預覽進化鏈設定
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="gm-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(62,154,82,0.1)', paddingBottom: '0.75rem' }}>
                        <h3 style={{ color: 'var(--green-5)', margin: 0 }}>🧬 預覽角色進化鏈設定：{chainForm.character.name}</h3>
                        <button type="button" className="gm-btn btn-outline" onClick={() => setIsPreviewingChain(false)}>
                          返回修改
                        </button>
                      </div>

                      {/* Metadata block */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '6px' }}>
                        <div>
                          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>角色代碼 (characterCode)</span>
                          <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{chainForm.character.characterCode}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>角色名稱</span>
                          <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{chainForm.character.name}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>類型 / 稀有度</span>
                          <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{chainForm.character.type} / {chainForm.character.rarity}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>初始 Starter 可選 / 是否啟用</span>
                          <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                            {chainForm.character.isStarterAvailable ? '是 (Starter可用)' : '否'} / {chainForm.character.isActive ? '是 (啟用中)' : '否'}
                          </div>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>角色描述</span>
                          <div style={{ fontSize: '0.95rem', marginTop: '0.25rem' }}>{chainForm.character.description || '(無)'}</div>
                        </div>
                      </div>

                      {/* Stages checklist block */}
                      <div>
                        <h4 style={{ color: 'var(--green-5)', margin: '0 0 1rem 0' }}>🐾 6 階段完整進化鏈：</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
                          {chainForm.stages.map((st, idx) => (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 'bold', color: 'var(--green-5)', fontSize: '1rem' }}>Stage {st.stageNumber}</span>
                                <span style={{ fontSize: '0.8rem', background: 'rgba(62,154,82,0.1)', padding: '0.15rem 0.5rem', borderRadius: '10px', color: 'var(--green-4)' }}>
                                  {st.stageName}
                                </span>
                              </div>
                              
                              <div style={{ display: 'flex', justifyContent: 'center', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '6px' }}>
                                <img 
                                  src={st.imageUrl || 'https://placehold.co/150'} 
                                  alt={st.stageName} 
                                  style={{ width: '100px', height: '100px', objectFit: 'contain' }}
                                />
                              </div>

                              <div>
                                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>進化稱號</span>
                                <div style={{ fontWeight: 'bold' }}>{st.stageTitle || '未設定稱號'}</div>
                              </div>

                              <div>
                                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>描述</span>
                                <div style={{ fontSize: '0.85rem', color: '#e5e7eb', height: '60px', overflowY: 'auto' }}>{st.description || '無描述。'}</div>
                              </div>

                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>進化所需條件：</span>
                                <div style={{ fontSize: '0.85rem', color: 'var(--green-4)', fontWeight: 'bold', marginTop: '0.25rem' }}>
                                  {idx === 0 ? '無條件 (第一階段/初始持有)' : renderHumanReadableConditions(st.conditions)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Confirm publish button */}
                      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid rgba(62,154,82,0.1)', paddingTop: '1.25rem' }}>
                        <button type="button" className="gm-btn btn-outline" onClick={() => setIsPreviewingChain(false)}>
                          返回修改
                        </button>
                        <button 
                          type="button" 
                          onClick={handleChainFormSubmit} 
                          className="gm-btn btn-gold" 
                          style={{ padding: '0.75rem 2rem', fontSize: '1.1rem' }}
                        >
                          🚀 確定儲存並發布角色進化鏈
                        </button>
                      </div>
                    </div>
                  )
                )}

                {/* SUBTAB 3: PLAYER PROGRESS */}
                {charSubTab === 'players' && (
                  <div className="gm-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ color: 'var(--green-5)', margin: 0 }}>📊 學員角色與進化進度監控</h3>
                      <button 
                        type="button" 
                        onClick={fetchPlayerProgressList} 
                        className="gm-btn btn-outline" 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.75rem' }}
                      >
                        <RefreshCw size={14} /> 重新整理
                      </button>
                    </div>

                    <div className="gm-table-container">
                      <table className="gm-table">
                        <thead>
                          <tr>
                            <th>學員代碼</th>
                            <th>學員姓名</th>
                            <th>持有角色名稱</th>
                            <th>角色代碼</th>
                            <th style={{ textAlign: 'center' }}>目前階段</th>
                            <th>上次進化時間</th>
                            <th>累計積分</th>
                            <th style={{ textAlign: 'center' }}>操作管理</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playerProgressList.map((p) => (
                            <tr key={p.id || p.playerId}>
                              <td><strong>{p.anonymizedStudentCode || '無'}</strong></td>
                              <td>{p.displayName || '無'}</td>
                              <td>{p.characterName || '未選擇'}</td>
                              <td>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{p.characterCode || '-'}</span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className="gold-badge" style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--green-5)' }}>
                                  Stage {p.currentEvolutionStage || 1} / 6
                                </span>
                              </td>
                              <td>{p.lastEvolutionAt ? new Date(p.lastEvolutionAt).toLocaleString() : '尚未進化'}</td>
                              <td>{p.points || 0}</td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                  <button 
                                    type="button"
                                    className="gm-btn btn-gold" 
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                    disabled={!p.selectedEvolutionChainId || p.currentEvolutionStage >= 6}
                                    onClick={() => handleForceEvolve(p.id || p.playerId)}
                                  >
                                    ⚡ 手動進化
                                  </button>
                                  <button 
                                    type="button"
                                    className="gm-btn btn-danger" 
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                    disabled={!p.selectedEvolutionChainId || p.currentEvolutionStage <= 1}
                                    onClick={() => handleResetCharacter(p.id || p.playerId)}
                                  >
                                    ↩️ 重置
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {playerProgressList.length === 0 && (
                            <tr>
                              <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>目前暫無任何學員進度資料。</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SCENES TAB */}
            {activeTab === 'Scenes' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                <div className="gm-card">
                  <h3 style={{ color: 'var(--green-5)' }}>{isEditingScene ? '編輯學習場景' : '新增學習場景'}</h3>
                  <form onSubmit={handleSceneSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="form-group">
                      <label>場景名稱</label>
                      <input className="gm-input" required value={sceneForm.name} onChange={e => setSceneForm({...sceneForm, name: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>關聯世界編號 (Linked World ID)</label>
                      <input className="gm-input" value={sceneForm.linkedWorldId} onChange={e => setSceneForm({...sceneForm, linkedWorldId: e.target.value})} placeholder="例如：world_1" />
                    </div>
                    <div className="form-group">
                      <label>場景背景地圖圖片 (選擇上傳以自訂地圖背景)</label>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="gm-input" 
                          style={{ flex: 1 }}
                          onChange={async (e) => {
                            if (e.target.files.length) {
                              try {
                                const file = e.target.files[0];
                                const compressed = await compressImage(file, 400, 300, 0.75);
                                
                                // Post to backend image library immediately to store in DB
                                const response = await fetch(`${API_BASE}/api/admin/images-library`, {
                                  method: 'POST',
                                  headers: await getHeaders(),
                                  body: JSON.stringify({
                                    imageUrl: compressed,
                                    name: file.name,
                                    type: 'scene'
                                  })
                                });
                                
                                if (response.ok) {
                                  const savedImage = await response.json();
                                  setSceneForm({ ...sceneForm, imageUrl: savedImage.imageUrl });
                                  fetchImagesLibrary();
                                } else {
                                  setSceneForm({ ...sceneForm, imageUrl: compressed });
                                }
                              } catch (err) {
                                alert('圖片讀取或儲存失敗：' + err.message);
                              }
                            }
                          }} 
                        />
                        <button 
                          type="button" 
                          className="gm-btn btn-outline" 
                          style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}
                          onClick={() => {
                            setLibraryModalTarget('scene');
                            setShowImageLibraryModal(true);
                          }}
                        >
                          從媒體庫選擇
                        </button>
                      </div>
                      {sceneForm.imageUrl && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--green-5)' }}>預覽：</span>
                          <img src={sceneForm.imageUrl} alt="Scene Preview" style={{ width: '80px', height: '60px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--green-4)' }} />
                          <button type="button" className="gm-btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', background: '#dc2626', color: '#fff', border: 'none' }} onClick={() => setSceneForm({ ...sceneForm, imageUrl: '' })}>移除</button>
                        </div>
                      )}
                    </div>
                    <div className="form-group">
                      <label>場景故事與場景描述</label>
                      <textarea className="gm-textarea" rows="4" value={sceneForm.description} onChange={e => setSceneForm({...sceneForm, description: e.target.value})} />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                      {isEditingScene && (
                        <button type="button" className="gm-btn btn-outline" onClick={() => {
                          setIsEditingScene(false);
                          setSceneForm({ id: '', name: '', description: '', linkedWorldId: '', imageUrl: '' });
                        }}>取消編輯</button>
                      )}
                      <button type="submit" className="gm-btn btn-gold">儲存場景</button>
                    </div>
                  </form>
                </div>

                <div className="gm-card">
                  <h3 style={{ color: 'var(--green-5)' }}>既有學習場景列表</h3>
                  <div className="gm-table-container">
                    <table className="gm-table">
                      <thead>
                        <tr>
                          <th>場景地圖</th>
                          <th>場景名稱</th>
                          <th>關聯世界</th>
                          <th>說明描述</th>
                          <th>狀態</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scenes.map(s => (
                          <tr key={s.id}>
                            <td>
                              {s.imageUrl ? (
                                <img src={s.imageUrl} alt={s.name} style={{ width: '60px', height: '45px', borderRadius: '6px', objectFit: 'cover', border: '1px solid rgba(62, 154, 82, 0.4)' }} />
                              ) : (
                                <span style={{ color: '#4a5d4e', fontSize: '0.85rem' }}>無地圖</span>
                              )}
                            </td>
                            <td><strong>{s.name}</strong></td>
                            <td>{s.linkedWorldId}</td>
                            <td>{s.description}</td>
                            <td>
                              <span className="gold-badge" style={{ background: s.status === 'active' ? '#10b981' : '#4b5563', color: '#fff' }}>{s.status}</span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="gm-btn btn-outline" style={{ padding: '0.25rem 0.5rem' }} onClick={() => {
                                  setIsEditingScene(true);
                                  setSceneForm(s);
                                }}><Edit size={14} /></button>
                                <button className="gm-btn btn-danger" style={{ padding: '0.25rem 0.5rem' }} onClick={() => archiveScene(s.id)}><Archive size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ITEMS TAB */}
            {activeTab === 'Items' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                <div className="gm-card">
                  <h3 style={{ color: 'var(--green-5)' }}>{isEditingItem ? '編輯服裝道具' : '新增服裝道具'}</h3>
                  <form onSubmit={handleItemSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="form-group">
                      <label>服裝/道具名稱</label>
                      <input className="gm-input" required value={itemForm.name} onChange={e => setItemForm({...itemForm, name: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>道具功能效果效果描述 (Effect)</label>
                      <input className="gm-input" value={itemForm.effect} onChange={e => setItemForm({...itemForm, effect: e.target.value})} placeholder="例如：加倍點數、回答時間延長" />
                    </div>
                    <div className="form-group">
                      <label>服裝/道具故事描述</label>
                      <textarea className="gm-textarea" rows="4" value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})} />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                      {isEditingItem && (
                        <button type="button" className="gm-btn btn-outline" onClick={() => {
                          setIsEditingItem(false);
                          setItemForm({ id: '', name: '', description: '', effect: '' });
                        }}>取消編輯</button>
                      )}
                      <button type="submit" className="gm-btn btn-gold">儲存項目</button>
                    </div>
                  </form>
                </div>

                <div className="gm-card">
                  <h3 style={{ color: 'var(--green-5)' }}>既有服裝道具列表</h3>
                  <div className="gm-table-container">
                    <table className="gm-table">
                      <thead>
                        <tr>
                          <th>道具/服裝名稱</th>
                          <th>功能效果</th>
                          <th>狀態</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(it => (
                          <tr key={it.id}>
                            <td><strong>{it.name}</strong></td>
                            <td>{it.effect}</td>
                            <td>
                              <span className="gold-badge" style={{ background: it.status === 'active' ? '#10b981' : '#4b5563', color: '#fff' }}>{it.status}</span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="gm-btn btn-outline" style={{ padding: '0.25rem 0.5rem' }} onClick={() => {
                                  setIsEditingItem(true);
                                  setItemForm(it);
                                }}><Edit size={14} /></button>
                                <button className="gm-btn btn-danger" style={{ padding: '0.25rem 0.5rem' }} onClick={() => archiveItem(it.id)}><Archive size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* INTRODUCTIONS TAB */}
            {activeTab === 'Introductions' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                <div className="gm-card">
                  <h3 style={{ color: 'var(--green-5)' }}>{isEditingIntro ? '編輯引言與教學內容' : '新增引言與教學內容'}</h3>
                  <form onSubmit={handleIntroSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="form-group">
                      <label>對象類型</label>
                      <select className="gm-select" value={introForm.targetType} onChange={e => setIntroForm({...introForm, targetType: e.target.value})}>
                        <option value="general">一般學習引言 (General)</option>
                        <option value="character">分身角色關聯 (Character)</option>
                        <option value="scene">場景引言 (Scene)</option>
                        <option value="item">道具與服裝故事 (Item)</option>
                        <option value="world">SDGs 世界單元指標說明 (World)</option>
                        <option value="stage">關卡階段引言 (Stage)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>關聯的目標 ID (Target ID)</label>
                      <input className="gm-input" value={introForm.targetId} onChange={e => setIntroForm({...introForm, targetId: e.target.value})} placeholder="例如：world_1, stage_5" />
                    </div>
                    <div className="form-group">
                      <label>引言標題</label>
                      <input className="gm-input" required value={introForm.title} onChange={e => setIntroForm({...introForm, title: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>引言正文內容 / 永續知識學習背景</label>
                      <textarea className="gm-textarea" required rows="6" value={introForm.content} onChange={e => setIntroForm({...introForm, content: e.target.value})} />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                      {isEditingIntro && (
                        <button type="button" className="gm-btn btn-outline" onClick={() => {
                          setIsEditingIntro(false);
                          setIntroForm({ id: '', targetType: 'general', targetId: '', title: '', content: '' });
                        }}>取消編輯</button>
                      )}
                      <button type="submit" className="gm-btn btn-gold">儲存內容</button>
                    </div>
                  </form>
                </div>

                <div className="gm-card">
                  <h3 style={{ color: 'var(--green-5)' }}>既有引言與教學內容列表</h3>
                  <div className="gm-table-container">
                    <table className="gm-table">
                      <thead>
                        <tr>
                          <th>對象</th>
                          <th>關聯 ID</th>
                          <th>引言標題</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {introductions.map(intro => (
                          <tr key={intro.id}>
                            <td><span className="gold-badge" style={{ background: '#3b82f6', color: '#fff' }}>{intro.targetType}</span></td>
                            <td>{intro.targetId || 'All'}</td>
                            <td><strong>{intro.title}</strong></td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="gm-btn btn-outline" style={{ padding: '0.25rem 0.5rem' }} onClick={() => {
                                  setIsEditingIntro(true);
                                  setIntroForm(intro);
                                }}><Edit size={14} /></button>
                                <button className="gm-btn btn-danger" style={{ padding: '0.25rem 0.5rem' }} onClick={() => deleteIntroduction(intro.id)}><Trash size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ANNOUNCEMENTS TAB */}
            {activeTab === 'Announcements' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                <div className="gm-card">
                  <h3 style={{ color: 'var(--green-5)' }}>{isEditingAnn ? '編輯系統公告' : '新增發布公告'}</h3>
                  <form onSubmit={handleAnnSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="form-group">
                      <label>公告標題</label>
                      <input className="gm-input" required value={annForm.title} onChange={e => setAnnForm({...annForm, title: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>公告狀態</label>
                      <select className="gm-select" value={annForm.status} onChange={e => setAnnForm({...annForm, status: e.target.value})}>
                        <option value="active">作用中 (Active - 顯示於學員首頁)</option>
                        <option value="archived">封存 (Archived - 隱藏)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>公告正文內容</label>
                      <textarea className="gm-textarea" required rows="6" value={annForm.content} onChange={e => setAnnForm({...annForm, content: e.target.value})} />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                      {isEditingAnn && (
                        <button type="button" className="gm-btn btn-outline" onClick={() => {
                          setIsEditingAnn(false);
                          setAnnForm({ id: '', title: '', content: '', status: 'active' });
                        }}>取消編輯</button>
                      )}
                      <button type="submit" className="gm-btn btn-gold">儲存發布</button>
                    </div>
                  </form>
                </div>

                <div className="gm-card">
                  <h3 style={{ color: 'var(--green-5)' }}>公告列表</h3>
                  <div className="gm-table-container">
                    <table className="gm-table">
                      <thead>
                        <tr>
                          <th>公告標題</th>
                          <th>發布日期</th>
                          <th>狀態</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {announcements.map(ann => (
                          <tr key={ann.id}>
                            <td><strong>{ann.title}</strong></td>
                            <td>{new Date(ann.createdAt).toLocaleDateString()}</td>
                            <td>
                              <span className="gold-badge" style={{ background: ann.status === 'active' ? '#10b981' : '#4b5563', color: '#fff' }}>{ann.status}</span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="gm-btn btn-outline" style={{ padding: '0.25rem 0.5rem' }} onClick={() => {
                                  setIsEditingAnn(true);
                                  setAnnForm(ann);
                                }}><Edit size={14} /></button>
                                <button className="gm-btn btn-danger" style={{ padding: '0.25rem 0.5rem' }} onClick={() => archiveAnnouncement(ann.id)}><Archive size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* WORLDS & LEVELS TAB */}
            {activeTab === 'Worlds & Levels' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className="form-grid">
                  <div className="gm-card">
                    <h3 style={{ color: 'var(--green-5)' }}>🔓 開啟新的世界、階段與 Checkpoint</h3>
                    <form onSubmit={handleOpenWorldProgress} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="form-group">
                        <label>世界 ID (World ID)</label>
                        <input className="gm-input" type="text" value={worldForm.worldId} onChange={e => setWorldForm({ ...worldForm, worldId: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>階段 ID (Stage ID)</label>
                        <input className="gm-input" type="text" value={worldForm.stageId} onChange={e => setWorldForm({ ...worldForm, stageId: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>檢查點 ID (Checkpoint ID)</label>
                        <input className="gm-input" type="text" value={worldForm.checkpointId} onChange={e => setWorldForm({ ...worldForm, checkpointId: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>必須滿分通過才能解鎖下一關 (Perfect Clear Required)</label>
                        <select className="gm-select" value={worldForm.perfectClearRequired ? 'true' : 'false'} onChange={e => setWorldForm({ ...worldForm, perfectClearRequired: e.target.value === 'true' })}>
                          <option value="true">是 (Perfect Required)</option>
                          <option value="false">否 (Any Clear Required)</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>目標通關要求段落 (Target Progress)</label>
                        <input className="gm-input" type="text" value={worldForm.targetProgress} onChange={e => setWorldForm({ ...worldForm, targetProgress: e.target.value })} />
                      </div>
                      <button type="submit" className="gm-btn btn-gold">設定開放並開啟</button>
                    </form>
                  </div>

                  <div className="gm-card">
                    <h3 style={{ color: 'var(--green-5)' }}>🔄 將世界重新開始新的一輪 (Restart Round)</h3>
                    <form onSubmit={handleRestartWorld} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="form-group">
                        <label>選擇重置世界 ID</label>
                        <input className="gm-input" type="text" value={restartForm.worldId} onChange={e => setRestartForm({ ...restartForm, worldId: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>重置的挑戰輪次 ID (Round ID)</label>
                        <input className="gm-input" type="text" value={restartForm.roundId} onChange={e => setRestartForm({ ...restartForm, roundId: e.target.value })} />
                      </div>
                      <button type="submit" className="gm-btn btn-danger">啟動新挑戰輪次</button>
                    </form>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="gm-card">
                    <h3 style={{ color: 'var(--green-5)' }}>👯 複製既有指標學習世界 (Duplicate World)</h3>
                    <form onSubmit={handleDuplicateWorld} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="form-group">
                        <label>來源世界 ID (Source World ID)</label>
                        <input className="gm-input" type="text" value={duplicateForm.srcWorldId} onChange={e => setDuplicateForm({ ...duplicateForm, srcWorldId: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>新世界 ID (New World ID)</label>
                        <input className="gm-input" type="text" value={duplicateForm.newWorldId} onChange={e => setDuplicateForm({ ...duplicateForm, newWorldId: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>新世界名稱 (New World Name)</label>
                        <input className="gm-input" type="text" value={duplicateForm.newWorldName} onChange={e => setDuplicateForm({ ...duplicateForm, newWorldName: e.target.value })} />
                      </div>
                      <button type="submit" className="gm-btn btn-gold">確認複製</button>
                    </form>
                  </div>

                  <div className="gm-card">
                    <h3 style={{ color: 'var(--green-5)' }}>📦 封存世界關卡</h3>
                    <form onSubmit={handleArchiveWorld} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="form-group">
                        <label>輸入欲封存世界 ID (World ID)</label>
                        <input className="gm-input" type="text" value={archiveWorldId} onChange={e => setArchiveWorldId(e.target.value)} />
                      </div>
                      <button type="submit" className="gm-btn btn-danger">執行世界封存</button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* QUESTION BANK TAB */}
            {activeTab === 'Question Bank' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className="gm-card">
                  <h3 style={{ color: 'var(--green-5)' }}>📂 驗證並上傳/匯入問答題庫 (XLSX / CSV)</h3>
                  <form onSubmit={handleUploadPreview} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label>題庫標題 (Title)</label>
                        <input className="gm-input" required value={bankMetadata.title} onChange={e => setBankMetadata({...bankMetadata, title: e.target.value})} placeholder="例如：SDGs 永續金融白皮書世界 1 題庫" />
                      </div>
                      <div className="form-group">
                        <label>預設科目 (Subject)</label>
                        <input className="gm-input" value={bankMetadata.subject} onChange={e => setBankMetadata({...bankMetadata, subject: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label>預設章節名稱 (Chapter)</label>
                        <input className="gm-input" value={bankMetadata.chapter} onChange={e => setBankMetadata({...bankMetadata, chapter: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label>題庫可見性 (Visibility)</label>
                        <select className="gm-select" value={bankMetadata.visibility} onChange={e => setBankMetadata({...bankMetadata, visibility: e.target.value})}>
                          <option value="public">公開 (Public)</option>
                          <option value="private">私人限制 (Private)</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>選擇 Excel 題庫檔案 (.xlsx)</label>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <input type="file" accept=".xlsx" onChange={handleFileChange} style={{ color: '#4a5d4e' }} />
                        <button type="submit" className="gm-btn btn-gold">上傳並預覽驗證</button>
                      </div>
                    </div>
                  </form>
                </div>

                {previewData && (
                  <div className="gm-card" style={{ border: '2px solid rgba(62,154,82,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(62,154,82,0.1)', paddingBottom: '1rem' }}>
                      <div>
                        <h4 style={{ color: 'var(--green-5)', margin: 0 }}>📊 上傳預覽驗證摘要結果</h4>
                        <p style={{ margin: '0.25rem 0 0 0', color: '#4a5d4e' }}>
                          總列數: {previewData.summary.totalRows} | 
                          <span style={{ color: '#10b981', fontWeight: 'bold' }}> 合格列: {previewData.summary.validRows} </span> | 
                          <span style={{ color: '#dc2626', fontWeight: 'bold' }}> 不合格/有錯誤列: {previewData.summary.invalidRows} </span>
                        </p>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>
                          <input 
                            type="checkbox" 
                            checked={importValidOnly} 
                            onChange={e => setImportValidOnly(e.target.checked)} 
                            style={{ width: '18px', height: '18px' }} 
                          />
                          僅匯入驗證通過列 (過濾不合格列)
                        </label>
                        <button 
                          onClick={handleCommitImport} 
                          className="gm-btn btn-gold"
                          disabled={!importValidOnly && previewData.summary.invalidRows > 0}
                        >
                          確認送出並保存題庫
                        </button>
                      </div>
                    </div>

                    {!importValidOnly && previewData.summary.invalidRows > 0 && (
                      <div style={{ padding: '0.8rem', background: 'rgba(220, 38, 38, 0.08)', color: '#dc2626', borderRadius: '8px', border: '1px solid rgba(220, 38, 38, 0.2)', margin: '1rem 0', fontSize: '0.85rem' }}>
                        ⚠️ 偵測到試算表內容包含格式驗證錯誤。若要強行匯入其餘合格題目，請勾選右上角的「僅匯入驗證通過列」。
                      </div>
                    )}

                    <div className="gm-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      <table className="gm-table">
                        <thead>
                          <tr>
                            <th>列號</th>
                            <th>題目內容</th>
                            <th>標準答案</th>
                            <th>驗證狀態</th>
                            <th>錯誤詳情</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.rows.map(row => (
                            <tr key={row.rowNumber} style={{ background: row.valid ? 'transparent' : 'rgba(220,38,38,0.04)' }}>
                              <td>{row.rowNumber}</td>
                              <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.question.Question || row.question.prompt}</td>
                              <td>{row.question.Answer || row.question.answer}</td>
                              <td>
                                {row.valid ? (
                                  <span style={{ color: '#10b981', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Check size={16} /> 通過</span>
                                ) : (
                                  <span style={{ color: '#dc2626', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><X size={16} /> 錯誤</span>
                                )}
                              </td>
                              <td style={{ color: '#dc2626', fontSize: '0.85rem' }}>
                                {row.errors.map((e, idx) => <div key={idx}>• {e.message}</div>)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AUDIT LOGS TAB */}
            {activeTab === 'Audit Logs' && (
              <div className="gm-card">
                <h3 style={{ color: 'var(--green-5)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <History size={20} /> 🛡️ GMTeacherAdminActionLog 管理員特權操作稽核日誌
                </h3>
                <p style={{ color: '#4a5d4e', fontSize: '0.85rem' }}>本紀錄為伺服器端資料庫寫入之不可篡改稽核紀錄，供平台安全合規與營運透明查驗。</p>
                <div className="gm-table-container">
                  <table className="gm-table">
                    <thead>
                      <tr>
                        <th>日誌 ID</th>
                        <th>操作時間</th>
                        <th>執行人 ID</th>
                        <th>信箱</th>
                        <th>動作類型 (actionType)</th>
                        <th>對象 (targetType)</th>
                        <th>動作描述 (description)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr key={log.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.id}</td>
                          <td>{new Date(log.createdAt).toLocaleString()}</td>
                          <td style={{ fontFamily: 'monospace' }}>{log.actorUserId}</td>
                          <td>{log.actorEmail}</td>
                          <td>
                            <span className="gold-badge" style={{ padding: '0.1rem 0.5rem', fontSize: '0.75rem' }}>{log.actionType}</span>
                          </td>
                          <td>{log.targetType || '無'}</td>
                          <td style={{ fontWeight: 'bold', color: '#fff' }}>{log.description}</td>
                        </tr>
                      ))}
                      {!auditLogs.length && <tr><td colSpan="7" style={{ textAlign: 'center' }}>查無任何操作稽核日誌。</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Image Library Selector Modal */}
      {showImageLibraryModal && (
        <div className="gm-modal-overlay" onClick={() => setShowImageLibraryModal(false)}>
          <div className="gm-modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(62, 154, 82, 0.1)', paddingBottom: '1rem' }}>
              <h3 style={{ color: 'var(--green-5)', margin: 0 }}>
                📂 從既有圖片媒體庫選擇 ({libraryModalTarget === 'character' ? '角色頭像' : '關卡背景場景'})
              </h3>
              <button 
                type="button" 
                className="gm-btn btn-outline" 
                style={{ padding: '0.25rem 0.5rem', borderRadius: '50%' }}
                onClick={() => setShowImageLibraryModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            
             <div className="gm-gallery-grid">
              {getCombinedImageLibrary()
                .filter(img => {
                  if (libraryModalTarget === 'stage') return img.type === 'character';
                  return img.type === libraryModalTarget;
                })
                .map((img, index) => (
                  <div 
                    key={img.id || index}
                    className={`gm-gallery-item ${(
                      libraryModalTarget === 'stage' 
                        ? (chainForm.stages[libraryModalStageIndex]?.imageUrl === img.imageUrl) 
                        : (libraryModalTarget === 'character' ? charForm.imageUrl : sceneForm.imageUrl) === img.imageUrl
                    ) ? 'selected' : ''}`}
                    onClick={() => {
                      if (libraryModalTarget === 'stage' && libraryModalStageIndex !== null) {
                        const updatedStages = [...chainForm.stages];
                        updatedStages[libraryModalStageIndex] = {
                          ...updatedStages[libraryModalStageIndex],
                          imageUrl: img.imageUrl
                        };
                        setChainForm({ ...chainForm, stages: updatedStages });
                      } else if (libraryModalTarget === 'character') {
                        // Legacy character form support (no-op in evolution chains)
                      } else if (libraryModalTarget === 'scene') {
                        setSceneForm({ ...sceneForm, imageUrl: img.imageUrl });
                      }
                      setShowImageLibraryModal(false);
                    }}
                  >
                    <img src={img.imageUrl} alt={img.name} className="gm-gallery-thumb" />
                    <div className="gm-gallery-name" title={img.name}>{img.name}</div>
                  </div>
                ))}
              {getCombinedImageLibrary().filter(img => {
                if (libraryModalTarget === 'stage') return img.type === 'character';
                return img.type === libraryModalTarget;
              }).length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: '#4a5d4e' }}>
                  目前媒體庫中暫無任何圖片。上傳新圖片後將自動存入媒體庫中。
                </div>
              )}
            </div>
            
            <div style={{ textAlign: 'right' }}>
              <button 
                type="button" 
                className="gm-btn btn-gold" 
                onClick={() => setShowImageLibraryModal(false)}
              >
                關閉媒體庫
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
