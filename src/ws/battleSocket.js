import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import Question from '../models/question.schema.js';
import RealtimeBattle from '../models/realtimeBattle.schema.js';

const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key';
const QUESTION_LIMIT = 10;

const SCORE_CONFIG = {
  base: 100,
  maxSpeedBonus: 50,
  bonusDecayPerMs: 200
};

const waitingQueue = [];
const activeBattles = new Map();
const socketToBattle = new Map();

const normalizeValue = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'number') return String(value).trim().toLowerCase();
  return JSON.stringify(value);
};

const compareAnswers = (storedAnswer, userAnswer, choices = []) => {
  if (storedAnswer == null) return false;

  if (typeof storedAnswer === 'number') {
    if (typeof userAnswer === 'number') return storedAnswer === userAnswer;
    const correctChoice = choices[storedAnswer];
    if (!correctChoice) return false;
    return normalizeValue(correctChoice) === normalizeValue(userAnswer);
  }

  if (Array.isArray(storedAnswer)) {
    if (!Array.isArray(userAnswer)) return false;
    const expected = [...storedAnswer].map(normalizeValue).sort();
    const received = [...userAnswer].map(normalizeValue).sort();
    return JSON.stringify(expected) === JSON.stringify(received);
  }

  return normalizeValue(storedAnswer) === normalizeValue(userAnswer);
};

const getSpeedBonus = (elapsedMs) => {
  const reduced = Math.floor(elapsedMs / SCORE_CONFIG.bonusDecayPerMs);
  return Math.max(0, SCORE_CONFIG.maxSpeedBonus - reduced);
};

const sanitizeQuestionForClient = (question) => ({
  _id: question._id,
  quizId: question.quizId,
  questionText: question.questionText || null,
  rawQuestion: question.rawQuestion ?? null,
  imageQuestion: question.imageQuestion || null,
  choices: Array.isArray(question.choices) ? question.choices : [],
  questionType: question.questionType || 'single',
  detailType: question.detailType || null,
  hintVoice: question.hintVoice || null
});

const getQueueIndexBySocket = (socketId) => waitingQueue.findIndex((entry) => entry.socketId === socketId);

const removeFromQueueBySocket = (socketId) => {
  const index = getQueueIndexBySocket(socketId);
  if (index >= 0) waitingQueue.splice(index, 1);
};

const pickPairFromQueue = () => {
  if (waitingQueue.length < 2) return null;

  for (let i = 0; i < waitingQueue.length; i += 1) {
    for (let j = i + 1; j < waitingQueue.length; j += 1) {
      if (waitingQueue[i].userId !== waitingQueue[j].userId) {
        const second = waitingQueue.splice(j, 1)[0];
        const first = waitingQueue.splice(i, 1)[0];
        return [first, second];
      }
    }
  }

  return null;
};

const buildPublicScores = (battle) =>
  battle.players.map((player) => ({
    userId: player.userId,
    username: player.username,
    fullName: player.fullName,
    totalScore: player.totalScore,
    correctCount: player.correctCount,
    totalCorrectTimeMs: player.totalCorrectTimeMs
  }));

const getPlayerBySocket = (battle, socketId) => battle.players.find((player) => player.socketId === socketId);

const getQuestionById = (battle, questionId) =>
  battle.questions.find((question) => String(question._id) === String(questionId));

const getCurrentQuestion = (battle) => battle.questions[battle.currentQuestionIndex] || null;

const getCurrentQuestionState = (battle) => {
  const question = getCurrentQuestion(battle);
  if (!question) return null;
  return battle.questionStates.get(String(question._id));
};

