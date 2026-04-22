const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

// --- Question Bank Persistence Logic ---
const banksFilePath = path.join(__dirname, 'banks.json');
if (!fs.existsSync(banksFilePath)) {
  fs.writeFileSync(banksFilePath, JSON.stringify([]));
}

function getBanks() {
  try {
    return JSON.parse(fs.readFileSync(banksFilePath, 'utf8'));
  } catch(e) {
    return [];
  }
}

function saveBank(name, questions) {
  const banks = getBanks();
  const newBank = {
    id: Date.now().toString(),
    name: name,
    date: new Date().toISOString(),
    questions: questions
  };
  banks.push(newBank);
  fs.writeFileSync(banksFilePath, JSON.stringify(banks));
  return newBank;
}

app.get('/api/banks', (req, res) => {
  const banks = getBanks();
  // only send metadata, not full array
  res.json(banks.map(b => ({ id: b.id, name: b.name, date: b.date, count: b.questions.length })));
});

app.get('/api/banks/:id', (req, res) => {
  const banks = getBanks();
  const bank = banks.find(b => b.id === req.params.id);
  if (bank) {
    res.json(bank);
  } else {
    res.status(404).json({ error: 'Bank not found' });
  }
});

// --- Upload Logic ---
const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // 使用 header: 1 取得 2D 陣列
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    let parsedQuestions = [];
    
    // 1. 尋找標題列 (掃描前 20 列)
    let headerRowIdx = -1;
    let colMap = { q: -1, ans: -1, a: -1, b: -1, c: -1, d: -1, chapter: -1, section: -1 };
    
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row)) continue;
      
      let foundQ = -1, foundAns = -1, foundA = -1, foundB = -1, foundC = -1, foundD = -1, foundChapter = -1, foundSection = -1;
      
      for (let c = 0; c < row.length; c++) {
        // 移除所有空格和星號等特殊符號來增加容錯
        const cell = String(row[c]).toLowerCase().replace(/[\*\s]/g, '').trim();
        if (cell.includes('題幹') || cell.includes('題目') || cell.includes('question')) foundQ = c;
        else if (cell === '答案' || cell === '解答' || cell.includes('answer')) foundAns = c;
        else if (cell.includes('選項-a') || cell.includes('選項a') || cell === 'a' || cell === 'opta') foundA = c;
        else if (cell.includes('選項-b') || cell.includes('選項b') || cell === 'b' || cell === 'optb') foundB = c;
        else if (cell.includes('選項-c') || cell.includes('選項c') || cell === 'c' || cell === 'optc') foundC = c;
        else if (cell.includes('選項-d') || cell.includes('選項d') || cell === 'd' || cell === 'optd') foundD = c;
        else if (cell.includes('章節') || cell.includes('chapter')) foundChapter = c;
        else if (cell.includes('小節') || cell.includes('section')) foundSection = c;
      }
      
      // 如果找到題目和答案，就可以認定它是標題列了
      if (foundQ !== -1 && foundAns !== -1 && foundA !== -1) {
        headerRowIdx = i;
        colMap = { q: foundQ, ans: foundAns, a: foundA, b: foundB, c: foundC, d: foundD, chapter: foundChapter, section: foundSection };
        break;
      }
    }

    if (headerRowIdx === -1) {
      return res.status(400).send('無法辨識題庫格式。請確保包含「題幹/題目」、「答案」、「選項-A」、「選項-B」等標題列！');
    }

    // 2. 從標題列的下一行開始擷取資料
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      
      const getCellStr = (val) => (val != null ? String(val).trim() : '');
      const qText = getCellStr(row[colMap.q]);
      
      // 如果沒有題目內文，跳過
      if (!qText) continue;
      
      const rawAns = getCellStr(row[colMap.ans]).toUpperCase();
      const cleanAns = rawAns.replace(/[^A-D]/g, ''); 
      
      const optA = getCellStr(row[colMap.a]);
      const optB = getCellStr(row[colMap.b]);
      const optC = getCellStr(row[colMap.c]);
      const optD = getCellStr(row[colMap.d]);
      
      const chapter = colMap.chapter !== -1 ? getCellStr(row[colMap.chapter]) || '未分類' : '未分類';
      const section = colMap.section !== -1 ? getCellStr(row[colMap.section]) || '未分類' : '未分類';
      
      // 判定是否為是非題 (C, D為空)
      const isTrueFalse = (!optC && !optD);

      parsedQuestions.push({
        Question: qText,
        OptA: optA,
        OptB: optB,
        OptC: optC,
        OptD: optD,
        Answer: cleanAns ? cleanAns[0] : rawAns,
        Chapter: chapter,
        Section: section,
        Type: isTrueFalse ? 'true_false' : 'multiple_choice'
      });
    }

    if (parsedQuestions.length === 0) return res.status(400).send('在此檔案中找不到任何題目內容，請檢查格式是否大於一行。');

    res.json({ questions: parsedQuestions });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error parsing excel file: ' + err.message);
  }
});

