import redis, { ensureRedisConnected, redisHealthy } from '../config/redisConfig.js';

const SESSION_KEY_PREFIX = 'session:user:';

const getSessionKey = (userId) => `${SESSION_KEY_PREFIX}${userId}`;

const getRefreshTokenTtlSeconds = () => {
  const refreshTokenExpiryDays = Number.parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS, 10) || 7;
  return refreshTokenExpiryDays * 24 * 60 * 60;
};

const isRedisUsable = () => {
  return redisHealthy === true && redis.status === 'ready';
};

const setCurrentSessionId = async (userId, refreshTokenId, ttlSeconds = getRefreshTokenTtlSeconds()) => {
  try {
    const connected = await ensureRedisConnected();
    if (!connected || !isRedisUsable()) {
      return { ok: false, skipped: true, reason: 'redis-unavailable' };
    }

    if (!isRedisUsable()) {
      return { ok: false, skipped: true, reason: 'redis-unavailable' };
    }

    await redis.set(getSessionKey(userId), String(refreshTokenId), 'EX', ttlSeconds);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
};

const getCurrentSessionId = async (userId) => {
  try {
    const connected = await ensureRedisConnected();
    if (!connected || !isRedisUsable()) {
      return { ok: false, skipped: true, reason: 'redis-unavailable' };
    }

    if (!isRedisUsable()) {
      return { ok: false, skipped: true, reason: 'redis-unavailable' };
    }

    const value = await redis.get(getSessionKey(userId));
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error };
  }
};

const deleteUserSessionKey = async (userId) => {
  try {
    const connected = await ensureRedisConnected();
    if (!connected || !isRedisUsable()) {
      return { ok: false, skipped: true, reason: 'redis-unavailable' };
    }

    if (!isRedisUsable()) {
      return { ok: false, skipped: true, reason: 'redis-unavailable' };
    }

    await redis.del(getSessionKey(userId));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
};

export {
  getCurrentSessionId,
  getRefreshTokenTtlSeconds,
  deleteUserSessionKey,
  setCurrentSessionId
};