// ---------------------------------------------------------------------------
// Optional Redis client + a thin JSON cache on top of it.
//
// Redis is NEVER a hard dependency: connectRedis() swallows failures ("caching
// disabled") and every cache method fails soft (returns null / logs). A
// deployment without Redis runs the store at full speed, just without the
// cache layer.
// ---------------------------------------------------------------------------
import { createClient, RedisClientType } from 'redis';
import { env, isDevelopment } from './environment';
import { logger } from '../utils/logger';

// Redis client singleton
let redis: RedisClientType;

declare global {
  var __redis: RedisClientType | undefined;
}

if (isDevelopment) {
  // Same global-instance trick as config/database.ts: tsx watch reloads
  // this module on every change and each reload would otherwise create a
  // new client (new socket, new reconnect loop).
  if (!global.__redis) {
    global.__redis = createClient({
      url: env.REDIS_URL,
      socket: {
        // Back off 100ms, 200ms, ... capped at 3s, and give up after 10
        // tries - at that point we'd rather be "Redis down, caching
        // disabled" than hammer a server that is clearly gone.
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('❌ Redis reconnection failed after 10 attempts');
            return new Error('Redis reconnection failed');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });
  }
  redis = global.__redis;
} else {
  redis = createClient({
    url: env.REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('❌ Redis reconnection failed after 10 attempts');
          return new Error('Redis reconnection failed');
        }
        return Math.min(retries * 100, 3000);
      },
    },
  });
}

// Event handlers
redis.on('connect', () => {
  logger.info('✅ Redis connected successfully');
});

redis.on('error', (err) => {
  logger.error('❌ Redis error:', err);
});

redis.on('reconnecting', () => {
  logger.warn('⚠️ Redis reconnecting...');
});

// Connect to Redis - called at boot WITHOUT await, so a missing Redis
// never delays startup.
export async function connectRedis(): Promise<void> {
  try {
    // Try to connect with a short timeout
    const connectPromise = redis.connect();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Redis connection timeout')), 2000);
    });
    
    await Promise.race([connectPromise, timeoutPromise]);
    logger.info('✅ Redis connection established');
  } catch (error) {
    logger.warn('⚠️ Redis not available - caching disabled');
    // Don't throw - Redis is optional
  }
}

// Disconnect from Redis
export async function disconnectRedis(): Promise<void> {
  try {
    await redis.disconnect();
    logger.info('✅ Redis disconnected successfully');
  } catch (error) {
    logger.error('❌ Redis disconnection failed:', error);
  }
}

// Health check
export async function checkRedisHealth(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    logger.error('❌ Redis health check failed:', error);
    return false;
  }
}

// Cache operations - a JSON-serialising wrapper over the raw client.
// Every method catches its own errors and degrades (null / no-op / []),
// so callers never need their own try/catch around caching.
export const cache = {
  // Get value from cache
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  },

  // Set value in cache
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const stringValue = JSON.stringify(value);
      if (ttl) {
        await redis.setEx(key, ttl, stringValue);
      } else {
        await redis.set(key, stringValue);
      }
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  },

  /**
   * Atomically increment a counter and return the new value.
   *
   * Use this instead of `set(key, (await get(key)) + 1)`. That read-modify-write
   * pattern loses updates whenever two requests interleave between the GET and
   * the SET, which for a web-facing counter is the normal case rather than a
   * rare race: under 100 concurrent events it recorded 1.
   *
   * INCR is executed server-side by Redis, so concurrent callers serialise.
   * Returns null when Redis is unavailable, matching the fail-soft contract of
   * the other methods (callers must not treat null as zero traffic).
   *
   * The TTL is applied only when the key is first created (INCR returns 1),
   * so a rolling window is not extended by every subsequent hit.
   */
  async incr(key: string, ttl?: number): Promise<number | null> {
    try {
      const next = await redis.incr(key);
      if (ttl && next === 1) {
        await redis.expire(key, ttl);
      }
      return next;
    } catch (error) {
      logger.error('Cache incr error:', error);
      return null;
    }
  },

  /**
   * Read a counter written by incr().
   *
   * INCR stores a bare integer, not JSON, so this parses with Number rather
   * than JSON.parse (they agree for integers, but this states the intent).
   * A missing key reads as 0: for a counter, "never incremented" and "zero"
   * are the same thing. Redis being down also yields 0 - the caller is a
   * dashboard, and a blank panel is worse than a zero.
   */
  async getCounter(key: string): Promise<number> {
    try {
      const value = await redis.get(key);
      if (value === null || value === undefined || value === '') return 0;
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    } catch (error) {
      logger.error('Cache getCounter error:', error);
      return 0;
    }
  },

  /**
   * Append to a capped list, atomically.
   *
   * Replaces the get-array / push / set-array pattern, which drops events the
   * same way the counter did. RPUSH+LTRIM run server-side; LTRIM keeps the
   * newest `max` entries.
   */
  async pushCapped(key: string, value: any, max: number, ttl?: number): Promise<void> {
    try {
      const len = await redis.rPush(key, JSON.stringify(value));
      await redis.lTrim(key, -max, -1);
      if (ttl && len === 1) {
        await redis.expire(key, ttl);
      }
    } catch (error) {
      logger.error('Cache pushCapped error:', error);
    }
  },

  /** Read a capped list written by pushCapped. */
  async listRange<T>(key: string, start = 0, stop = -1): Promise<T[]> {
    try {
      const items: string[] = await redis.lRange(key, start, stop);
      return items.map((item: string) => JSON.parse(item) as T);
    } catch (error) {
      logger.error('Cache listRange error:', error);
      return [];
    }
  },

  // Delete value from cache
  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  },

  // Clear all cache
  async clear(): Promise<void> {
    try {
      await redis.flushAll();
    } catch (error) {
      logger.error('Cache clear error:', error);
    }
  },

  // Get cache keys by pattern
  async keys(pattern: string): Promise<string[]> {
    try {
      return await redis.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error:', error);
      return [];
    }
  },
};

// Session store for Express
export const sessionStore = {
  async get(sessionId: string): Promise<any> {
    return await cache.get(`session:${sessionId}`);
  },

  async set(sessionId: string, session: any, ttl: number = 86400): Promise<void> {
    await cache.set(`session:${sessionId}`, session, ttl);
  },

  async destroy(sessionId: string): Promise<void> {
    await cache.del(`session:${sessionId}`);
  },
};

export { redis };
export default redis;