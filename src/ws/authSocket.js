import jwt from 'jsonwebtoken';
import User from '../models/user.schema.js';

const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key';
const USER_ROOM_PREFIX = 'auth:user:';

let authIo = null;
const onlineSocketsByUserId = new Map();

const getUserRoom = (userId) => `${USER_ROOM_PREFIX}${String(userId)}`;

const getSocketSet = (userId) => {
  const normalizedUserId = String(userId);
  if (!onlineSocketsByUserId.has(normalizedUserId)) {
    onlineSocketsByUserId.set(normalizedUserId, new Set());
  }
  return onlineSocketsByUserId.get(normalizedUserId);
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

export const initAuthSocket = (io) => {
  authIo = io;

  User.updateMany(
    { isOnline: true },
    { $set: { isOnline: false, lastSeenAt: new Date() } }
  ).catch((error) => {
    console.error('[Presence] Failed to reset stale online users:', error);
  });

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

      const socketSet = getSocketSet(userId);
      const isFirstSocket = socketSet.size === 0;
      socketSet.add(socket.id);

      const now = new Date();
      const updatePayload = isFirstSocket
        ? { isOnline: true, onlineAt: now, lastSeenAt: now }
        : { isOnline: true, lastSeenAt: now };

      User.updateOne(
        { _id: userId, isStatus: { $ne: 'deleted' } },
        { $set: updatePayload }
      ).catch((error) => {
        console.error('[Presence] Failed to mark user online:', error);
      });
    }

    socket.emit('auth:connected', {
      message: 'Connected to auth realtime channel',
      user: socket.data.user || null,
      presence: userId
        ? {
          isOnline: true,
          onlineAt: new Date().toISOString()
        }
        : null
    });

    socket.on('presence:ping', () => {
      const pingUserId = socket.data.user?.id;
      if (!pingUserId) return;

      User.updateOne(
        { _id: pingUserId, isStatus: { $ne: 'deleted' } },
        { $set: { isOnline: true, lastSeenAt: new Date() } }
      ).catch((error) => {
        console.error('[Presence] Failed to update user heartbeat:', error);
      });
    });

    socket.on('disconnect', () => {
      const disconnectedUserId = socket.data.user?.id;
      if (!disconnectedUserId) return;

      const socketSet = onlineSocketsByUserId.get(String(disconnectedUserId));
      if (!socketSet) return;

      socketSet.delete(socket.id);
      const now = new Date();

      if (socketSet.size === 0) {
        onlineSocketsByUserId.delete(String(disconnectedUserId));
        User.updateOne(
          { _id: disconnectedUserId, isStatus: { $ne: 'deleted' } },
          { $set: { isOnline: false, onlineAt: null, lastSeenAt: now } }
        ).catch((error) => {
          console.error('[Presence] Failed to mark user offline:', error);
        });
        return;
      }

      User.updateOne(
        { _id: disconnectedUserId, isStatus: { $ne: 'deleted' } },
        { $set: { lastSeenAt: now } }
      ).catch((error) => {
        console.error('[Presence] Failed to update user disconnect heartbeat:', error);
      });
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

export const getOnlineUserIds = () => Array.from(onlineSocketsByUserId.keys());

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
