import redis, { ensureRedisConnected, redisHealthy } from '../config/redisConfig.js';
import UserUsageSummary from '../models/userUsageSummary.schema.js';
import UserUsageDaily from '../models/userUsageDaily.schema.js';

const USAGE_ACTIVE_USERS_KEY = 'usage:active:userIds';
const USAGE_DIRTY_USERS_KEY = 'usage:dirty:userIds';
const USAGE_ACTIVE_LAST_PING_ZSET_KEY = 'usage:active:lastPing';
const USAGE_USER_KEY_PREFIX = 'usage:user:';

const MAX_HEARTBEAT_DELTA_SECONDS = Number.parseInt(process.env.USAGE_MAX_HEARTBEAT_DELTA_SECONDS, 10) || 30;
const SESSION_TIMEOUT_SECONDS = Number.parseInt(process.env.USAGE_SESSION_TIMEOUT_SECONDS, 10) || 90;
const STATE_TTL_SECONDS = Number.parseInt(process.env.USAGE_STATE_TTL_SECONDS, 10) || (2 * 24 * 60 * 60);
const FLUSH_BATCH_SIZE = Number.parseInt(process.env.USAGE_FLUSH_BATCH_SIZE, 10) || 500;
const DAILY_TIMEZONE = process.env.USAGE_DAILY_TIMEZONE || 'UTC';

const fallbackStateByUserId = new Map();
const fallbackDirtyUserIds = new Set();

const DRAIN_PENDING_SECONDS_LUA = `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if not current then
  return '0'
end
redis.call('HSET', KEYS[1], ARGV[1], '0')
return current
`;

let dailyFormatter = null;

const isRedisReady = async () => {
  const connected = await ensureRedisConnected();
  return connected && redisHealthy === true && redis.status === 'ready';
};

const getUsageUserKey = (userId) => `${USAGE_USER_KEY_PREFIX}${String(userId)}`;

const getSecondsNumber = (value) => {
  const parsed = Number.parseFloat(String(value ?? '0'));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Number(parsed.toFixed(3));
};

const getTimestampMs = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const getDeltaSeconds = (lastPingAtMs, nowMs = Date.now()) => {
  if (!Number.isFinite(lastPingAtMs) || lastPingAtMs <= 0) return 0;
  const rawDelta = (nowMs - lastPingAtMs) / 1000;
  if (!Number.isFinite(rawDelta) || rawDelta <= 0) return 0;
  return Number(Math.min(rawDelta, MAX_HEARTBEAT_DELTA_SECONDS).toFixed(3));
};

const getDailyFormatter = () => {
  if (!dailyFormatter) {
    dailyFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: DAILY_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }
  return dailyFormatter;
};

const getDateKey = (date) => {
  return getDailyFormatter().format(date);
};

const getFallbackState = (userId) => {
  const normalizedUserId = String(userId);
  if (!fallbackStateByUserId.has(normalizedUserId)) {
    fallbackStateByUserId.set(normalizedUserId, {
      sessionStartedAtMs: null,
      lastPingAtMs: null,
      pendingSeconds: 0,
      isOnline: false,
      endedAtMs: null
    });
  }
  return fallbackStateByUserId.get(normalizedUserId);
};

const touchUsageStateRedis = async (userId, nowMs = Date.now()) => {
  const normalizedUserId = String(userId);
  const usageKey = getUsageUserKey(normalizedUserId);
  const [sessionStartedAtRaw, lastPingAtRaw, pendingSecondsRaw] = await redis.hmget(
    usageKey,
    'sessionStartedAtMs',
    'lastPingAtMs',
    'pendingSeconds'
  );

  const lastPingAtMs = getTimestampMs(lastPingAtRaw);
  const currentPendingSeconds = getSecondsNumber(pendingSecondsRaw);
  const sessionStartedAtMs = getTimestampMs(sessionStartedAtRaw) || nowMs;
  const deltaSeconds = getDeltaSeconds(lastPingAtMs, nowMs);
  const nextPendingSeconds = Number((currentPendingSeconds + deltaSeconds).toFixed(3));

  const multi = redis
    .multi()
    .sadd(USAGE_ACTIVE_USERS_KEY, normalizedUserId)
    .zadd(USAGE_ACTIVE_LAST_PING_ZSET_KEY, String(nowMs), normalizedUserId)
    .hset(
      usageKey,
      'sessionStartedAtMs', String(sessionStartedAtMs),
      'lastPingAtMs', String(nowMs),
      'updatedAtMs', String(nowMs),
      'isOnline', '1',
      'pendingSeconds', String(nextPendingSeconds)
    )
    .expire(usageKey, STATE_TTL_SECONDS);

  if (deltaSeconds > 0) {
    multi.sadd(USAGE_DIRTY_USERS_KEY, normalizedUserId);
  }

  await multi.exec();

  return {
    source: 'redis',
    deltaSeconds,
    pendingSeconds: nextPendingSeconds
  };
};

