import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import Question from '../models/question.schema.js';
import RealtimeBattle from '../models/realtimeBattle.schema.js';

const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key';
const QUESTION_LIMIT = 10;
const DEFAULT_ROOM_SIZE = 2;
const MIN_ROOM_SIZE = 2;
const MAX_ROOM_SIZE = 8;

const SCORE_CONFIG = {
  maxPoints: 100,
  questionDurationMs: 20_000
};

const waitingQueue = [];
const activeBattles = new Map();
const socketToBattle = new Map();
const activeRooms = new Map();
const socketToRoom = new Map();
const battleQuestionTimers = new Map();

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

const getScoreByElapsedMs = (elapsedMs) => {
  const duration = SCORE_CONFIG.questionDurationMs;
  if (elapsedMs >= duration) return 0;
  const remainingRatio = (duration - elapsedMs) / duration;
  return Math.max(0, Math.ceil(SCORE_CONFIG.maxPoints * remainingRatio));
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

const toRoomSize = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return DEFAULT_ROOM_SIZE;
  return Math.max(MIN_ROOM_SIZE, Math.min(MAX_ROOM_SIZE, parsed));
};

const getQueueIndexBySocket = (socketId) => waitingQueue.findIndex((entry) => entry.socketId === socketId);

const removeFromQueueBySocket = (socketId) => {
  const index = getQueueIndexBySocket(socketId);
  if (index >= 0) waitingQueue.splice(index, 1);
};

const buildRoomPayload = (room) => ({
  roomId: room.roomId,
  roomName: room.roomName || null,
  hostUserId: room.hostUserId,
  maxPlayers: room.maxPlayers,
  status: room.status,
  createdAt: room.createdAt,
  playerCount: room.players.length,
  players: room.players.map((player) => ({
    userId: player.userId,
    username: player.username,
    fullName: player.fullName,
    isHost: player.userId === room.hostUserId
  }))
});

const buildRoomListPayload = () =>
  Array.from(activeRooms.values())
    .filter((room) => room.status === 'waiting')
    .map((room) => ({
      roomId: room.roomId,
      roomName: room.roomName || null,
      hostUserId: room.hostUserId,
      maxPlayers: room.maxPlayers,
      playerCount: room.players.length
    }));

