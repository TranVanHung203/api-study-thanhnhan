import jwt from 'jsonwebtoken';
import RefreshToken from '../models/refreshToken.schema.js';
import User from '../models/user.schema.js';
import {
  getPresenceByUserIds,
  getOnlineUserIds as getPresenceOnlineUserIds,
  markUserOffline,
  markUserOnline,
  refreshUserPresence
} from '../services/presenceService.js';

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

const emitPresenceEvent = (eventName, payload) => {
  if (!authIo) return;
  authIo.emit(eventName, {
    ...payload,
    emittedAt: new Date().toISOString()
  });
};

const buildPublicSocketUser = (user, decoded) => ({
  id: String(user._id),
  userCode: user.userCode || null,
  username: user.username || decoded.username || null,
  email: user.email || decoded.email || null,
  fullName: user.fullName || decoded.fullName || null,
  roles: user.roles || []
});

const getMinutesAgo = (dateValue, now = new Date()) => {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
};

const buildSocketPresencePayload = (presence, now = new Date()) => {
  const isOnline = presence?.isOnline === true;
  const onlineAt = presence?.onlineAt || null;
  const lastSeenAt = presence?.lastSeenAt || null;

  return {
    ...presence,
    isOnline,
    onlineAt,
    lastSeenAt,
    onlineForMinutes: isOnline ? getMinutesAgo(onlineAt, now) : null,
    lastSeenMinutesAgo: lastSeenAt ? getMinutesAgo(lastSeenAt, now) : null
  };
};

const getOnlineUsersPayload = async () => {
  const onlineResult = await getPresenceOnlineUserIds();
  const userIds = onlineResult.userIds;
  if (!userIds.length) {
    return {
      total: 0,
      source: onlineResult.source,
      users: []
    };
  }

  const presenceResult = await getPresenceByUserIds(userIds);
  const users = await User.find({
    _id: { $in: userIds },
    isStatus: { $ne: 'deleted' }
  })
    .select('_id userCode username fullName email roles avatar')
    .sort({ fullName: 1 })
    .lean();

  return {
    total: users.length,
    source: presenceResult.source,
    users: users.map((user) => ({
      userId: String(user._id),
      userCode: user.userCode || null,
      username: user.username || null,
      fullName: user.fullName,
      email: user.email || null,
      avatar: user.avatar || null,
      roles: user.roles || [],
      presence: buildSocketPresencePayload(
        presenceResult.presenceByUserId.get(String(user._id)) || {
          userId: String(user._id),
          isOnline: true,
          onlineAt: null,
          lastSeenAt: null
        }
      )
    }))
  };
};