const touchUsageStateFallback = (userId, nowMs = Date.now()) => {
  const normalizedUserId = String(userId);
  const state = getFallbackState(normalizedUserId);
  const deltaSeconds = getDeltaSeconds(state.lastPingAtMs, nowMs);
  state.pendingSeconds = Number((state.pendingSeconds + deltaSeconds).toFixed(3));
  state.lastPingAtMs = nowMs;
  state.sessionStartedAtMs = state.sessionStartedAtMs || nowMs;
  state.isOnline = true;
  state.endedAtMs = null;

  if (deltaSeconds > 0) {
    fallbackDirtyUserIds.add(normalizedUserId);
  }

  return {
    source: 'memory',
    deltaSeconds,
    pendingSeconds: state.pendingSeconds
  };
};

const closeUsageStateRedis = async (userId, nowMs = Date.now(), reason = 'disconnect') => {
  const normalizedUserId = String(userId);
  const usageKey = getUsageUserKey(normalizedUserId);

  const [lastPingAtRaw, pendingSecondsRaw] = await redis.hmget(
    usageKey,
    'lastPingAtMs',
    'pendingSeconds'
  );

  const lastPingAtMs = getTimestampMs(lastPingAtRaw);
  const currentPendingSeconds = getSecondsNumber(pendingSecondsRaw);
  const deltaSeconds = getDeltaSeconds(lastPingAtMs, nowMs);
  const nextPendingSeconds = Number((currentPendingSeconds + deltaSeconds).toFixed(3));

  const multi = redis
    .multi()
    .srem(USAGE_ACTIVE_USERS_KEY, normalizedUserId)
    .zrem(USAGE_ACTIVE_LAST_PING_ZSET_KEY, normalizedUserId)
    .hset(
      usageKey,
      'lastPingAtMs', String(nowMs),
      'updatedAtMs', String(nowMs),
      'isOnline', '0',
      'endedAtMs', String(nowMs),
      'endReason', String(reason || 'disconnect'),
      'pendingSeconds', String(nextPendingSeconds)
    )
    .expire(usageKey, STATE_TTL_SECONDS);

  if (nextPendingSeconds > 0) {
    multi.sadd(USAGE_DIRTY_USERS_KEY, normalizedUserId);
  }

  await multi.exec();

  return {
    source: 'redis',
    deltaSeconds,
    pendingSeconds: nextPendingSeconds
  };
};

const closeUsageStateFallback = (userId, nowMs = Date.now(), reason = 'disconnect') => {
  const normalizedUserId = String(userId);
  const state = getFallbackState(normalizedUserId);
  const deltaSeconds = getDeltaSeconds(state.lastPingAtMs, nowMs);
  state.pendingSeconds = Number((state.pendingSeconds + deltaSeconds).toFixed(3));
  state.lastPingAtMs = nowMs;
  state.isOnline = false;
  state.endedAtMs = nowMs;
  state.endReason = String(reason || 'disconnect');

  if (state.pendingSeconds > 0) {
    fallbackDirtyUserIds.add(normalizedUserId);
  }

  return {
    source: 'memory',
    deltaSeconds,
    pendingSeconds: state.pendingSeconds
  };
};