// --- Socket.IO Room & Game Logic ---
const rooms = {};

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(10000000 + Math.random() * 90000000).toString();
  } while (rooms[code]);
  return code;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_room', ({ questions, limit }) => {
    const shuffled = questions.sort(() => 0.5 - Math.random());
    let selected = shuffled.slice(0, limit || 10);
    
    if (selected.length === 0) {
      socket.emit('error', 'No questions to play.');
      return;
    }

    selected = selected.map(q => ({
      ...q,
      Answer: String(q.Answer || '').trim().toUpperCase()
    }));

    const roomId = generateRoomCode();
    rooms[roomId] = {
      id: roomId,
      teacherId: socket.id,
      status: 'waiting', 
      questions: selected,
      currentQuestionIndex: -1,
      players: {}, 
      answeredCount: 0,
      timeLimit: 60,
      timer: null,
      questionStartTime: 0
    };
    
    socket.join(roomId);
    socket.emit('room_created', roomId);
  });

  socket.on('join_room_student', ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', 'Room not found.');
    if (room.status !== 'waiting') return socket.emit('error', 'Game already started.');

    room.players[socket.id] = {
      id: socket.id,
      nickname,
      score: 0,
      streak: 0,
      answers: []
    };
    
    socket.join(roomId);
    socket.emit('joined_room', { roomId, nickname });
    io.to(room.teacherId).emit('player_joined', Object.values(room.players));
  });

  socket.on('start_game', (roomId) => {
    const room = rooms[roomId];
    if (room && room.teacherId === socket.id) {
      room.status = 'playing';
      nextQuestion(room);
    }
  });

  socket.on('next_question', (roomId) => {
    const room = rooms[roomId];
    if (room && room.teacherId === socket.id) {
      nextQuestion(room);
    }
  });

  socket.on('submit_answer', ({ roomId, selectedOption }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;
    const player = room.players[socket.id];
    if (!player) return;

    const qIndex = room.currentQuestionIndex;
    if (player.answers.some(a => a.qIndex === qIndex)) return;

    const question = room.questions[qIndex];
    const correctOption = String(question.Answer).trim().toUpperCase();
    const cleanSelectedOption = String(selectedOption).trim().toUpperCase();
    const isCorrect = (cleanSelectedOption === correctOption);
    
    const timeTaken = (Date.now() - room.questionStartTime) / 1000;
    let points = 0;
    
    if (isCorrect) {
      player.streak += 1;
      points = 100;
      player.score += points;
    } else {
      player.streak = 0;
    }

    player.answers.push({
      qIndex,
      selected: selectedOption,
      correct: isCorrect,
      score: points,
      timeTaken
    });
    room.answeredCount += 1;

    socket.emit('answer_feedback', {
      isCorrect,
      correctOption,
      points,
      currentScore: player.score,
      streak: player.streak
    });

    io.to(room.teacherId).emit('player_answered_count', room.answeredCount);

    const totalPlayers = Object.keys(room.players).length;
    if (room.answeredCount >= totalPlayers) {
      endQuestion(room);
    }
  });

  function nextQuestion(room) {
    if (room.timerInterval) clearInterval(room.timerInterval);
    
    room.currentQuestionIndex += 1;
    if (room.currentQuestionIndex >= room.questions.length) {
      room.status = 'game_over';
      io.to(room.id).emit('game_over', {
        players: Object.values(room.players).map(p => ({
          nickname: p.nickname,
          score: p.score,
          answers: p.answers
        }))
      });
      return;
    }

    room.status = 'playing';
    room.answeredCount = 0;
    room.questionStartTime = Date.now();
    
    const question = room.questions[room.currentQuestionIndex];
    io.to(room.teacherId).emit('new_question', {
      qIndex: room.currentQuestionIndex,
      total: room.questions.length,
      question: question.Question,
      options: { A: question.OptA, B: question.OptB, C: question.OptC, D: question.OptD },
      timeLimit: room.timeLimit
    });

    io.to(room.id).emit('new_question_student', {
      qIndex: room.currentQuestionIndex,
      total: room.questions.length,
      question: question.Question,
      options: { A: question.OptA, B: question.OptB, C: question.OptC, D: question.OptD },
      timeLimit: room.timeLimit
    });

    let timeLeft = room.timeLimit;
    const interval = setInterval(() => {
      timeLeft -= 1;
      const totalPlayers = Object.keys(room.players).length;
      if (totalPlayers > 0 && room.answeredCount >= totalPlayers / 2) {
         timeLeft -= 1;
      }
      io.to(room.id).emit('tick', timeLeft);

      if (timeLeft <= 0) {
        clearInterval(interval);
        endQuestion(room);
      }
    }, 1000);
    room.timerInterval = interval;
  }

  function endQuestion(room) {
    if (room.timerInterval) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
    }
    room.status = 'question_result';
    const question = room.questions[room.currentQuestionIndex];
    
    const distribution = { A: 0, B: 0, C: 0, D: 0 };
    Object.values(room.players).forEach(p => {
       const ans = p.answers.find(a => a.qIndex === room.currentQuestionIndex);
       if (ans && ans.selected) {
           const sel = ans.selected.toUpperCase();
           if (distribution[sel] !== undefined) {
               distribution[sel]++;
           }
       }
    });

    const leaderboard = Object.values(room.players)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(p => ({ nickname: p.nickname, score: p.score }));

    io.to(room.id).emit('question_result', {
      correctOption: question.Answer,
      leaderboard: leaderboard,
      distribution: distribution
    });
  }

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
