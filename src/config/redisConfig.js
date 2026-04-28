import 'dotenv/config';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://redis-hung.internal:6379';

let redisHealthy = false;
let redisErrorLogged = false;
let redisConnectPromise = null;
let lastConnectionAttemptAt = 0;
const REDIS_RETRY_COOLDOWN_MS = 30000;

const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  connectTimeout: 2000,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy() {
    return null;
  },
});

const ensureRedisConnected = async () => {
  if (redisHealthy && redis.status === 'ready') {
    return true;
  }

  const now = Date.now();
  if (redisConnectPromise) {
    try {
      await redisConnectPromise;
    } catch (error) {
      return false;
    }
    return redisHealthy && redis.status === 'ready';
  }

  if (now - lastConnectionAttemptAt < REDIS_RETRY_COOLDOWN_MS) {
    return false;
  }

  lastConnectionAttemptAt = now;
  redisConnectPromise = redis.connect()
    .then(() => true)
    .catch((error) => {
      if (!redisErrorLogged) {
        redisErrorLogged = true;
        console.warn('[Redis] Initial connect failed:', error?.message || error);
      }
      redisHealthy = false;
      return false;
    })
    .finally(() => {
      redisConnectPromise = null;
    });

  return redisConnectPromise;
};

redis.on('error', (error) => {
  if (!redisErrorLogged) {
    redisErrorLogged = true;
    console.warn('[Redis] Connection error:', error?.message || error);
  }
  redisHealthy = false;
});

redis.on('ready', () => {
  redisHealthy = true;
  redisErrorLogged = false;
});

redis.on('end', () => {
  redisHealthy = false;
});

export default redis;
export { REDIS_URL, ensureRedisConnected, redisHealthy };