const drainPendingUsageSecondsRedis = async (userId) => {
  const usageKey = getUsageUserKey(userId);
  const drainedRaw = await redis.eval(
    DRAIN_PENDING_SECONDS_LUA,
    1,
    usageKey,
    'pendingSeconds'
  );
  return getSecondsNumber(drainedRaw);
};

const writeUsageRows = async (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { processedUsers: 0, flushedSeconds: 0 };
  }

  const summaryOps = [];
  const dailyOps = [];
  let flushedSeconds = 0;

  for (const row of rows) {
    const usageSeconds = getSecondsNumber(row.pendingSeconds);
    if (usageSeconds <= 0) continue;

    const lastActiveAt = Number.isFinite(row.lastPingAtMs) && row.lastPingAtMs > 0
      ? new Date(row.lastPingAtMs)
      : new Date();

    const dateKey = getDateKey(lastActiveAt);
    flushedSeconds += usageSeconds;

    summaryOps.push({
      updateOne: {
        filter: { userId: row.userId },
        update: {
          $inc: { totalUsageSeconds: usageSeconds },
          $set: {
            lastActiveAt,
            updatedAt: new Date()
          }
        },
        upsert: true
      }
    });

    dailyOps.push({
      updateOne: {
        filter: { userId: row.userId, dateKey },
        update: {
          $inc: { usageSeconds },
          $set: { updatedAt: new Date() }
        },
        upsert: true
      }
    });
  }

  if (summaryOps.length > 0) {
    await UserUsageSummary.bulkWrite(summaryOps, { ordered: false });
  }

  if (dailyOps.length > 0) {
    await UserUsageDaily.bulkWrite(dailyOps, { ordered: false });
  }

  return {
    processedUsers: summaryOps.length,
    flushedSeconds: Number(flushedSeconds.toFixed(3))
  };
};

const restoreDrainedRowsToRedis = async (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const multi = redis.multi();
  for (const row of rows) {
    const usageSeconds = getSecondsNumber(row.pendingSeconds);
    if (usageSeconds <= 0) continue;
    multi.hincrbyfloat(getUsageUserKey(row.userId), 'pendingSeconds', usageSeconds);
    multi.sadd(USAGE_DIRTY_USERS_KEY, row.userId);
  }
  await multi.exec();
};

const getLiveUsageSnapshot = async (userId) => {
  const normalizedUserId = String(userId);

  try {
    if (await isRedisReady()) {
      const usageKey = getUsageUserKey(normalizedUserId);
      const [pendingRaw, lastPingRaw, startedRaw, isOnlineRaw] = await redis.hmget(
        usageKey,
        'pendingSeconds',
        'lastPingAtMs',
        'sessionStartedAtMs',
        'isOnline'
      );

      return {
        source: 'redis',
        pendingSeconds: getSecondsNumber(pendingRaw),
        lastPingAtMs: getTimestampMs(lastPingRaw),
        sessionStartedAtMs: getTimestampMs(startedRaw),
        isOnline: isOnlineRaw === '1'
      };
    }
  } catch (error) {
    console.warn('[Usage] Failed to get live snapshot from Redis, fallback to memory:', error?.message || error);
  }

  const fallbackState = fallbackStateByUserId.get(normalizedUserId);
  return {
    source: 'memory',
    pendingSeconds: getSecondsNumber(fallbackState?.pendingSeconds || 0),
    lastPingAtMs: fallbackState?.lastPingAtMs || null,
    sessionStartedAtMs: fallbackState?.sessionStartedAtMs || null,
    isOnline: fallbackState?.isOnline === true
  };
};

export const recordUsageActivity = async (userId) => {
  const normalizedUserId = String(userId || '');
  if (!normalizedUserId) {
    return { ok: false, source: 'invalid' };
  }

  try {
    if (await isRedisReady()) {
      const result = await touchUsageStateRedis(normalizedUserId);
      return { ok: true, ...result };
    }
  } catch (error) {
    console.warn('[Usage] Redis touch failed, fallback to memory:', error?.message || error);
  }

  const fallbackResult = touchUsageStateFallback(normalizedUserId);
  return { ok: true, ...fallbackResult };
};

