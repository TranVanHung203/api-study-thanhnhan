import redis, { ensureRedisConnected, redisHealthy } from '../config/redisConfig.js';

const PRESENCE_ONLINE_USERS_KEY = 'presence:online:userIds';
const PRESENCE_USER_KEY_PREFIX = 'presence:user:';
const PRESENCE_TTL_SECONDS = Number.parseInt(process.env.PRESENCE_TTL_SECONDS, 10) || 90;

const fallbackPresenceByUserId = new Map();

const getPresenceUserKey = (userId) => `${PRESENCE_USER_KEY_PREFIX}${String(userId)}`;

const isRedisReady = async () => {
  const connected = await ensureRedisConnected();
  return connected && redisHealthy === true && redis.status === 'ready';
};

const buildFallbackPresence = (userId) => {
  const normalizedUserId = String(userId);
  if (!fallbackPresenceByUserId.has(normalizedUserId)) {
    fallbackPresenceByUserId.set(normalizedUserId, {
      userId: normalizedUserId,
      socketIds: new Set(),
      onlineAt: null,
      lastSeenAt: null,
      updatedAt: null
    });
  }
  return fallbackPresenceByUserId.get(normalizedUserId);
};

const serializeRedisPresence = (userId, presence) => ({
  userId: String(userId),
  onlineAt: presence.onlineAt || '',
  lastSeenAt: presence.lastSeenAt || '',
  updatedAt: presence.updatedAt || ''
});

const parseRedisPresence = (row) => {
  if (!row || !row.userId) return null;
  return {
    userId: row.userId,
    isOnline: true,
    onlineAt: row.onlineAt || null,
    lastSeenAt: row.lastSeenAt || null,
    updatedAt: row.updatedAt || null,
    source: 'redis'
  };
};

export const markUserOnline = async (userId, socketId) => {
  const normalizedUserId = String(userId || '');
  const normalizedSocketId = String(socketId || '');
  if (!normalizedUserId || !normalizedSocketId) {
    return { ok: false, changed: false, isOnline: false, source: 'invalid' };
  }

  const now = new Date().toISOString();

  try {
    if (await isRedisReady()) {
      const presenceKey = getPresenceUserKey(normalizedUserId);
      const socketSetKey = `${presenceKey}:sockets`;
      const existed = await redis.exists(presenceKey);
      const current = existed ? await redis.hgetall(presenceKey) : {};
      const onlineAt = current.onlineAt || now;

      await redis
        .multi()
        .sadd(PRESENCE_ONLINE_USERS_KEY, normalizedUserId)
        .sadd(socketSetKey, normalizedSocketId)
        .expire(socketSetKey, PRESENCE_TTL_SECONDS)
        .hset(
          presenceKey,
          serializeRedisPresence(normalizedUserId, {
            onlineAt,
            lastSeenAt: now,
            updatedAt: now
          })
        )
        .expire(presenceKey, PRESENCE_TTL_SECONDS)
        .exec();

      return {
        ok: true,
        changed: !existed,
        isOnline: true,
        source: 'redis',
        presence: {
          userId: normalizedUserId,
          isOnline: true,
          onlineAt,
          lastSeenAt: now,
          updatedAt: now,
          source: 'redis'
        }
      };
    }
  } catch (error) {
    console.warn('[Presence] Redis mark online failed, using fallback:', error?.message || error);
  }

  const presence = buildFallbackPresence(normalizedUserId);
  const changed = presence.socketIds.size === 0;
  presence.socketIds.add(normalizedSocketId);
  presence.onlineAt = presence.onlineAt || now;
  presence.lastSeenAt = now;
  presence.updatedAt = now;

  return {
    ok: true,
    changed,
    isOnline: true,
    source: 'memory',
    presence: {
      userId: normalizedUserId,
      isOnline: true,
      onlineAt: presence.onlineAt,
      lastSeenAt: presence.lastSeenAt,
      updatedAt: presence.updatedAt,
      source: 'memory'
    }
  };
};

export const refreshUserPresence = async (userId, socketId = null) => {
  const normalizedUserId = String(userId || '');
  if (!normalizedUserId) {
    return { ok: false, source: 'invalid' };
  }

  const now = new Date().toISOString();

  try {
    if (await isRedisReady()) {
      const presenceKey = getPresenceUserKey(normalizedUserId);
      const socketSetKey = `${presenceKey}:sockets`;

      const current = await redis.hgetall(presenceKey);
      const onlineAt = current.onlineAt || now;

      const multi = redis
        .multi()
        .sadd(PRESENCE_ONLINE_USERS_KEY, normalizedUserId)
        .hset(
          presenceKey,
          serializeRedisPresence(normalizedUserId, {
            onlineAt,
            lastSeenAt: now,
            updatedAt: now
          })
        )
        .expire(presenceKey, PRESENCE_TTL_SECONDS);

      if (socketId) {
        multi.sadd(socketSetKey, String(socketId)).expire(socketSetKey, PRESENCE_TTL_SECONDS);
      }

      await multi.exec();
      return { ok: true, source: 'redis' };
    }
  } catch (error) {
    console.warn('[Presence] Redis refresh failed, using fallback:', error?.message || error);
  }

  const presence = buildFallbackPresence(normalizedUserId);
  if (socketId) presence.socketIds.add(String(socketId));
  presence.onlineAt = presence.onlineAt || now;
  presence.lastSeenAt = now;
  presence.updatedAt = now;

  return { ok: true, source: 'memory' };
};

