import redis, { ensureRedisConnected, redisHealthy } from '../config/redisConfig.js';
import UserUsageSummary from '../models/userUsageSummary.schema.js';
import UserUsageDaily from '../models/userUsageDaily.schema.js';
import UserUsageRuntimeState from '../models/userUsageRuntimeState.schema.js';

const USAGE_ACTIVE_USERS_KEY = 'usage:active:userIds';
const USAGE_DIRTY_USERS_KEY = 'usage:dirty:userIds';
const USAGE_ACTIVE_LAST_PING_ZSET_KEY = 'usage:active:lastPing';
const USAGE_USER_KEY_PREFIX = 'usage:user:';

const MAX_HEARTBEAT_DELTA_SECONDS = Number.parseInt(process.env.USAGE_MAX_HEARTBEAT_DELTA_SECONDS, 10) || 30;
const SESSION_TIMEOUT_SECONDS = Number.parseInt(process.env.USAGE_SESSION_TIMEOUT_SECONDS, 10) || 90;
const STATE_TTL_SECONDS = Number.parseInt(process.env.USAGE_STATE_TTL_SECONDS, 10) || (2 * 24 * 60 * 60);
const FLUSH_BATCH_SIZE = Number.parseInt(process.env.USAGE_FLUSH_BATCH_SIZE, 10) || 500;
const DAILY_TIMEZONE = process.env.USAGE_DAILY_TIMEZONE || 'UTC';

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

const getDateKey = (date) => getDailyFormatter().format(date);

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

const writeUsageIncrementDirect = async (userId, deltaSeconds, nowMs = Date.now()) => {
  const usageSeconds = getSecondsNumber(deltaSeconds);
  if (usageSeconds <= 0) {
    return { processedUsers: 0, flushedSeconds: 0 };
  }

  return writeUsageRows([
    {
      userId,
      pendingSeconds: usageSeconds,
      lastPingAtMs: nowMs
    }
  ]);
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

const touchUsageStateDegradedDb = async (userId, nowMs = Date.now()) => {
  const now = new Date(nowMs);
  const previousState = await UserUsageRuntimeState.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        createdAt: now,
        sessionStartedAt: now
      },
      $set: {
        isOnline: true,
        lastPingAt: now,
        updatedAt: now,
        endedAt: null,
        endReason: null
      }
    },
    {
      upsert: true,
      new: false,
      lean: true
    }
  );

  const lastPingAtMs = previousState?.lastPingAt
    ? new Date(previousState.lastPingAt).getTime()
    : null;
  const deltaSeconds = getDeltaSeconds(lastPingAtMs, nowMs);
  if (deltaSeconds > 0) {
    await writeUsageIncrementDirect(userId, deltaSeconds, nowMs);
  }

  return {
    source: 'degraded-db',
    deltaSeconds,
    pendingSeconds: 0
  };
};

const closeUsageStateDegradedDb = async (userId, nowMs = Date.now(), reason = 'disconnect') => {
  const now = new Date(nowMs);
  const previousState = await UserUsageRuntimeState.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        createdAt: now,
        sessionStartedAt: now
      },
      $set: {
        isOnline: false,
        lastPingAt: now,
        updatedAt: now,
        endedAt: now,
        endReason: String(reason || 'disconnect')
      }
    },
    {
      upsert: true,
      new: false,
      lean: true
    }
  );

  const lastPingAtMs = previousState?.lastPingAt
    ? new Date(previousState.lastPingAt).getTime()
    : null;
  const deltaSeconds = getDeltaSeconds(lastPingAtMs, nowMs);
  if (deltaSeconds > 0) {
    await writeUsageIncrementDirect(userId, deltaSeconds, nowMs);
  }

  return {
    source: 'degraded-db',
    deltaSeconds,
    pendingSeconds: 0
  };
};

const closeTimedOutUsageSessionsDegradedDb = async (batchSize, staleBeforeMs, nowMs) => {
  const staleBeforeDate = new Date(staleBeforeMs);
  const staleRows = await UserUsageRuntimeState.find({
    isOnline: true,
    lastPingAt: { $lt: staleBeforeDate }
  })
    .select('userId')
    .sort({ lastPingAt: 1 })
    .limit(batchSize)
    .lean();

  if (!staleRows.length) {
    return { ok: true, source: 'degraded-db', closedUsers: 0 };
  }

  let closedUsers = 0;
  for (const row of staleRows) {
    if (!row?.userId) continue;
    await closeUsageStateDegradedDb(String(row.userId), nowMs, 'timeout');
    closedUsers += 1;
  }

  return { ok: true, source: 'degraded-db', closedUsers };
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
    console.warn('[Usage] Failed to get live snapshot from Redis, fallback to degraded-db:', error?.message || error);
  }

  const state = await UserUsageRuntimeState.findOne({ userId: normalizedUserId })
    .select('isOnline lastPingAt sessionStartedAt')
    .lean();

  return {
    source: 'degraded-db',
    pendingSeconds: 0,
    lastPingAtMs: state?.lastPingAt ? new Date(state.lastPingAt).getTime() : null,
    sessionStartedAtMs: state?.sessionStartedAt ? new Date(state.sessionStartedAt).getTime() : null,
    isOnline: state?.isOnline === true
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
    console.warn('[Usage] Redis touch failed, fallback to degraded-db:', error?.message || error);
  }

  const degradedResult = await touchUsageStateDegradedDb(normalizedUserId);
  return { ok: true, ...degradedResult };
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
    console.warn('[Usage] Redis close session failed, fallback to degraded-db:', error?.message || error);
  }

  const degradedResult = await closeUsageStateDegradedDb(normalizedUserId, Date.now(), reason);
  return { ok: true, ...degradedResult };
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
    console.warn('[Usage] Redis timeout close failed, fallback to degraded-db:', error?.message || error);
  }

  return closeTimedOutUsageSessionsDegradedDb(safeBatchSize, staleBeforeMs, nowMs);
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
    console.warn('[Usage] Redis flush failed, fallback to degraded-db:', error?.message || error);
  }

  return { ok: true, source: 'degraded-db', processedUsers: 0, flushedSeconds: 0 };
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