export const closeUsageSession = async (userId, reason = 'disconnect') => {
  const normalizedUserId = String(userId || '');
  if (!normalizedUserId) {
    return { ok: false, source: 'invalid' };
  }

  try {
    if (await isRedisReady()) {
      const result = await closeUsageStateRedis(normalizedUserId, Date.now(), reason);
      return { ok: true, ...result };
    }
  } catch (error) {
    console.warn('[Usage] Redis close session failed, fallback to memory:', error?.message || error);
  }

  const fallbackResult = closeUsageStateFallback(normalizedUserId, Date.now(), reason);
  return { ok: true, ...fallbackResult };
};

export const closeTimedOutUsageSessions = async ({ batchSize = FLUSH_BATCH_SIZE } = {}) => {
  const safeBatchSize = Math.max(1, Number.parseInt(batchSize, 10) || FLUSH_BATCH_SIZE);
  const nowMs = Date.now();
  const staleBeforeMs = nowMs - (SESSION_TIMEOUT_SECONDS * 1000);

  try {
    if (await isRedisReady()) {
      const staleUserIds = await redis.zrangebyscore(
        USAGE_ACTIVE_LAST_PING_ZSET_KEY,
        0,
        staleBeforeMs,
        'LIMIT',
        0,
        safeBatchSize
      );

      if (!staleUserIds.length) {
        return { ok: true, source: 'redis', closedUsers: 0 };
      }

      let closedUsers = 0;
      for (const userId of staleUserIds) {
        const currentLastPingAtRaw = await redis.hget(getUsageUserKey(userId), 'lastPingAtMs');
        const currentLastPingAtMs = getTimestampMs(currentLastPingAtRaw);
        if (Number.isFinite(currentLastPingAtMs) && currentLastPingAtMs > staleBeforeMs) {
          continue;
        }
        await closeUsageStateRedis(userId, nowMs, 'timeout');
        closedUsers += 1;
      }

      return { ok: true, source: 'redis', closedUsers };
    }
  } catch (error) {
    console.warn('[Usage] Redis timeout close failed, fallback to memory:', error?.message || error);
  }

  let closedUsers = 0;
  for (const [userId, state] of fallbackStateByUserId.entries()) {
    if (closedUsers >= safeBatchSize) break;
    if (!state.isOnline || !Number.isFinite(state.lastPingAtMs)) continue;
    if (state.lastPingAtMs > staleBeforeMs) continue;
    closeUsageStateFallback(userId, nowMs, 'timeout');
    closedUsers += 1;
  }

  return { ok: true, source: 'memory', closedUsers };
};

export const flushUsageToDatabase = async ({ batchSize = FLUSH_BATCH_SIZE } = {}) => {
  const safeBatchSize = Math.max(1, Number.parseInt(batchSize, 10) || FLUSH_BATCH_SIZE);

  try {
    if (await isRedisReady()) {
      const rawIds = await redis.spop(USAGE_DIRTY_USERS_KEY, safeBatchSize);
      const userIds = Array.isArray(rawIds)
        ? rawIds
        : (rawIds ? [rawIds] : []);

      if (!userIds.length) {
        return { ok: true, source: 'redis', processedUsers: 0, flushedSeconds: 0 };
      }

      const drainedRows = [];
      for (const userId of userIds) {
        const pendingSeconds = await drainPendingUsageSecondsRedis(userId);
        if (pendingSeconds <= 0) continue;

        const lastPingAtRaw = await redis.hget(getUsageUserKey(userId), 'lastPingAtMs');
        const lastPingAtMs = getTimestampMs(lastPingAtRaw);
        drainedRows.push({ userId, pendingSeconds, lastPingAtMs });
      }

      if (!drainedRows.length) {
        return { ok: true, source: 'redis', processedUsers: 0, flushedSeconds: 0 };
      }

      try {
        const writeResult = await writeUsageRows(drainedRows);
        return { ok: true, source: 'redis', ...writeResult };
      } catch (error) {
        await restoreDrainedRowsToRedis(drainedRows);
        console.error('[Usage] Failed to flush usage to DB:', error);
        return { ok: false, source: 'redis', processedUsers: 0, flushedSeconds: 0, error: error?.message || String(error) };
      }
    }
  } catch (error) {
    console.warn('[Usage] Redis flush failed, fallback to memory:', error?.message || error);
  }

  const userIds = Array.from(fallbackDirtyUserIds).slice(0, safeBatchSize);
  if (!userIds.length) {
    return { ok: true, source: 'memory', processedUsers: 0, flushedSeconds: 0 };
  }

  const rows = [];
  for (const userId of userIds) {
    const state = fallbackStateByUserId.get(userId);
    if (!state) continue;
    const pendingSeconds = getSecondsNumber(state.pendingSeconds);
    if (pendingSeconds <= 0) {
      fallbackDirtyUserIds.delete(userId);
      continue;
    }
    rows.push({
      userId,
      pendingSeconds,
      lastPingAtMs: state.lastPingAtMs
    });
  }

  if (!rows.length) {
    return { ok: true, source: 'memory', processedUsers: 0, flushedSeconds: 0 };
  }

  const writeResult = await writeUsageRows(rows);
  for (const row of rows) {
    const state = fallbackStateByUserId.get(row.userId);
    if (!state) continue;
    state.pendingSeconds = Math.max(0, Number((state.pendingSeconds - row.pendingSeconds).toFixed(3)));
    if (state.pendingSeconds <= 0) {
      fallbackDirtyUserIds.delete(row.userId);
    }
  }

  return { ok: true, source: 'memory', ...writeResult };
};

