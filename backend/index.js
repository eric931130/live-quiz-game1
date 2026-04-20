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
    
    // robust parsing: 2D array
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    let parsedQuestions = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 6) continue;
      
      let qText = String(row[0]).trim();
      if (!qText) continue;
      
      // Skip header row
      if (i === 0 && (qText.includes('題') || qText.toLowerCase().includes('question'))) continue;
      
      parsedQuestions.push({
        Question: qText,
        OptA: String(row[1]).trim(),
        OptB: String(row[2]).trim(),
        OptC: String(row[3]).trim(),
        OptD: String(row[4]).trim(),
        Answer: String(row[5]).trim().toUpperCase()
      });
    }

    if (parsedQuestions.length === 0) return res.status(400).send('找不到有效題目，請確認至少有6個滿格欄位(題目,A,B,C,D,正確選項)。');

    const bankName = req.body.bankName;
    if (bankName && bankName.trim() !== '') {
      saveBank(bankName.trim(), parsedQuestions);
    }

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
    const correctOption = question.Answer;
    const isCorrect = (selectedOption === correctOption);
    
    const timeTaken = (Date.now() - room.questionStartTime) / 1000;
    let points = 0;
    
    if (isCorrect) {
      player.streak += 1;
      let basePoints = Math.round(1000 * (1 - (timeTaken / room.timeLimit) / 2));
      let multiplier = 1 + (Math.min(player.streak, 10) * 0.1);
      points = Math.round(basePoints * multiplier);
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
    if (room.timerInterval) clearTimeout(room.timerInterval);
    
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

    Object.keys(room.players).forEach(pId => {
      io.to(pId).emit('new_question_student', {
        qIndex: room.currentQuestionIndex,
        total: room.questions.length,
        question: question.Question,
        options: { A: question.OptA, B: question.OptB, C: question.OptC, D: question.OptD },
        timeLimit: room.timeLimit
      });
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
    
    const leaderboard = Object.values(room.players)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(p => ({ nickname: p.nickname, score: p.score }));

    io.to(room.id).emit('question_result', {
      correctOption: question.Answer,
      leaderboard: leaderboard
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
