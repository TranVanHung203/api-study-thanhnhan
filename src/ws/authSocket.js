import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key';
const USER_ROOM_PREFIX = 'auth:user:';

let authIo = null;

const getUserRoom = (userId) => `${USER_ROOM_PREFIX}${String(userId)}`;

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

export const initAuthSocket = (io) => {
  authIo = io;

  io.use((socket, next) => {
    try {
      const token = getSocketToken(socket);
      if (!token) {
        return next(new Error('Unauthorized: Missing token'));
      }

      const decoded = jwt.verify(token, SECRET_KEY);
      socket.data.user = {
        id: String(decoded.id),
        username: decoded.username || null,
        email: decoded.email || null,
        refreshTokenId: decoded.refreshTokenId || null
      };

      return next();
    } catch (error) {
      return next(new Error('Unauthorized: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user?.id;
    if (userId) {
      socket.join(getUserRoom(userId));
    }

    socket.emit('auth:connected', {
      message: 'Connected to auth realtime channel',
      user: socket.data.user || null
    });
  });
};

export const isUserOnline = (userId) => {
  if (!authIo || !userId) {
    return false;
  }

  const room = authIo.sockets.adapter.rooms.get(getUserRoom(userId));
  return !!room && room.size > 0;
};

export const notifyUserSessionReplacement = (userId, payload = {}) => {
  if (!authIo || !userId) {
    return { ok: false, skipped: true, reason: 'auth-socket-not-ready' };
  }

  if (!isUserOnline(userId)) {
    return { ok: false, skipped: true, reason: 'user-offline' };
  }

  authIo.to(getUserRoom(userId)).emit('auth:session-replaced', {
    userId: String(userId),
    ...payload,
    emittedAt: new Date().toISOString()
  });

  return { ok: true };
};