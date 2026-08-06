import { createClient, RedisClientType } from 'redis';
import { env, isDevelopment } from './environment';
import { logger } from '../utils/logger';

// Redis client singleton
let redis: RedisClientType;

declare global {
  var __redis: RedisClientType | undefined;
}

if (isDevelopment) {
  if (!global.__redis) {
    global.__redis = createClient({
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

// Connect to Redis
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

// Cache operations
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