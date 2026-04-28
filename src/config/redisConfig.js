import 'dotenv/config';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://redis-hung.internal:6379';

let redisHealthy = false;
let redisErrorLogged = false;

const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  connectTimeout: 2000,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy() {
    return null;
  },
});

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
export { REDIS_URL, redisHealthy };