const broadcastRoomList = (io) => {
  io.emit('battle:roomsChanged', { rooms: buildRoomListPayload() });
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

const getActiveAnsweredUserIds = (battle, state) => {
  if (!battle || !state) return [];
  const activeUserIds = new Set(battle.players.map((player) => String(player.userId)));
  return Array.from(state.submissions.keys()).filter((userId) => activeUserIds.has(String(userId)));
};

const clearBattleQuestionTimer = (battleId) => {
  const timeoutId = battleQuestionTimers.get(battleId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    battleQuestionTimers.delete(battleId);
  }
};

const removeSocketFromRoom = (io, socketId) => {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return null;

  const room = activeRooms.get(roomId);
  socketToRoom.delete(socketId);

  if (!room) return null;

  const playerIndex = room.players.findIndex((player) => player.socketId === socketId);
  if (playerIndex >= 0) {
    room.players.splice(playerIndex, 1);
  }

  if (!room.players.length) {
    activeRooms.delete(roomId);
    broadcastRoomList(io);
    return null;
  }

  if (!room.players.some((player) => player.userId === room.hostUserId)) {
    room.hostUserId = room.players[0].userId;
  }

  io.to(roomId).emit('battle:roomUpdated', buildRoomPayload(room));
  broadcastRoomList(io);
  return room;
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

const finalizeBattle = async (io, battle, reason = 'completed', options = {}) => {
  if (!battle || battle.status !== 'playing') return;
  clearBattleQuestionTimer(battle.battleId);
  const { forcedWinnerUserId = undefined, forcedStatus = undefined, forcedReason = undefined } = options;

  const resolvedReason = forcedReason || reason;
  battle.status = forcedStatus || (resolvedReason === 'completed' ? 'completed' : 'aborted');
  battle.reason = resolvedReason;
  battle.winnerUserId =
    forcedWinnerUserId !== undefined ? forcedWinnerUserId : evaluateWinner(battle);
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

const handlePlayerOutFromBattle = async (io, battle, socketId, reason) => {
  if (!battle || battle.status !== 'playing') return;

  const leavingPlayer = getPlayerBySocket(battle, socketId);
  if (!leavingPlayer) return;

  battle.players = battle.players.filter((player) => player.socketId !== socketId);
  socketToBattle.delete(socketId);

  io.to(battle.battleId).emit('battle:playerLeft', {
    battleId: battle.battleId,
    userId: leavingPlayer.userId,
    reason,
    remainingPlayerCount: battle.players.length,
    players: buildPublicScores(battle)
  });

  if (battle.players.length <= 1) {
    const winner = battle.players[0] || null;
    await finalizeBattle(io, battle, 'completed', {
      forcedWinnerUserId: winner ? winner.userId : null,
      forcedStatus: winner ? 'completed' : 'aborted',
      forcedReason: winner ? 'last_player_standing' : reason
    });
    return;
  }

  const currentState = getCurrentQuestionState(battle);
  io.to(battle.battleId).emit('battle:scoreUpdate', {
    battleId: battle.battleId,
    currentQuestionIndex: battle.currentQuestionIndex,
    scores: buildPublicScores(battle),
    answeredUserIds: getActiveAnsweredUserIds(battle, currentState)
  });

  await tryMoveNextQuestion(io, battle);
};

const scheduleQuestionTimeout = (io, battle) => {
  clearBattleQuestionTimer(battle.battleId);
  const question = getCurrentQuestion(battle);
  if (!question) return;

  const startedQuestionId = String(question._id);
  const timeoutId = setTimeout(async () => {
    const latestBattle = activeBattles.get(battle.battleId);
    if (!latestBattle || latestBattle.status !== 'playing') return;

    const latestQuestion = getCurrentQuestion(latestBattle);
    if (!latestQuestion || String(latestQuestion._id) !== startedQuestionId) return;

    io.to(latestBattle.battleId).emit('battle:questionTimeout', {
      battleId: latestBattle.battleId,
      currentQuestionIndex: latestBattle.currentQuestionIndex,
      questionId: startedQuestionId
    });

    const isLastQuestion = latestBattle.currentQuestionIndex >= latestBattle.questions.length - 1;
    if (isLastQuestion) {
      await finalizeBattle(io, latestBattle, 'completed');
      return;
    }

    latestBattle.currentQuestionIndex += 1;
    latestBattle.questionStartedAt = Date.now();
    const nextQuestion = latestBattle.questions[latestBattle.currentQuestionIndex];

    io.to(latestBattle.battleId).emit('battle:questionChanged', {
      battleId: latestBattle.battleId,
      currentQuestionIndex: latestBattle.currentQuestionIndex,
      questionId: String(nextQuestion._id),
      questionStartedAt: latestBattle.questionStartedAt,
      questionDurationMs: SCORE_CONFIG.questionDurationMs
    });

    scheduleQuestionTimeout(io, latestBattle);
  }, SCORE_CONFIG.questionDurationMs);

  battleQuestionTimers.set(battle.battleId, timeoutId);
};

const tryMoveNextQuestion = async (io, battle) => {
  const state = getCurrentQuestionState(battle);
  if (!state) return;

  const activeAnsweredUserIds = getActiveAnsweredUserIds(battle, state);
  if (activeAnsweredUserIds.length < battle.players.length) return;

  const isLastQuestion = battle.currentQuestionIndex >= battle.questions.length - 1;
  if (isLastQuestion) {
    await finalizeBattle(io, battle, 'completed');
    return;
  }

  clearBattleQuestionTimer(battle.battleId);
  battle.currentQuestionIndex += 1;
  battle.questionStartedAt = Date.now();
  const nextQuestion = battle.questions[battle.currentQuestionIndex];

  io.to(battle.battleId).emit('battle:questionChanged', {
    battleId: battle.battleId,
    currentQuestionIndex: battle.currentQuestionIndex,
    questionId: String(nextQuestion._id),
    questionStartedAt: battle.questionStartedAt,
    questionDurationMs: SCORE_CONFIG.questionDurationMs
  });

  scheduleQuestionTimeout(io, battle);
};

const createBattle = async (io, participantEntries) => {
  if (!Array.isArray(participantEntries) || participantEntries.length < 2) {
    throw new Error('Can it nhat 2 nguoi choi de bat dau tran dau');
  }

  const questions = await Question.aggregate([{ $sample: { size: QUESTION_LIMIT } }]);
  if (!questions.length) {
    throw new Error('Không có câu hỏi để bắt đầu trận đấu');
  }

  const battleId = randomUUID();
  const players = participantEntries.map((entry) => ({
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
    socket.emit('battle:matched', {
      battleId,
      startedAt: battle.startedAt,
      currentQuestionIndex: 0,
      questionStartedAt: battle.questionStartedAt,
      questionDurationMs: SCORE_CONFIG.questionDurationMs,
      questions: publicQuestions,
      opponent:
        players.length === 2
          ? (() => {
              const opponent = players.find((candidate) => candidate.userId !== player.userId) || null;
              return opponent
                ? {
                    userId: opponent.userId,
                    username: opponent.username,
                    fullName: opponent.fullName
                  }
                : null;
            })()
          : null,
      participants: players.map((participant) => ({
        userId: participant.userId,
        username: participant.username,
        fullName: participant.fullName
      })),
      scoreRule: SCORE_CONFIG
    });
  }

  scheduleQuestionTimeout(io, battle);
};

const runMatchmaking = async (io) => {
  while (true) {
    const pair = pickPairFromQueue();
    if (!pair) return;

    try {
      await createBattle(io, pair);
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
    questionStartedAt: battle.questionStartedAt,
    questionDurationMs: SCORE_CONFIG.questionDurationMs,
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

      if (socketToRoom.has(socket.id)) {
        socket.emit('battle:error', { message: 'Ban dang trong phong, vui long roi phong truoc' });
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

    socket.on('battle:createRoom', (payload = {}) => {
      const user = socket.data.user;
      if (!user?.id) {
        socket.emit('battle:error', { message: 'Khong xac dinh nguoi dung' });
        return;
      }

      if (socketToBattle.has(socket.id)) {
        socket.emit('battle:error', { message: 'Ban dang o trong mot tran dau' });
        return;
      }

      if (socketToRoom.has(socket.id)) {
        socket.emit('battle:error', { message: 'Ban da o trong mot phong' });
        return;
      }

      removeFromQueueBySocket(socket.id);
      battleNamespace.emit('battle:queueSize', { queueSize: waitingQueue.length });

      const roomId = payload.roomId || randomUUID();
      const roomName = typeof payload.roomName === 'string' ? payload.roomName.trim() : '';
      const maxPlayers = toRoomSize(payload.maxPlayers);

      if (activeRooms.has(roomId)) {
        socket.emit('battle:error', { message: 'Ma phong da ton tai, vui long tao lai' });
        return;
      }

      const room = {
        roomId,
        roomName: roomName || null,
        hostUserId: user.id,
        maxPlayers,
        status: 'waiting',
        createdAt: new Date(),
        players: [
          {
            socketId: socket.id,
            userId: user.id,
            username: user.username,
            fullName: user.fullName,
            joinedAt: Date.now()
          }
        ]
      };

      activeRooms.set(roomId, room);
      socketToRoom.set(socket.id, roomId);
      socket.join(roomId);

      const roomPayload = buildRoomPayload(room);
      socket.emit('battle:roomCreated', roomPayload);
      battleNamespace.to(roomId).emit('battle:roomUpdated', roomPayload);
      broadcastRoomList(battleNamespace);
    });

    socket.on('battle:getRooms', () => {
      socket.emit('battle:rooms', { rooms: buildRoomListPayload() });
    });

    socket.on('battle:joinRoom', (payload = {}) => {
      const user = socket.data.user;
      const roomId = payload.roomId;
      if (!user?.id || !roomId) {
        socket.emit('battle:error', { message: 'Thieu thong tin phong hoac nguoi dung' });
        return;
      }

      if (socketToBattle.has(socket.id)) {
        socket.emit('battle:error', { message: 'Ban dang o trong mot tran dau' });
        return;
      }

      if (socketToRoom.has(socket.id)) {
        socket.emit('battle:error', { message: 'Ban da o trong mot phong' });
        return;
      }

      const room = activeRooms.get(roomId);
      if (!room || room.status !== 'waiting') {
        socket.emit('battle:error', { message: 'Phong khong ton tai hoac da bat dau' });
        return;
      }

      if (room.players.some((player) => player.userId === user.id)) {
        socket.emit('battle:error', { message: 'Ban da co trong phong nay' });
        return;
      }

      if (room.players.length >= room.maxPlayers) {
        socket.emit('battle:error', { message: 'Phong da du nguoi' });
        return;
      }

      removeFromQueueBySocket(socket.id);
      battleNamespace.emit('battle:queueSize', { queueSize: waitingQueue.length });

      room.players.push({
        socketId: socket.id,
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        joinedAt: Date.now()
      });

      socketToRoom.set(socket.id, roomId);
      socket.join(roomId);
      battleNamespace.to(roomId).emit('battle:roomUpdated', buildRoomPayload(room));
      broadcastRoomList(battleNamespace);
    });

    socket.on('battle:leaveRoom', () => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) {
        socket.emit('battle:error', { message: 'Ban khong o trong phong nao' });
        return;
      }

      socket.leave(roomId);
      removeSocketFromRoom(battleNamespace, socket.id);
      socket.emit('battle:roomLeft', { roomId });
    });

    socket.on('battle:startRoom', async (payload = {}) => {
      const roomId = payload.roomId || socketToRoom.get(socket.id);
      if (!roomId) {
        socket.emit('battle:error', { message: 'Khong xac dinh phong de bat dau' });
        return;
      }

      const room = activeRooms.get(roomId);
      if (!room || room.status !== 'waiting') {
        socket.emit('battle:error', { message: 'Phong khong ton tai hoac da bat dau' });
        return;
      }

      const starter = room.players.find((player) => player.socketId === socket.id);
      if (!starter) {
        socket.emit('battle:error', { message: 'Ban khong thuoc phong nay' });
        return;
      }

      if (starter.userId !== room.hostUserId) {
        socket.emit('battle:error', { message: 'Chi chu phong moi co the bat dau tran' });
        return;
      }

      if (room.players.length < MIN_ROOM_SIZE) {
        socket.emit('battle:error', { message: 'Can it nhat 2 nguoi de bat dau' });
        return;
      }

      room.status = 'starting';

      try {
        for (const player of room.players) {
          removeFromQueueBySocket(player.socketId);
        }
        battleNamespace.emit('battle:queueSize', { queueSize: waitingQueue.length });

        await createBattle(battleNamespace, room.players);
        for (const player of room.players) {
          socketToRoom.delete(player.socketId);
        }
        activeRooms.delete(roomId);
        battleNamespace.in(roomId).socketsLeave(roomId);
        broadcastRoomList(battleNamespace);
      } catch (error) {
        room.status = 'waiting';
        battleNamespace.to(roomId).emit('battle:error', {
          message: error?.message || 'Khong the bat dau tran tu phong nay'
        });
      }
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
      let scoreAwarded = 0;
      if (isCorrect) {
        scoreAwarded = getScoreByElapsedMs(elapsedMs);
      }

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
        answeredUserIds: getActiveAnsweredUserIds(battle, state)
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

      await handlePlayerOutFromBattle(battleNamespace, battle, socket.id, 'forfeit');
    });

    socket.on('disconnect', async () => {
      removeFromQueueBySocket(socket.id);
      battleNamespace.emit('battle:queueSize', { queueSize: waitingQueue.length });

      const roomId = socketToRoom.get(socket.id);
      if (roomId) {
        socket.leave(roomId);
        removeSocketFromRoom(battleNamespace, socket.id);
      }

      const battleId = socketToBattle.get(socket.id);
      if (!battleId) return;

      const battle = activeBattles.get(battleId);
      if (!battle || battle.status !== 'playing') return;

      await handlePlayerOutFromBattle(battleNamespace, battle, socket.id, 'disconnect');
    });
  });
};