export const initAuthSocket = (io) => {
  authIo = io;

  User.updateMany(
    { isOnline: true },
    { $set: { isOnline: false, lastSeenAt: new Date() } }
  ).catch((error) => {
    console.error('[Presence] Failed to reset stale online users:', error);
  });

  io.use(async (socket, next) => {
    try {
      const token = getSocketToken(socket);
      if (!token) {
        return next(new Error('Unauthorized: Missing token'));
      }

      const decoded = jwt.verify(token, SECRET_KEY);
      if (!decoded.id || !decoded.refreshTokenId) {
        return next(new Error('Unauthorized: Invalid session token'));
      }

      const [user, refreshToken] = await Promise.all([
        User.findOne({ _id: decoded.id, isStatus: { $ne: 'deleted' } })
          .select('_id userCode username email fullName roles')
          .lean(),
        RefreshToken.findOne({
          _id: decoded.refreshTokenId,
          userId: decoded.id,
          isRevoked: false,
          expiresAt: { $gt: new Date() }
        })
          .select('_id')
          .lean()
      ]);

      if (!user || !refreshToken) {
        return next(new Error('Unauthorized: Session expired'));
      }

      socket.data.user = {
        ...buildPublicSocketUser(user, decoded),
        refreshTokenId: String(decoded.refreshTokenId)
      };

      return next();
    } catch (error) {
      return next(new Error('Unauthorized: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.user?.id;
    if (userId) {
      socket.join(getUserRoom(userId));

      const presenceResult = await markUserOnline(userId, socket.id);
      const now = new Date();
      const onlineAt = presenceResult.presence?.onlineAt
        ? new Date(presenceResult.presence.onlineAt)
        : now;
      const updatePayload = presenceResult.changed
        ? { isOnline: true, onlineAt, lastSeenAt: now }
        : { isOnline: true, lastSeenAt: now };

      User.updateOne(
        { _id: userId, isStatus: { $ne: 'deleted' } },
        { $set: updatePayload }
      ).catch((error) => {
        console.error('[Presence] Failed to mark user online:', error);
      });

      const onlinePresencePayload = {
        userId,
        user: socket.data.user,
        presence: buildSocketPresencePayload(
          presenceResult.presence || {
            userId,
            isOnline: true,
            onlineAt: onlineAt.toISOString(),
            lastSeenAt: now.toISOString()
          },
          now
        )
      };

      // Always emit user-online when a socket successfully connects so admin clients
      // that only subscribe to this event still receive immediate online updates.
      emitPresenceEvent('presence:user-online', onlinePresencePayload);

      // Keep updated event for backward compatibility on additional connections.
      if (!presenceResult.changed) {
        emitPresenceEvent('presence:updated', onlinePresencePayload);
      }
    }

    socket.emit('auth:connected', {
      message: 'Connected to auth realtime channel',
      user: socket.data.user || null,
      presence: userId
        ? buildSocketPresencePayload({
          isOnline: true,
          onlineAt: new Date().toISOString()
        })
        : null
    });

    socket.on('presence:ping', () => {
      const pingUserId = socket.data.user?.id;
      if (!pingUserId) return;

      refreshUserPresence(pingUserId, socket.id).catch((error) => {
        console.error('[Presence] Failed to refresh socket presence:', error);
      });

      User.updateOne(
        { _id: pingUserId, isStatus: { $ne: 'deleted' } },
        { $set: { isOnline: true, lastSeenAt: new Date() } }
      ).catch((error) => {
        console.error('[Presence] Failed to update user heartbeat:', error);
      });
    });

    socket.on('presence:get-online-users', async (payload = {}, ack) => {
      try {
        const snapshot = await getOnlineUsersPayload();
        if (typeof ack === 'function') {
          ack({ ok: true, ...snapshot });
          return;
        }

        socket.emit('presence:online-users', snapshot);
      } catch (error) {
        const response = {
          ok: false,
          message: 'Failed to get online users'
        };

        if (typeof ack === 'function') {
          ack(response);
          return;
        }

        socket.emit('presence:error', response);
      }
    });

    socket.on('disconnect', async () => {
      const disconnectedUserId = socket.data.user?.id;
      if (!disconnectedUserId) return;

      const now = new Date();
      const presenceResult = await markUserOffline(disconnectedUserId, socket.id);

      if (presenceResult.changed && !presenceResult.isOnline) {
        User.updateOne(
          { _id: disconnectedUserId, isStatus: { $ne: 'deleted' } },
          { $set: { isOnline: false, onlineAt: null, lastSeenAt: now } }
        ).catch((error) => {
          console.error('[Presence] Failed to mark user offline:', error);
        });

        emitPresenceEvent('presence:user-offline', {
          userId: disconnectedUserId,
          presence: buildSocketPresencePayload(
            presenceResult.presence || {
              userId: disconnectedUserId,
              isOnline: false,
              onlineAt: null,
              lastSeenAt: now.toISOString()
            },
            now
          )
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

export const getOnlineUserIds = async () => {
  const result = await getPresenceOnlineUserIds();
  return result.userIds;
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

export const terminateUserAuthSessions = (userId, payload = {}) => {
  if (!authIo || !userId) {
    return { ok: false, skipped: true, reason: 'auth-socket-not-ready', disconnected: 0 };
  }

  const roomName = getUserRoom(userId);
  const room = authIo.sockets.adapter.rooms.get(roomName);
  const socketIds = room ? Array.from(room) : [];

  if (!socketIds.length) {
    return { ok: false, skipped: true, reason: 'user-offline', disconnected: 0 };
  }

  authIo.to(roomName).emit('auth:session-replaced', {
    userId: String(userId),
    ...payload,
    emittedAt: new Date().toISOString()
  });

  socketIds.forEach((socketId) => {
    const socket = authIo.sockets.sockets.get(socketId);
    if (!socket) return;
    socket.disconnect(true);
  });

  return { ok: true, disconnected: socketIds.length };
};

export const emitAuthUserEvent = (userId, eventName, payload = {}) => {
  if (!authIo || !userId || !eventName) {
    return { ok: false, skipped: true, reason: 'auth-socket-not-ready' };
  }

  authIo.to(getUserRoom(userId)).emit(eventName, {
    userId: String(userId),
    ...payload,
    emittedAt: new Date().toISOString()
  });

  return { ok: true };
};
