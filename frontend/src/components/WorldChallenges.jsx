import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, addDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Play, ArrowLeft, CheckCircle2, XCircle, Flame, Trophy, Lock, RefreshCw, User, Map as MapIcon } from 'lucide-react';
import ParticleButton from './ParticleButton';

// Pure helper functions outside component to satisfy hook purity rules
const getCurrentTime = () => Date.now();
const getCurrentISO = () => new Date().toISOString();
const xpNeededForLevel = (level) => 100 + Math.max(0, Number(level || 1) - 1) * 50;
const levelFromExperience = (experience = 0) => {
  let level = 1;
  let remaining = Math.max(0, Number(experience) || 0);
  while (remaining >= xpNeededForLevel(level) && level < 999) {
    remaining -= xpNeededForLevel(level);
    level += 1;
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: xpNeededForLevel(level) };
};
const stageFromLevel = (level = 1) => Math.min(6, Math.max(1, Math.floor(Number(level || 1) / 5) + 1));
const numericPart = (value, fallback = 0) => parseInt(String(value || '').replace(/\D/g, ''), 10) || fallback;

export default function WorldChallenges({ currentUser, onGoBack, API_BASE_URL, onEvolveTriggered }) {
  const [view, setView] = useState('world_select'); // world_select, stage_select, playing, result, leaderboard
  const [loading, setLoading] = useState(true);
  const [worlds, setWorlds] = useState([]);
  const [selectedWorld, setSelectedWorld] = useState(null);
  const [progress, setProgress] = useState({}); // key: `${worldId}_${stageId}_${checkpointId}_${roundId}`, val: progressData
  const [worldSettings, setWorldSettings] = useState({}); // key: `world_${worldId}`, val: settingsData
  const [error, setError] = useState(null);
  
  // Active Challenge State
  const [activeStage, setActiveStage] = useState(null);
  const [activeCheckpoint, setActiveCheckpoint] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [answersLog, setAnswersLog] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [feedback, setFeedback] = useState(null); // { isCorrect, correctOption, points }
  const [quizStartedAt, setQuizStartedAt] = useState(null);
  const [timerId, setTimerId] = useState(null);
  
  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [competitionTarget, setCompetitionTarget] = useState(null);
  const [firstClearHistory, setFirstClearHistory] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch World settings
      const settingsSnap = await getDocs(collection(db, "WorldSettings"));
      const settingsMap = {};
      settingsSnap.forEach((doc) => {
        settingsMap[doc.id] = doc.data();
      });
      setWorldSettings(settingsMap);

      // 2. Fetch active worlds from "Worlds"
      const worldsSnap = await getDocs(query(collection(db, "Worlds"), where("isArchived", "==", false)));
      let worldsData = [];
      worldsSnap.forEach((doc) => {
        worldsData.push({ id: doc.id, ...doc.data() });
      });

      // Seeding if empty
      if (worldsData.length === 0) {
        const batch = [];
        for (let w = 1; w <= 20; w++) {
          const worldId = `world_${w}`;
          const activeRoundId = `world_${w}_round_1`;
          const defaultWorld = {
            id: worldId,
            name: `世界 ${w}: SDGs 主題領域`,
            worldTemplateId: `template_${w}`,
            sourceWorldId: null,
            duplicatedFromWorldId: null,
            restartedFromRoundId: null,
            roundVersion: 1,
            isArchived: false,
            archivedAt: null,
            activeRoundId: activeRoundId,
            perfectClearRequired: true,
            stages: Array.from({length: 10}, (_, stageIdx) => ({
              id: stageIdx + 1,
              name: `階段 ${stageIdx + 1}`,
              perfectClearRequired: true,
              checkpoints: [
                {
                  id: `cp_${stageIdx + 1}`,
                  name: `Checkpoint ${stageIdx + 1}`,
                  questionCount: 20,
                  perfectClearRequired: true
                }
              ]
            }))
          };
          batch.push(setDoc(doc(db, "Worlds", worldId), defaultWorld));

          const defaultRound = {
            id: activeRoundId,
            worldId: worldId,
            roundVersion: 1,
            createdAt: new Date().toISOString(),
            isArchived: false,
            archivedAt: null,
            targetWorldId: worldId,
            targetStageIndex: 5,
            targetDescription: `達到世界 ${w} 第 5 關`,
            leaderboardLimit: 10
          };
          batch.push(setDoc(doc(db, "ChallengeRounds", activeRoundId), defaultRound));
        }
        await Promise.all(batch);

        const reloadedSnap = await getDocs(query(collection(db, "Worlds"), where("isArchived", "==", false)));
        worldsData = [];
        reloadedSnap.forEach((doc) => {
          worldsData.push({ id: doc.id, ...doc.data() });
        });
      }

      // Sort worlds numerically
      worldsData.sort((a, b) => {
        const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0;
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name);
      });

      // 3. Fetch User Stage Progress
      const progressQ = query(collection(db, "UserStageProgress"), where("playerId", "==", currentUser.uid));
      const progressSnap = await getDocs(progressQ);
      const progMap = {};
      progressSnap.forEach((doc) => {
        const data = doc.data();
        const wId = data.worldId;
        const sId = data.stageId;
        const cpId = data.checkpointId || `cp_${sId}`;
        const rId = data.roundId || `world_${wId}_round_1`;
        progMap[`${wId}_${sId}_${cpId}_${rId}`] = data;
      });
      setProgress(progMap);

      // 4. Map worlds progress metadata
      const worldsList = worldsData.map(world => {
        let clearedCount = 0;
        let totalCheckpoints = 0;
        world.stages?.forEach(stage => {
          stage.checkpoints?.forEach(cp => {
            totalCheckpoints++;
            const key = `${world.id}_${stage.id}_${cp.id}_${world.activeRoundId}`;
            if (progMap[key]?.clearedAt) {
              clearedCount++;
            }
          });
        });
        return {
          ...world,
          clearedCount,
          totalStages: totalCheckpoints
        };
      });

      setWorlds(worldsList);
    } catch (e) {
      console.error("Failed to load world challenges data", e);
      setError(e?.message || '無法載入世界資料，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    Promise.resolve().then(() => {
      loadData();
    });
    return () => {
      if (timerId) {
        clearInterval(timerId);
      }
    };
  }, [currentUser, loadData, timerId]);

  const finishChallenge = useCallback(async () => {
    setLoading(true);
    const finalCompletedAt = getCurrentISO();
    const finalCorrect = correctCount;
    const totalQ = questions.length;
    const isPerfect = finalCorrect === totalQ;
    
    const worldId = selectedWorld.id;
    const stageId = activeStage;
    const checkpointId = activeCheckpoint;
    const roundId = selectedWorld.activeRoundId;
    
    // Evaluate perfectClearRequired (Checkpoint -> Stage -> World)
    const stageObj = selectedWorld.stages?.find(st => st.id === stageId);
    const cpObj = stageObj?.checkpoints?.find(cp => cp.id === checkpointId);
    
    let perfectRequired = true;
    if (cpObj && cpObj.perfectClearRequired !== undefined) {
      perfectRequired = cpObj.perfectClearRequired;
    } else if (stageObj && stageObj.perfectClearRequired !== undefined) {
      perfectRequired = stageObj.perfectClearRequired;
    } else if (selectedWorld.perfectClearRequired !== undefined) {
      perfectRequired = selectedWorld.perfectClearRequired;
    } else if (worldSettings[`world_${worldId}`]?.perfectClearRequired !== undefined) {
      perfectRequired = worldSettings[`world_${worldId}`].perfectClearRequired;
    }

    const isCleared = isPerfect || !perfectRequired;

    try {
      const progDocRef = doc(db, "UserStageProgress", `${currentUser.uid}_${worldId}_${stageId}_${checkpointId}_${roundId}`);
      const progDocSnap = await getDoc(progDocRef);
      const prevProg = progDocSnap.exists() ? progDocSnap.data() : null;

      const failedPrev = prevProg?.failedAttempts || 0;
      const retryPrev = prevProg?.retryCount || 0;
      const hasClearedBefore = !!prevProg?.firstClearedAt;
      const wasPerfectPrev = prevProg?.isPerfect || false;

      const attemptNum = failedPrev + retryPrev + 1;

      const wrongQuestions = [];
      answersLog.forEach(ans => {
        if (!ans.correct) {
          const q = questions[ans.qIndex];
          if (q) {
            wrongQuestions.push({
              questionText: q.Question || '',
              correctOption: String(q.Answer || '').trim().toUpperCase(),
              selectedOption: String(ans.selected || '').trim().toUpperCase(),
              optA: q.OptA || null,
              optB: q.OptB || null,
              optC: q.OptC || null,
              optD: q.OptD || null
            });
          }
        }
      });

      const attemptData = {
        playerId: currentUser.uid,
        worldId,
        stageId,
        checkpointId,
        roundId,
        attemptNumber: attemptNum,
        totalQuestions: totalQ,
        correctAnswers: finalCorrect,
        isPerfect,
        isCleared,
        perfectClearRequired: perfectRequired,
        startedAt: quizStartedAt,
        completedAt: finalCompletedAt,
        wrongQuestions
      };

      await addDoc(collection(db, "StageAttempts"), attemptData);
      await addDoc(collection(db, "StageAttempt"), attemptData);

      const studentNickname = currentUser.displayName || currentUser.email?.split('@')[0] || "玩家";
      await setDoc(progDocRef, {
        playerId: currentUser.uid,
        nickname: studentNickname,
        worldId,
        stageId,
        checkpointId,
        roundId,
        isPerfect: isPerfect || wasPerfectPrev,
        perfectClearRequired: perfectRequired,
        clearedAt: isCleared ? finalCompletedAt : (prevProg?.clearedAt || null),
        firstClearedAt: isCleared ? (prevProg?.firstClearedAt || finalCompletedAt) : (prevProg?.firstClearedAt || null),
        failedAttempts: !isCleared && !hasClearedBefore ? failedPrev + 1 : failedPrev,
        retryCount: hasClearedBefore ? retryPrev + 1 : retryPrev
      }, { merge: true });

      // 4. Update PlayerCompetitionProgress
      const profileDocRef = doc(db, "PlayerCompetitionProgress", `${currentUser.uid}_${roundId}`);
      const profileDocSnap = await getDoc(profileDocRef);
      const prevProfile = profileDocSnap.exists() ? profileDocSnap.data() : null;
      const playerProfileRef = doc(db, "PlayerProfiles", currentUser.uid);
      const playerProfileSnap = await getDoc(playerProfileRef);
      const prevPlayerProfile = playerProfileSnap.exists() ? playerProfileSnap.data() : {};

      const numericWorld = numericPart(worldId, 0);
      const checkpointDifficulty = numericWorld * 20 + Number(stageId || 0) * 10 + numericPart(checkpointId, 1) * 5;
      const accuracyBonus = totalQ > 0 ? Math.round((finalCorrect / totalQ) * 50) : 0;
      const perfectBonus = isPerfect ? 50 : 0;
      const clearBonus = isCleared ? 25 : 0;
      const xpGained = isCleared ? Math.max(25, checkpointDifficulty + accuracyBonus + perfectBonus + clearBonus) : 0;
      const previousXp = Number(prevPlayerProfile.experience || 0);
      const newExperience = previousXp + xpGained;
      const levelInfo = levelFromExperience(newExperience);
      const previousLevel = Number(prevPlayerProfile.level || 1);
      const previousEvolutionStage = Number(prevPlayerProfile.currentEvolutionStage || 1);
      const levelBasedEvolutionStage = stageFromLevel(levelInfo.level);

      const newFailedCount = !isCleared ? (prevProfile?.failedAttemptCount || 0) + 1 : (prevProfile?.failedAttemptCount || 0);
      const newRetryCount = hasClearedBefore ? (prevProfile?.retryCount || 0) + 1 : (prevProfile?.retryCount || 0);
      const newPerfectCount = (isPerfect && !wasPerfectPrev) ? (prevProfile?.perfectClearCount || 0) + 1 : (prevProfile?.perfectClearCount || 0);

      const prevFarthestWorld = prevProfile?.farthestWorldOrder || 0;
      const prevFarthestStage = prevProfile?.farthestStageIndex || 0;
      
      let finalFarthestWorld = prevFarthestWorld;
      let finalFarthestStage = prevFarthestStage;
      if (isCleared) {
        const currentScore = numericWorld * 100 + stageId;
        const prevScore = prevFarthestWorld * 100 + prevFarthestStage;
        if (currentScore > prevScore) {
          finalFarthestWorld = numericWorld;
          finalFarthestStage = stageId;
        }
      }

      const roundDocRef = doc(db, "ChallengeRounds", roundId);
      const roundDocSnap = await getDoc(roundDocRef);
      const targetData = roundDocSnap.exists() ? roundDocSnap.data() : null;

      let reachedAt = prevProfile?.targetReachedAt || null;
      let reachedRank = prevProfile?.targetReachedRank || null;

      if (targetData && !reachedAt) {
        const targetWorldNum = numericPart(targetData.targetWorldId, 0);
        const targetStage = parseInt(targetData.targetStageIndex, 10);
        if (finalFarthestWorld * 100 + finalFarthestStage >= targetWorldNum * 100 + targetStage) {
          reachedAt = finalCompletedAt;
          const qProfiles = query(collection(db, "PlayerCompetitionProgress"), where("roundId", "==", roundId));
          const allProfilesSnap = await getDocs(qProfiles);
          let reachedCount = 0;
          allProfilesSnap.forEach(d => {
            if (d.data().targetReachedAt) reachedCount++;
          });
          reachedRank = reachedCount + 1;
        }
      }

      let userCreatedAt = prevProfile?.userCreatedAt || null;
      let anonymizedStudentCode = prevProfile?.anonymizedStudentCode || null;
      let allowPublicDisplayName = prevProfile?.allowPublicDisplayName || false;

      const userDocSnap = await getDoc(doc(db, "Users", currentUser.uid));
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        if (!userCreatedAt) userCreatedAt = userData.createdAt || null;
        anonymizedStudentCode = userData.anonymizedStudentCode || null;
        allowPublicDisplayName = !!userData.allowPublicDisplayName;
      }

      const beastCount = prevPlayerProfile.selectedCharacterId ? 1 : 0;
      const totalClears = isCleared && !hasClearedBefore
        ? Number(prevPlayerProfile.totalClears || 0) + 1
        : Number(prevPlayerProfile.totalClears || 0);
      const effectiveEvolutionStage = Math.max(previousEvolutionStage, levelBasedEvolutionStage);

      await setDoc(playerProfileRef, {
        experience: newExperience,
        level: levelInfo.level,
        xpIntoLevel: levelInfo.xpIntoLevel,
        xpForNextLevel: levelInfo.xpForNextLevel,
        lastXpGained: xpGained,
        lastLevelUpAt: levelInfo.level > previousLevel ? finalCompletedAt : (prevPlayerProfile.lastLevelUpAt || null),
        nextEvolutionLevel: Math.min(25, Math.max(5, previousEvolutionStage * 5)),
        totalClears,
        lastClearedAt: isCleared ? finalCompletedAt : (prevPlayerProfile.lastClearedAt || null),
        beastCount,
        updatedAt: finalCompletedAt
      }, { merge: true });

      if (isCleared && !hasClearedBefore) {
        const firstClearId = `${worldId}_${stageId}_${checkpointId}_${roundId}`;
        const firstClearRef = doc(db, "FirstClearRecords", firstClearId);
        const firstClearSnap = await getDoc(firstClearRef);
        if (!firstClearSnap.exists()) {
          await setDoc(firstClearRef, {
            id: firstClearId,
            playerId: currentUser.uid,
            nickname: studentNickname,
            anonymizedStudentCode,
            worldId,
            worldName: selectedWorld.name || '',
            stageId,
            stageName: stageObj?.name || '',
            checkpointId,
            checkpointName: cpObj?.name || '',
            roundId,
            clearedAt: finalCompletedAt
          });
        }
      }

      await setDoc(profileDocRef, {
        playerId: currentUser.uid,
        roundId: roundId,
        worldId: worldId,
        nickname: studentNickname,
        displayName: currentUser.displayName || null,
        anonymizedStudentCode: anonymizedStudentCode,
        allowPublicDisplayName: allowPublicDisplayName,
        targetReachedAt: reachedAt,
        targetReachedRank: reachedRank,
        farthestWorldOrder: finalFarthestWorld,
        farthestStageIndex: finalFarthestStage,
        farthestCheckpointIndex: finalFarthestStage,
        farthestCheckpointId: checkpointId,
        perfectClearCount: newPerfectCount,
        failedAttemptCount: newFailedCount,
        retryCount: newRetryCount,
        totalClears,
        beastCount,
        evolutionStage: effectiveEvolutionStage,
        level: levelInfo.level,
        experience: newExperience,
        lastXpGained: xpGained,
        lastClearedAt: isCleared ? finalCompletedAt : (prevProfile?.lastClearedAt || null),
        lastUpdatedAt: finalCompletedAt,
        userCreatedAt: userCreatedAt
      }, { merge: true });

      await loadData();

      if (isCleared) {
        try {
          const token = await currentUser.getIdToken();
          const evolRes = await fetch(`${API_BASE_URL}/api/player/check-evolution`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          if (evolRes.ok) {
            const evolData = await evolRes.json();
            if (evolData.evolved) {
              onEvolveTriggered && onEvolveTriggered(evolData);
            }
          }
        } catch (evolErr) {
          console.warn("Auto evolution check failed:", evolErr);
        }
      }

      setView('result');
    } catch(err) {
      console.error(err);
      alert("儲存關卡成績失敗：" + err.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser, correctCount, questions, selectedWorld, activeStage, activeCheckpoint, worldSettings, quizStartedAt, answersLog, loadData, API_BASE_URL, onEvolveTriggered]);

  const handleAnswer = useCallback((selectedOption, qs, idx, activeId) => {
    const idToClear = activeId || timerId;
    if (idToClear) {
      clearInterval(idToClear);
      setTimerId(null);
    }

    const timeTaken = (getCurrentTime() - questionStartTime) / 1000;
    const q = qs[idx];
    const correctOption = String(q.Answer).trim().toUpperCase();
    const cleanSelected = selectedOption ? String(selectedOption).trim().toUpperCase() : null;
    const isCorrect = cleanSelected === correctOption;

    let points = 0;
    let newStreak = streak;

    if (isCorrect) {
      newStreak += 1;
      setCorrectCount(prev => prev + 1);
      const timeRatio = Math.max(0.2, 1 - (timeTaken / 60));
      const base = 100 * timeRatio;
      const streakMultiplier = 1 + (newStreak - 1) * 0.2;
      points = Math.round(base * streakMultiplier);
      setScore(prev => prev + points);
      setStreak(newStreak);
    } else {
      newStreak = 0;
      setStreak(0);
    }

    const newLog = [...answersLog, {
      qIndex: idx,
      selected: selectedOption || '未作答',
      correct: isCorrect,
      score: points,
      timeTaken
    }];
    setAnswersLog(newLog);

    setFeedback({ isCorrect, correctOption, points });
  }, [timerId, questionStartTime, streak, answersLog]);

  const loadQuestion = useCallback((qs, idx) => {
    if (idx >= qs.length) {
      finishChallenge();
      return;
    }
    setTimeLeft(60);
    setQuestionStartTime(getCurrentTime());
    
    if (timerId) {
      clearInterval(timerId);
    }

    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          handleAnswer(null, qs, idx, id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setTimerId(id);
  }, [timerId, handleAnswer, finishChallenge]);

  const startChallenge = async (stageNum, checkpointId) => {
    setLoading(true);
    try {
      const stageObj = selectedWorld.stages?.find(st => st.id === stageNum);
      const cpObj = stageObj?.checkpoints?.find(cp => cp.id === checkpointId);
      const qCount = cpObj?.questionCount || 20;

      let bankQs = [];
      const numericWorldId = parseInt(String(selectedWorld.id).replace(/\D/g, ''), 10) || selectedWorld.id;
      const stringNumericWorldId = String(numericWorldId);
      const worldMatchVals = [selectedWorld.id, numericWorldId, stringNumericWorldId];

      const q1 = query(
        collection(db, "QuizBanks"),
        where("world", "in", worldMatchVals),
        where("stage", "==", stageNum)
      );
      const snap1 = await getDocs(q1);

      if (!snap1.empty) {
        const bankDoc = snap1.docs[0];
        bankQs = bankDoc.data().questions || [];
      } else {
        const q2 = query(
          collection(db, "QuizBanks"),
          where("world", "in", worldMatchVals),
          where("stage", "==", "All")
        );
        const snap2 = await getDocs(q2);
        if (!snap2.empty) {
          const bankDoc = snap2.docs[0];
          const allQs = bankDoc.data().questions || [];
          const start = (stageNum - 1) * 20;
          const end = stageNum * 20;
          bankQs = allQs.slice(start, end);
        }
      }

      if (bankQs.length === 0) {
        alert("此世界關卡尚未設置題庫，請聯絡管理員或教師上傳！");
        setLoading(false);
        return;
      }

      let activeQs = bankQs;
      if (activeQs.length > qCount) {
        activeQs = activeQs.slice(0, qCount);
      }

      const shuffled = [...activeQs].sort(() => 0.5 - Math.random());
      setQuestions(shuffled);
      setActiveStage(stageNum);
      setActiveCheckpoint(checkpointId);
      setCurrentQIndex(0);
      setScore(0);
      setStreak(0);
      setCorrectCount(0);
      setAnswersLog([]);
      setFeedback(null);
      setQuizStartedAt(getCurrentISO());
      setView('playing');
      loadQuestion(shuffled, 0);
    } catch(err) {
      console.error(err);
      alert("載入關卡挑戰失敗！");
    } finally {
      setLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    setLoadingLeaderboard(true);
    try {
      const activeRoundId = selectedWorld?.activeRoundId || 'legacy';
      
      let targetData = null;
      if (activeRoundId !== 'legacy') {
        const roundDocRef = doc(db, "ChallengeRounds", activeRoundId);
        const roundDocSnap = await getDoc(roundDocRef);
        if (roundDocSnap.exists()) {
          targetData = roundDocSnap.data();
        }
      }
      
      if (!targetData) {
        const roundDocRefLegacy = doc(db, "CompetitionRound", "current");
        const roundDocSnapLegacy = await getDoc(roundDocRefLegacy);
        targetData = roundDocSnapLegacy.exists() ? roundDocSnapLegacy.data() : null;
      }
      setCompetitionTarget(targetData);

      let playersList = [];
      if (activeRoundId !== 'legacy') {
        const q = query(collection(db, "PlayerCompetitionProgress"), where("roundId", "==", activeRoundId));
        const snap = await getDocs(q);
        snap.forEach((doc) => {
          playersList.push({ id: doc.id, ...doc.data() });
        });
      }
      
      if (playersList.length === 0) {
        const snapLegacy = await getDocs(collection(db, "PlayerCompetitionProgress"));
        snapLegacy.forEach((doc) => {
          const data = doc.data();
          if (!data.roundId || data.roundId === 'legacy' || data.roundId === activeRoundId) {
            playersList.push({ id: doc.id, ...data });
          }
        });
      }

      const sorted = playersList.sort((a, b) => {
        const beastDiff = Number(b.beastCount || 0) - Number(a.beastCount || 0);
        if (beastDiff !== 0) return beastDiff;

        const evolutionDiff = Number(b.evolutionStage || b.currentEvolutionStage || 0) - Number(a.evolutionStage || a.currentEvolutionStage || 0);
        if (evolutionDiff !== 0) return evolutionDiff;

        const clearDiff = Number(b.totalClears || 0) - Number(a.totalClears || 0);
        if (clearDiff !== 0) return clearDiff;

        const worldDiff = Number(b.farthestWorldOrder || 0) - Number(a.farthestWorldOrder || 0);
        if (worldDiff !== 0) return worldDiff;

        const stageDiff = Number(b.farthestStageIndex || 0) - Number(a.farthestStageIndex || 0);
        if (stageDiff !== 0) return stageDiff;

        const cpDiff = Number(b.farthestCheckpointIndex || 0) - Number(a.farthestCheckpointIndex || 0);
        if (cpDiff !== 0) return cpDiff;

        const updateA = new Date(a.lastUpdatedAt || 0).getTime();
        const updateB = new Date(b.lastUpdatedAt || 0).getTime();
        return updateB - updateA;
      });

      const firstClearSnap = await getDocs(query(collection(db, "FirstClearRecords"), where("roundId", "==", activeRoundId)));
      const firstClearList = [];
      firstClearSnap.forEach((doc) => {
        firstClearList.push({ id: doc.id, ...doc.data() });
      });
      firstClearList.sort((a, b) => new Date(a.clearedAt || 0).getTime() - new Date(b.clearedAt || 0).getTime());

      setLeaderboard(sorted);
      setFirstClearHistory(firstClearList);
    } catch(err) {
      console.error("Failed to fetch leaderboard", err);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const selectWorld = (world) => {
    setSelectedWorld(world);
    setView('stage_select');
  };

  const nextQuestion = () => {
    setFeedback(null);
    const nextIdx = currentQIndex + 1;
    setCurrentQIndex(nextIdx);
    loadQuestion(questions, nextIdx);
  };

  const retryStage = () => {
    startChallenge(activeStage, activeCheckpoint);
  };

  const playNextStage = () => {
    const checkpointsList = [];
    selectedWorld.stages?.forEach(stage => {
      stage.checkpoints?.forEach(cp => {
        checkpointsList.push({
          stageId: stage.id,
          id: cp.id
        });
      });
    });

    const currentIdx = checkpointsList.findIndex(cp => cp.stageId === activeStage && cp.id === activeCheckpoint);
    if (currentIdx !== -1 && currentIdx + 1 < checkpointsList.length) {
      const nextCp = checkpointsList[currentIdx + 1];
      startChallenge(nextCp.stageId, nextCp.id);
    } else {
      setView('stage_select');
    }
  };

  const renderWorldSelect = () => {
    if (!worlds || worlds.length === 0) {
      return (
        <div className="world-empty-state">
          <MapIcon size={40} />
          <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>目前還沒有開放任何挑戰世界</p>
          <p>請聯絡老師於開發者模式開啟世界，或稍後再回來探索這片永續地圖。</p>
        </div>
      );
    }

    // 世界解鎖規則：第一個世界預設開放；其後世界僅在「老師於開發者模式開放」後才解鎖。
    return (
      <div className="animate-fade-in" style={{ width: '100%' }}>
        <p className="world-map-intro">沿著永續之路前進，破關解鎖下一座島嶼。滿分或達標才能繼續前進！</p>

        <div className="world-map">
          {worlds.map((w, idx) => {
            const order = parseInt(String(w.id).replace(/\D/g, ''), 10) || (idx + 1);
            const total = w.totalStages || 0;
            const cleared = w.clearedCount || 0;
            const pct = total > 0 ? Math.round((cleared / total) * 100) : 0;
            const fullyCleared = total > 0 && cleared >= total;
            const teacherOpened = !!worldSettings[`world_${order}`] || w.isOpen === true;
            const unlocked = idx === 0 || teacherOpened;
            const status = !unlocked ? 'locked' : fullyCleared ? 'cleared' : 'open';

            const displayName = w.name && !/世界\s*world_/i.test(w.name) ? w.name : `世界 ${order}`;

            return (
              <div key={w.id} className="world-node-container">
                <div
                  className={`world-node ${status}`}
                  onClick={() => unlocked && selectWorld(w)}
                  role="button"
                  aria-disabled={!unlocked}
                  title={unlocked ? displayName : '尚未開放'}
                >
                  {status === 'cleared' ? <CheckCircle2 size={30} /> : status === 'locked' ? <Lock size={22} /> : order}
                </div>
                <div className="world-node-info">
                  <h4>{displayName}</h4>
                  <p className="world-node-sub">SDGs 第 {order} 指標單元</p>
                  {unlocked ? (
                    <>
                      <div className="world-stats" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>進度 {cleared}/{total} 關</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="progress-bar-container">
                        <div className="progress-bar-fill" style={{ width: `${pct}%` }}></div>
                      </div>
                      <span className={`world-status-pill ${status}`}>
                        {status === 'cleared' ? '✓ 全數通關' : '⚡ 開放挑戰中'}
                      </span>
                    </>
                  ) : (
                    <span className="world-status-pill locked">🔒 尚未開放（由老師於開發者模式開啟）</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderStageSelect = () => {
    const checkpointsList = [];
    selectedWorld.stages?.forEach(stage => {
      stage.checkpoints?.forEach(cp => {
        checkpointsList.push({
          stageId: stage.id,
          stageName: stage.name,
          ...cp
        });
      });
    });

    return (
      <div className="animate-fade-in" style={{ width: '100%' }}>

         {checkpointsList.length === 0 ? (
           <p style={{ textAlign: 'center', color: '#888', margin: '2rem 0' }}>此世界目前尚無任何關卡。請聯絡教師或管理員建立關卡與上傳題庫！</p>
         ) : (
           <div className="stage-path">
              {checkpointsList.map((cp, idx) => {
                const key = `${selectedWorld.id}_${cp.stageId}_${cp.id}_${selectedWorld.activeRoundId}`;
                const stageProg = progress[key];
                const isCleared = !!stageProg?.clearedAt;
                
                let isUnlocked = idx === 0;
                if (idx > 0) {
                  const prevCp = checkpointsList[idx - 1];
                  const prevKey = `${selectedWorld.id}_${prevCp.stageId}_${prevCp.id}_${selectedWorld.activeRoundId}`;
                  isUnlocked = !!progress[prevKey]?.clearedAt;
                }

                let statusClass = 'locked';
                if (isCleared) statusClass = 'cleared';
                else if (isUnlocked) statusClass = 'unlocked';

                return (
                  <div key={`${cp.stageId}_${cp.id}`} className="stage-node-container">
                     <div 
                       className={`stage-node ${statusClass}`}
                       onClick={() => isUnlocked && startChallenge(cp.stageId, cp.id)}
                     >
                       {isCleared ? <CheckCircle2 size={32} /> : isUnlocked ? (idx + 1) : <Lock size={20} />}
                     </div>
                     <div className="stage-info">
                        <h4>{cp.stageName} - {cp.name}</h4>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#666' }}>題目數: {cp.questionCount} 題</p>
                        <p style={{ margin: 0 }}>
                          {isCleared ? (
                            <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>
                              ✓ 已通關 (重試: {stageProg.retryCount || 0} 次 | 失敗: {stageProg.failedAttempts || 0} 次)
                            </span>
                          ) : isUnlocked ? (
                            <span style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>
                              ⚡ 開放挑戰中
                            </span>
                          ) : (
                            <span style={{ color: '#999' }}>🔒 尚未解鎖 (需通關前一關)</span>
                          )}
                        </p>
                     </div>
                  </div>
                );
              })}
           </div>
         )}
      </div>
    );
  };

  const renderPlaying = () => {
    const currentQuestion = questions[currentQIndex];
    if (!currentQuestion) return null;

    const isTrueFalse = !currentQuestion.OptC && !currentQuestion.OptD;
    const availableOptions = isTrueFalse ? ['A', 'B'] : ['A', 'B', 'C', 'D'];

    return (
      <div className="student-playing animate-fade-in" style={{ width: '100%' }}>
        <div className="student-topbar" style={{ background: 'var(--primary-dark)', color: 'white', display: 'flex', justifyContent: 'space-between', padding: '1rem', borderRadius: '12px 12px 0 0' }}>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
             <div className="streak" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Flame size={20} color="#FFD54F" /> 連對: {streak}</div>
             <div className="score" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Trophy size={20} color="#FFD54F" /> 分數: {score}</div>
          </div>
          <div style={{ fontWeight: 'bold' }}>第 {currentQIndex + 1} / {questions.length} 題 | 剩餘時間: {timeLeft}s</div>
        </div>

        {feedback ? (
          <div className="student-feedback flex-center animate-pop-in" style={{ backgroundColor: feedback.isCorrect ? '#4CAF50' : '#E53935', minHeight: '350px', padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRadius: '0 0 12px 12px' }}>
            <div className="feedback-content" style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--text-main)', padding: '2rem', borderRadius: '24px', textAlign: 'center', width: '100%', maxWidth: '450px' }}>
              <h1 style={{ color: feedback.isCorrect ? '#2E7D32' : '#C62828', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '2rem' }}>
                {feedback.isCorrect ? <CheckCircle2 size={36} /> : <XCircle size={36} />} 
                {feedback.isCorrect ? '答對了！' : '答錯囉...'}
              </h1>
              <div className="points-display" style={{ background: feedback.isCorrect ? '#E8F5E9' : '#FFEBEE', color: feedback.isCorrect ? '#2E7D32' : '#C62828', padding: '0.5rem 2rem', margin: '1rem 0', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                 {feedback.isCorrect ? `+${feedback.points}` : '0'} 分
              </div>
              {!feedback.isCorrect && (
                 <h4 className="mt-2" style={{ color: '#C62828' }}>正確答案是： {feedback.correctOption}</h4>
              )}
              <ParticleButton className="btn mt-4 primary-btn btn-block" onClick={nextQuestion}>
                 {currentQIndex + 1 === questions.length ? '查看挑戰成績' : '下一題'}
              </ParticleButton>
            </div>
          </div>
        ) : (
          <div style={{ background: 'white', padding: '2rem', borderRadius: '0 0 12px 12px', border: '1px solid #ddd', borderTop: 'none' }}>
            <h2 className="mobile-question" style={{ color: 'var(--primary-dark)', fontSize: '1.8rem', textAlign: 'center', margin: '2rem 0', fontWeight: 'bold' }}>{currentQuestion.Question}</h2>
            <div className="student-options-grid" style={{
               display: 'grid',
               gridTemplateColumns: isTrueFalse ? '1fr' : '1fr 1fr',
               gap: '1rem',
            }}>
               {availableOptions.map((opt) => (
                 <ParticleButton 
                   key={opt} 
                   className={`student-btn-opt opt-${opt.toLowerCase()}`}
                   onClick={() => handleAnswer(opt, questions, currentQIndex)}
                   style={{ borderRadius: '16px', padding: '1.2rem' }}
                 >
                   <span className="opt-label" style={{ background: 'rgba(255,255,255,0.4)', color: 'var(--text-main)' }}>{opt}</span>
                   <span className="opt-text" style={{ fontSize: '1.1rem' }}>{currentQuestion[`Opt${opt}`]}</span>
                 </ParticleButton>
               ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderResult = () => {
    const totalQ = questions.length;
    const finalCorrect = correctCount;
    const isPerfect = finalCorrect === totalQ;
    const worldId = selectedWorld.id;
    const perfectRequired = worldSettings[`world_${worldId}`]?.perfectClearRequired !== false;
    const isCleared = isPerfect || !perfectRequired;

    return (
      <div className="animate-fade-in" style={{ width: '100%' }}>
         <div className={`clear-screen ${isCleared ? 'perfect' : 'failed'}`}>
            <h1 style={{ color: isCleared ? '#2e7d32' : '#c62828' }}>
               {isPerfect ? 'Perfect Clear ✨' : isCleared ? 'Stage Cleared! 🎉' : 'Challenge Failed 🌟'}
            </h1>
            
            <p style={{ fontSize: '1.2rem', color: '#555', marginTop: '1rem' }}>
               {isPerfect 
                 ? '卓越的表現！你完美答對了所有題目，真正掌握了此單元的核心永續知識！'
                 : isCleared
                   ? `恭喜通關！你答對了 ${finalCorrect}/${totalQ} 題，成功解鎖下一關！`
                   : `本次挑戰尚未達到滿分，但這只是一次練習！你答對了 ${finalCorrect}/${totalQ} 題。每次的嘗試都是學習的養分，再試一次你一定可以獲得 Perfect Clear！💪`
               }
            </p>
            
            <div className="feedback-details">
               <p><strong>關卡：</strong> {selectedWorld.name} - 第 {activeStage} 階段 ({activeCheckpoint})</p>
               <p><strong>得分：</strong> {score} 分</p>
               <p><strong>正確率：</strong> {finalCorrect} / {totalQ} 題 ({Math.round((finalCorrect/totalQ)*100)}%)</p>
            </div>

            <div style={{ textAlign: 'left', margin: '2rem 0', maxHeight: '250px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '1rem' }}>
              <h4 style={{ marginBottom: '1rem', color: 'var(--primary-dark)' }}>作答詳情回顧：</h4>
              {answersLog.map((ans, i) => (
                <div key={i} style={{ borderBottom: '1px solid #f5f5f5', padding: '0.5rem 0', display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                   <span>第 {ans.qIndex + 1} 題：你選了 {ans.selected}</span>
                   <span style={{ color: ans.correct ? '#2e7d32' : '#e53935', fontWeight: 'bold' }}>
                      {ans.correct ? '✓ 答對' : `✗ 答錯 (正確: ${questions[ans.qIndex].Answer})`}
                   </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
               <ParticleButton className="btn" style={{ background: '#f5f5f5', color: '#555', border: '1px solid #ccc', borderRadius: '24px' }} onClick={() => setView('stage_select')}>
                  返回關卡地圖
               </ParticleButton>
               
               <ParticleButton className="btn primary-btn" style={{ borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={retryStage}>
                  <RefreshCw size={16} /> 重新挑戰
               </ParticleButton>

               {isCleared && (
                  <ParticleButton className="btn" style={{ background: '#2E7D32', color: 'white', borderRadius: '24px' }} onClick={playNextStage}>
                     下一關
                  </ParticleButton>
               )}
            </div>
         </div>
      </div>
    );
  };

  const renderLeaderboard = () => {
    const myIndex = leaderboard.findIndex(item => item.playerId === currentUser.uid);
    const myRank = myIndex !== -1 ? myIndex + 1 : null;
    const totalPlayers = leaderboard.length;
    const myPercentage = (myRank && totalPlayers) ? Math.round((myRank / totalPlayers) * 100) : null;
    
    // Support showing top 5 or top 10 dynamically based on settings
    const displayLimit = competitionTarget?.leaderboardLimit || 10;
    const topPlayers = leaderboard.slice(0, displayLimit);

    return (
      <div className="animate-fade-in" style={{ width: '100%' }}>

         <div className="card glass-panel" style={{ padding: '2rem', borderRadius: '16px', background: 'white' }}>
            {competitionTarget ? (
               <div style={{ marginBottom: '1.5rem', padding: '1.2rem', background: '#e8f5e9', borderRadius: '12px', border: '1px solid #c8e6c9' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: '800', color: '#2e7d32', fontSize: '1.15rem' }}>
                     🎯 本輪挑戰目標：{competitionTarget.targetDescription || "達到指定世界與關卡"}
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.95rem', color: '#555' }}>
                     <strong>目標進度：</strong>世界 {competitionTarget.targetWorldId} - 第 {competitionTarget.targetStageIndex} 關
                     {competitionTarget.targetDeadline && ` | 截止日期：${new Date(competitionTarget.targetDeadline).toLocaleString()}`}
                  </p>
               </div>
            ) : (
               <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                  排行榜核心規則：優先依照<strong>神獸數、神獸進化狀態、通關數</strong>排序；首位通關者會公開留在歷史紀錄，其餘玩家的通關日期僅本人可見。
               </p>
            )}

            {loadingLeaderboard ? (
               <div style={{ textAlign: 'center', padding: '2rem', fontSize: '1.2rem', color: '#888' }}>
                  載入排行榜數據中...
               </div>
            ) : leaderboard.length === 0 ? (
               <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                  目前尚無闖關通關紀錄。快去挑戰成為第一位上榜者吧！
               </div>
            ) : (
               <>
                  {firstClearHistory.length > 0 && (
                     <div style={{ marginBottom: '1.25rem', padding: '1rem', background: '#f8fff8', border: '1px solid rgba(76, 175, 80, 0.18)', borderRadius: '12px' }}>
                        <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--primary-dark)', fontWeight: 800 }}>首位通關歷史紀錄</h4>
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                           {firstClearHistory.slice(0, 8).map((record) => (
                              <div key={record.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', fontSize: '0.92rem', color: '#35563e' }}>
                                 <span>
                                    {record.worldName || record.worldId} / {record.stageName || record.stageId} / {record.checkpointName || record.checkpointId}
                                 </span>
                                 <strong>
                                    {record.anonymizedStudentCode || '首通玩家'} · {record.clearedAt ? new Date(record.clearedAt).toLocaleString() : '-'}
                                 </strong>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}

                  <div style={{ overflowX: 'auto' }}>
                     <table className="progression-leaderboard" style={{ minWidth: '760px' }}>
                        <thead>
                           <tr>
                              <th>名次</th>
                              <th>玩家</th>
                              <th>神獸 / 進化</th>
                              <th>通關數</th>
                              <th>目前進度</th>
                              <th>通關時間隱私</th>
                           </tr>
                        </thead>
                        <tbody>
                           {topPlayers.map((item, idx) => {
                              const rankLabel = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                              const isTopThree = idx < 3;
                              let rankClass = 'progression-rank';
                              if (idx === 0) rankClass += ' first';
                              else if (idx === 1) rankClass += ' second';
                              else if (idx === 2) rankClass += ' third';

                              const userCode = item.anonymizedStudentCode || `usr-${item.playerId ? item.playerId.slice(0, 8) : 'unknown'}`;
                              const displayNameVal = (item.playerId === currentUser.uid || item.allowPublicDisplayName)
                                ? (item.nickname || item.displayName || "神秘玩家")
                                : "去識別化學員";
                              const isMine = item.playerId === currentUser.uid;
                              const privateClearTime = isMine && item.lastClearedAt
                                ? new Date(item.lastClearedAt).toLocaleString()
                                : '僅本人可見';

                              return (
                                 <tr key={item.playerId} style={{ background: item.playerId === currentUser.uid ? 'rgba(76, 175, 80, 0.08)' : 'transparent' }}>
                                    <td className={rankClass} style={{ fontSize: isTopThree ? '1.8rem' : '1.1rem' }}>
                                       {rankLabel}
                                    </td>
                                    <td>
                                       <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                          <span style={{ fontSize: '0.85rem', color: '#888', fontFamily: 'monospace' }}>{userCode}</span>
                                          <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                             <User size={14} color="#777" />
                                             {displayNameVal} 
                                             {item.playerId === currentUser.uid && <span style={{ fontSize: '0.7rem', background: '#4caf50', color: 'white', padding: '0.05rem 0.3rem', borderRadius: '4px', marginLeft: '0.2rem' }}>你</span>}
                                          </span>
                                       </div>
                                    </td>
                                    <td style={{ color: 'var(--primary-dark)', fontWeight: 'bold' }}>
                                       {item.beastCount || 0} 隻 / 第 {item.evolutionStage || item.currentEvolutionStage || 0} 階
                                       <div style={{ fontSize: '0.78rem', color: '#68836f', fontWeight: 600 }}>
                                          Lv.{item.level || 1}
                                       </div>
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 800, color: '#2e7d32' }}>
                                       {item.totalClears || 0}
                                    </td>
                                    <td style={{ color: 'var(--primary-dark)', fontWeight: 'bold' }}>
                                       世界 {item.farthestWorldOrder || 0} - 第 {item.farthestStageIndex || 0} 關
                                    </td>
                                    <td style={{ fontSize: '0.9rem', color: '#555' }}>
                                       {privateClearTime}
                                    </td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  </div>

                  {myRank && myRank > displayLimit && (
                     <div style={{ marginTop: '1.5rem', padding: '1.2rem', background: 'rgba(76, 175, 80, 0.08)', borderRadius: '12px', border: '1px solid rgba(76, 175, 80, 0.2)', textAlign: 'center' }}>
                        <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--primary-dark)', fontSize: '1.05rem' }}>
                           ✨ 您的目前排名：第 {myRank} 名 (超越了 {Math.max(0, 100 - myPercentage)}% 的挑戰者) | 目前進度：世界 {leaderboard[myIndex].farthestWorldOrder || 0} - 第 {leaderboard[myIndex].farthestStageIndex || 0} 關
                        </p>
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: '#666' }}>
                           穩定學習是前進的最大動力，繼續挑戰，你正在往更高的目標邁進！💪
                        </p>
                     </div>
                  )}

                  {myRank === null && (
                     <div style={{ marginTop: '1.5rem', padding: '1.2rem', background: 'rgba(0, 0, 0, 0.02)', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.05)', textAlign: 'center' }}>
                        <p style={{ margin: 0, fontWeight: 'bold', color: '#666', fontSize: '1rem' }}>
                           🛡️ 您目前尚未有通關紀錄。快去挑戰關卡，開啟你的永續學習挑戰吧！🚀
                        </p>
                     </div>
                  )}
               </>
            )}
         </div>
      </div>
    );
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.5rem', color: 'var(--primary-dark)' }}>載入闖關世界中...🗺️</div>;
  }

  if (error) {
    return (
      <div className="world-error-state">
        <MapIcon size={40} />
        <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>😵 載入世界資料時發生問題</p>
        <p className="world-error-detail">{error}</p>
        <button onClick={() => loadData()}>重新載入</button>
      </div>
    );
  }

  let headerTitle = "";
  let backAction = null;
  let backText = "";
  let rightElement = null;

  if (view === 'world_select') {
    headerTitle = "🗺️ 題庫闖關挑戰世界";
    backAction = onGoBack;
    backText = "返回 Dashboard";
    rightElement = (
      <ParticleButton 
        className="btn" 
        style={{ background: 'var(--secondary-color)', color: 'white', borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', fontSize: '0.95rem' }}
        onClick={() => { setView('leaderboard'); loadLeaderboard(); }}
      >
         <Trophy size={16} /> 闖關排行榜
      </ParticleButton>
    );
  } else if (view === 'stage_select') {
    headerTitle = `📍 ${selectedWorld?.name || '關卡地圖'}`;
    backAction = () => setView('world_select');
    backText = "返回選擇世界";
  } else if (view === 'playing') {
    headerTitle = `⚡ 關卡挑戰中 (第 ${currentQIndex + 1} / ${questions?.length || 0} 題)`;
    const exitPlaying = () => {
      if (window.confirm("確定要放棄本次挑戰並返回關卡地圖嗎？您的進度不會被保存。")) {
        if (timerId) {
          clearInterval(timerId);
        }
        setView('stage_select');
      }
    };
    backAction = exitPlaying;
    backText = "放棄挑戰";
  } else if (view === 'result') {
    headerTitle = "🏁 挑戰結果";
    backAction = () => setView('stage_select');
    backText = "返回關卡地圖";
  } else if (view === 'leaderboard') {
    headerTitle = "🏆 闖關挑戰英雄榜";
    backAction = () => setView('world_select');
    backText = "返回選擇世界";
  }

  return (
    <div className="home-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-color)', padding: '2rem' }}>
      <div className="app-tool-window large animate-fade-in">
        <div className="app-tool-window-header">
          <div className="app-tool-window-header-title">
             {backAction && (
                <button onClick={backAction} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: '#111111', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}>
                   <ArrowLeft size={20} /> {backText}
                </button>
             )}
             <span style={{ color: 'rgba(17,17,17,0.35)' }}>|</span>
             <span>{headerTitle}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
             {rightElement}
             <div className="app-tool-window-controls">
                <span className="app-tool-window-control-dot minimize" />
                <span className="app-tool-window-control-dot maximize" />
                <span className="app-tool-window-control-dot close" onClick={onGoBack} title="關閉視窗" />
             </div>
          </div>
        </div>
        <div className="app-tool-window-body">
           {view === 'world_select' && renderWorldSelect()}
           {view === 'stage_select' && renderStageSelect()}
           {view === 'playing' && renderPlaying()}
           {view === 'result' && renderResult()}
           {view === 'leaderboard' && renderLeaderboard()}
        </div>
      </div>
    </div>
  );
}