const persistBattleResult = async (battle) => {
  const players = battle.players.map((player) => ({
    userId: player.userId,
    username: player.username,
    fullName: player.fullName,
    totalScore: player.totalScore,
    correctCount: player.correctCount,
    totalCorrectTimeMs: player.totalCorrectTimeMs,
    isWinner: battle.winnerUserId === player.userId
  }));

  const questions = battle.questions.map((question) => {
    const state = battle.questionStates.get(String(question._id));
    const submissions = state
      ? Array.from(state.submissions.values()).map((submission) => ({
          userId: submission.userId,
          userAnswer: submission.userAnswer,
          isCorrect: submission.isCorrect,
          elapsedMs: submission.elapsedMs,
          scoreAwarded: submission.scoreAwarded,
          submittedAt: submission.submittedAt
        }))
      : [];

    return {
      questionId: question._id,
      submissions
    };
  });

  await RealtimeBattle.findOneAndUpdate(
    { battleId: battle.battleId },
    {
      battleId: battle.battleId,
      status: battle.status,
      reason: battle.reason || null,
      winnerUserId: battle.winnerUserId || null,
      players,
      questions,
      startedAt: battle.startedAt,
      endedAt: battle.endedAt || new Date()
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const evaluateWinner = (battle) => {
  const sorted = [...battle.players].sort((left, right) => {
    if (right.totalScore !== left.totalScore) return right.totalScore - left.totalScore;
    if (left.totalCorrectTimeMs !== right.totalCorrectTimeMs) {
      return left.totalCorrectTimeMs - right.totalCorrectTimeMs;
    }
    if (right.correctCount !== left.correctCount) return right.correctCount - left.correctCount;
    return 0;
  });

  if (sorted.length < 2) return sorted[0]?.userId || null;
  const [first, second] = sorted;

  if (
    first.totalScore === second.totalScore &&
    first.totalCorrectTimeMs === second.totalCorrectTimeMs &&
    first.correctCount === second.correctCount
  ) {
    return null;
  }

  return first.userId;
};

const finalizeBattle = async (io, battle, reason = 'completed') => {
  if (!battle || battle.status !== 'playing') return;

  battle.status = reason === 'completed' ? 'completed' : 'aborted';
  battle.reason = reason;
  battle.winnerUserId = evaluateWinner(battle);
  battle.endedAt = new Date();

  const payload = {
    battleId: battle.battleId,
    status: battle.status,
    reason: battle.reason,
    winnerUserId: battle.winnerUserId,
    players: buildPublicScores(battle),
    startedAt: battle.startedAt,
    endedAt: battle.endedAt
  };

  io.to(battle.battleId).emit('battle:ended', payload);

  await persistBattleResult(battle);

  activeBattles.delete(battle.battleId);
  for (const player of battle.players) {
    socketToBattle.delete(player.socketId);
  }
};

const tryMoveNextQuestion = async (io, battle) => {
  const state = getCurrentQuestionState(battle);
  if (!state) return;

  if (state.submissions.size < battle.players.length) return;

  const isLastQuestion = battle.currentQuestionIndex >= battle.questions.length - 1;
  if (isLastQuestion) {
    await finalizeBattle(io, battle, 'completed');
    return;
  }

  battle.currentQuestionIndex += 1;
  battle.questionStartedAt = Date.now();

  io.to(battle.battleId).emit('battle:questionChanged', {
    battleId: battle.battleId,
    currentQuestionIndex: battle.currentQuestionIndex,
    questionId: String(battle.questions[battle.currentQuestionIndex]._id)
  });
};

const createBattle = async (io, first, second) => {
  const questions = await Question.aggregate([{ $sample: { size: QUESTION_LIMIT } }]);
  if (!questions.length) {
    throw new Error('Không có câu hỏi để bắt đầu trận đấu');
  }

  const battleId = randomUUID();
  const players = [first, second].map((entry) => ({
    socketId: entry.socketId,
    userId: entry.userId,
    username: entry.username,
    fullName: entry.fullName,
    totalScore: 0,
    correctCount: 0,
    totalCorrectTimeMs: 0
  }));

  const questionStates = new Map();
  for (const question of questions) {
    questionStates.set(String(question._id), {
      questionId: String(question._id),
      submissions: new Map()
    });
  }

  const battle = {
    battleId,
    status: 'playing',
    reason: null,
    winnerUserId: null,
    startedAt: new Date(),
    endedAt: null,
    players,
    questions,
    questionStates,
    currentQuestionIndex: 0,
    questionStartedAt: Date.now()
  };

  activeBattles.set(battleId, battle);

  const publicQuestions = questions.map(sanitizeQuestionForClient);

  for (const player of players) {
    socketToBattle.set(player.socketId, battleId);
    const socket = io.sockets.get(player.socketId);
    if (!socket) continue;

    socket.join(battleId);
    const opponent = players.find((candidate) => candidate.userId !== player.userId) || null;

    socket.emit('battle:matched', {
      battleId,
      startedAt: battle.startedAt,
      currentQuestionIndex: 0,
      questions: publicQuestions,
      opponent: opponent
        ? {
            userId: opponent.userId,
            username: opponent.username,
            fullName: opponent.fullName
          }
        : null,
      scoreRule: SCORE_CONFIG
    });
  }
};

const runMatchmaking = async (io) => {
  while (true) {
    const pair = pickPairFromQueue();
    if (!pair) return;

    try {
      await createBattle(io, pair[0], pair[1]);
    } catch (error) {
      const message = error?.message || 'Không thể bắt đầu trận đấu';
      const firstSocket = io.sockets.get(pair[0].socketId);
      const secondSocket = io.sockets.get(pair[1].socketId);
      if (firstSocket) firstSocket.emit('battle:error', { message });
      if (secondSocket) secondSocket.emit('battle:error', { message });
    }
  }
};

const getSocketToken = (socket) => {
  const authToken = socket.handshake?.auth?.token;
  if (authToken && typeof authToken === 'string') {
    return authToken.startsWith('Bearer ') ? authToken.substring(7) : authToken;
  }

  const headerAuth = socket.handshake?.headers?.authorization;
  if (headerAuth && headerAuth.startsWith('Bearer ')) {
    return headerAuth.substring(7);
  }

  return null;
};

export const getBattleSnapshot = (battleId) => {
  const battle = activeBattles.get(battleId);
  if (!battle) return null;

  return {
    battleId: battle.battleId,
    status: battle.status,
    reason: battle.reason,
    startedAt: battle.startedAt,
    currentQuestionIndex: battle.currentQuestionIndex,
    winnerUserId: battle.winnerUserId,
    players: buildPublicScores(battle),
    questionCount: battle.questions.length
  };
};

export const initBattleSocket = (io) => {
  const battleNamespace = io.of('/battle');

  battleNamespace.use((socket, next) => {
    try {
      const token = getSocketToken(socket);
      if (!token) return next(new Error('Unauthorized: Missing token'));

      const decoded = jwt.verify(token, SECRET_KEY);
      socket.data.user = {
        id: String(decoded.id),
        username: decoded.username || null,
        fullName: decoded.fullName || decoded.username || null
      };

      return next();
    } catch (error) {
      return next(new Error('Unauthorized: Invalid token'));
    }
  });

  battleNamespace.on('connection', (socket) => {
    socket.emit('battle:connected', {
      message: 'Connected to battle namespace',
      user: socket.data.user
    });

    socket.on('battle:joinQueue', async () => {
      const user = socket.data.user;
      if (!user?.id) {
        socket.emit('battle:error', { message: 'Không xác định người dùng' });
        return;
      }

      if (socketToBattle.has(socket.id)) {
        socket.emit('battle:error', { message: 'Bạn đang ở trong một trận đấu' });
        return;
      }

      if (getQueueIndexBySocket(socket.id) >= 0) {
        socket.emit('battle:queueJoined', { queueSize: waitingQueue.length });
        return;
      }

      waitingQueue.push({
        socketId: socket.id,
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        joinedAt: Date.now()
      });

      battleNamespace.emit('battle:queueSize', { queueSize: waitingQueue.length });
      socket.emit('battle:queueJoined', { queueSize: waitingQueue.length });

      await runMatchmaking(battleNamespace);
      battleNamespace.emit('battle:queueSize', { queueSize: waitingQueue.length });
    });

    socket.on('battle:leaveQueue', () => {
      removeFromQueueBySocket(socket.id);
      socket.emit('battle:queueLeft');
      battleNamespace.emit('battle:queueSize', { queueSize: waitingQueue.length });
    });

    socket.on('battle:selecting', (payload = {}) => {
      const { battleId, questionId, selectedAnswer } = payload;
      if (!battleId) return;
      const activeBattleId = socketToBattle.get(socket.id);
      if (!activeBattleId || activeBattleId !== battleId) return;

      const battle = activeBattles.get(battleId);
      if (!battle || battle.status !== 'playing') return;

      const currentQuestion = getCurrentQuestion(battle);
      if (!currentQuestion || String(currentQuestion._id) !== String(questionId)) return;

      socket.to(battleId).emit('battle:opponentSelecting', {
        battleId,
        questionId: String(questionId),
        selectedAnswer,
        fromUserId: socket.data.user.id,
        at: Date.now()
      });
    });

    socket.on('battle:submitAnswer', async (payload = {}) => {
      const { battleId, questionId, answer } = payload;
      if (!battleId || !questionId) return;

      const activeBattleId = socketToBattle.get(socket.id);
      if (!activeBattleId || activeBattleId !== battleId) {
        socket.emit('battle:error', { message: 'Bạn không thuộc trận đấu này' });
        return;
      }

      const battle = activeBattles.get(battleId);
      if (!battle || battle.status !== 'playing') {
        socket.emit('battle:error', { message: 'Trận đấu không còn hoạt động' });
        return;
      }

      const currentQuestion = getCurrentQuestion(battle);
      if (!currentQuestion || String(currentQuestion._id) !== String(questionId)) {
        socket.emit('battle:error', { message: 'Không đúng câu hỏi hiện tại' });
        return;
      }

      const player = getPlayerBySocket(battle, socket.id);
      if (!player) {
        socket.emit('battle:error', { message: 'Không xác định người chơi trong trận' });
        return;
      }

      const state = getQuestionById(battle, questionId)
        ? battle.questionStates.get(String(questionId))
        : null;
      if (!state) {
        socket.emit('battle:error', { message: 'Không tìm thấy dữ liệu câu hỏi' });
        return;
      }

      if (state.submissions.has(player.userId)) {
        socket.emit('battle:error', { message: 'Bạn đã trả lời câu này rồi' });
        return;
      }

      const now = Date.now();
      const elapsedMs = Math.max(0, now - battle.questionStartedAt);
      const isCorrect = compareAnswers(currentQuestion.answer, answer, currentQuestion.choices || []);
      const scoreAwarded = isCorrect ? SCORE_CONFIG.base + getSpeedBonus(elapsedMs) : 0;

      if (isCorrect) {
        player.correctCount += 1;
        player.totalCorrectTimeMs += elapsedMs;
      }
      player.totalScore += scoreAwarded;

      state.submissions.set(player.userId, {
        userId: player.userId,
        userAnswer: answer,
        isCorrect,
        elapsedMs,
        scoreAwarded,
        submittedAt: new Date()
      });

      socket.emit('battle:answerResult', {
        battleId,
        questionId: String(questionId),
        isCorrect,
        scoreAwarded,
        elapsedMs,
        totalScore: player.totalScore,
        correctCount: player.correctCount
      });

      battleNamespace.to(battleId).emit('battle:scoreUpdate', {
        battleId,
        currentQuestionIndex: battle.currentQuestionIndex,
        scores: buildPublicScores(battle),
        answeredUserIds: Array.from(state.submissions.keys())
      });

      await tryMoveNextQuestion(battleNamespace, battle);
    });

    socket.on('battle:forfeit', async (payload = {}) => {
      const { battleId } = payload;
      const activeBattleId = socketToBattle.get(socket.id);
      if (!activeBattleId || activeBattleId !== battleId) return;

      const battle = activeBattles.get(battleId);
      if (!battle || battle.status !== 'playing') return;

      const forfeitPlayer = getPlayerBySocket(battle, socket.id);
      if (!forfeitPlayer) return;

      const opponent = battle.players.find((player) => player.socketId !== socket.id);
      if (opponent) battle.winnerUserId = opponent.userId;

      await finalizeBattle(battleNamespace, battle, 'forfeit');
    });

    socket.on('disconnect', async () => {
      removeFromQueueBySocket(socket.id);

      const battleId = socketToBattle.get(socket.id);
      if (!battleId) return;

      const battle = activeBattles.get(battleId);
      if (!battle || battle.status !== 'playing') return;

      const opponent = battle.players.find((player) => player.socketId !== socket.id);
      if (opponent) battle.winnerUserId = opponent.userId;

      await finalizeBattle(battleNamespace, battle, 'disconnect');
    });
  });
};