export const getUsageSummaryForUser = async (userId, { days = 7 } = {}) => {
  const normalizedUserId = String(userId || '');
  if (!normalizedUserId) {
    return {
      userId: null,
      totalUsageSeconds: 0,
      todayUsageSeconds: 0,
      recentDays: [],
      live: {
        isOnline: false,
        pendingSeconds: 0,
        currentSessionSeconds: 0
      }
    };
  }

  const safeDays = Math.max(1, Math.min(31, Number.parseInt(days, 10) || 7));
  const now = new Date();
  const dateKeys = [];
  for (let i = safeDays - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    dateKeys.push(getDateKey(date));
  }

  const [summaryDoc, dailyDocs, liveSnapshot] = await Promise.all([
    UserUsageSummary.findOne({ userId: normalizedUserId }).select('totalUsageSeconds lastActiveAt').lean(),
    UserUsageDaily.find({ userId: normalizedUserId, dateKey: { $in: dateKeys } })
      .select('dateKey usageSeconds')
      .lean(),
    getLiveUsageSnapshot(normalizedUserId)
  ]);

  const byDate = new Map();
  for (const row of dailyDocs) {
    byDate.set(row.dateKey, getSecondsNumber(row.usageSeconds));
  }

  const livePendingSeconds = getSecondsNumber(liveSnapshot.pendingSeconds);
  const todayKey = getDateKey(now);
  byDate.set(todayKey, getSecondsNumber((byDate.get(todayKey) || 0) + livePendingSeconds));

  const recentDays = dateKeys.map((dateKey) => ({
    dateKey,
    usageSeconds: getSecondsNumber(byDate.get(dateKey) || 0)
  }));

  const totalUsageSeconds = getSecondsNumber((summaryDoc?.totalUsageSeconds || 0) + livePendingSeconds);
  const todayUsageSeconds = getSecondsNumber(byDate.get(todayKey) || 0);
  const currentSessionSeconds = liveSnapshot.isOnline && Number.isFinite(liveSnapshot.sessionStartedAtMs)
    ? Math.max(0, Math.floor((Date.now() - liveSnapshot.sessionStartedAtMs) / 1000))
    : 0;

  return {
    userId: normalizedUserId,
    totalUsageSeconds,
    todayUsageSeconds,
    recentDays,
    live: {
      source: liveSnapshot.source,
      isOnline: liveSnapshot.isOnline,
      pendingSeconds: livePendingSeconds,
      currentSessionSeconds,
      lastPingAt: Number.isFinite(liveSnapshot.lastPingAtMs) ? new Date(liveSnapshot.lastPingAtMs) : null
    }
  };
};