export const markUserOffline = async (userId, socketId) => {
  const normalizedUserId = String(userId || '');
  const normalizedSocketId = String(socketId || '');
  if (!normalizedUserId || !normalizedSocketId) {
    return { ok: false, changed: false, isOnline: false, source: 'invalid' };
  }

  const now = new Date().toISOString();

  try {
    if (await isRedisReady()) {
      const presenceKey = getPresenceUserKey(normalizedUserId);
      const socketSetKey = `${presenceKey}:sockets`;

      await redis.srem(socketSetKey, normalizedSocketId);
      const remainingSockets = await redis.scard(socketSetKey);

      if (remainingSockets > 0) {
        await redis
          .multi()
          .hset(presenceKey, 'lastSeenAt', now, 'updatedAt', now)
          .expire(presenceKey, PRESENCE_TTL_SECONDS)
          .expire(socketSetKey, PRESENCE_TTL_SECONDS)
          .exec();

        return { ok: true, changed: false, isOnline: true, source: 'redis' };
      }

      await redis
        .multi()
        .srem(PRESENCE_ONLINE_USERS_KEY, normalizedUserId)
        .del(socketSetKey)
        .del(presenceKey)
        .exec();

      return {
        ok: true,
        changed: true,
        isOnline: false,
        source: 'redis',
        presence: {
          userId: normalizedUserId,
          isOnline: false,
          onlineAt: null,
          lastSeenAt: now,
          updatedAt: now,
          source: 'redis'
        }
      };
    }
  } catch (error) {
    console.warn('[Presence] Redis mark offline failed, using fallback:', error?.message || error);
  }

  const presence = fallbackPresenceByUserId.get(normalizedUserId);
  if (!presence) {
    return { ok: true, changed: false, isOnline: false, source: 'memory' };
  }

  presence.socketIds.delete(normalizedSocketId);
  presence.lastSeenAt = now;
  presence.updatedAt = now;

  if (presence.socketIds.size > 0) {
    return { ok: true, changed: false, isOnline: true, source: 'memory' };
  }

  fallbackPresenceByUserId.delete(normalizedUserId);
  return {
    ok: true,
    changed: true,
    isOnline: false,
    source: 'memory',
    presence: {
      userId: normalizedUserId,
      isOnline: false,
      onlineAt: null,
      lastSeenAt: now,
      updatedAt: now,
      source: 'memory'
    }
  };
};

export const getOnlineUserIds = async () => {
  try {
    if (await isRedisReady()) {
      const userIds = await redis.smembers(PRESENCE_ONLINE_USERS_KEY);
      if (!userIds.length) return { source: 'redis', userIds: [] };

      const pipeline = redis.pipeline();
      userIds.forEach((userId) => pipeline.exists(getPresenceUserKey(userId)));
      const results = await pipeline.exec();
      const activeUserIds = userIds.filter((userId, index) => results?.[index]?.[1] === 1);
      const staleUserIds = userIds.filter((userId, index) => results?.[index]?.[1] !== 1);

      if (staleUserIds.length) {
        await redis.srem(PRESENCE_ONLINE_USERS_KEY, ...staleUserIds);
      }

      return { source: 'redis', userIds: activeUserIds };
    }
  } catch (error) {
    console.warn('[Presence] Redis get online users failed, using fallback:', error?.message || error);
  }

  return { source: 'memory', userIds: Array.from(fallbackPresenceByUserId.keys()) };
};

export const getPresenceByUserIds = async (userIds) => {
  const normalizedUserIds = Array.from(new Set((userIds || []).map((id) => String(id)).filter(Boolean)));

  try {
    if (await isRedisReady()) {
      if (!normalizedUserIds.length) return { source: 'redis', presenceByUserId: new Map() };

      const pipeline = redis.pipeline();
      normalizedUserIds.forEach((userId) => pipeline.hgetall(getPresenceUserKey(userId)));
      const results = await pipeline.exec();
      const presenceByUserId = new Map();

      results.forEach((result, index) => {
        const parsed = parseRedisPresence(result?.[1]);
        if (parsed) {
          presenceByUserId.set(normalizedUserIds[index], parsed);
        }
      });

      return { source: 'redis', presenceByUserId };
    }
  } catch (error) {
    console.warn('[Presence] Redis get presence failed, using fallback:', error?.message || error);
  }

  const presenceByUserId = new Map();
  normalizedUserIds.forEach((userId) => {
    const presence = fallbackPresenceByUserId.get(userId);
    if (!presence) return;

    presenceByUserId.set(userId, {
      userId,
      isOnline: true,
      onlineAt: presence.onlineAt,
      lastSeenAt: presence.lastSeenAt,
      updatedAt: presence.updatedAt,
      source: 'memory'
    });
  });

  return { source: 'memory', presenceByUserId };
};

export const clearLocalPresence = () => {
  fallbackPresenceByUserId.clear();
};
