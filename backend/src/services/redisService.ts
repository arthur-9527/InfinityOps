import { createClient, RedisClientType } from 'redis';
import { createModuleLogger } from '../utils/logger';
import { config } from '../config';

const logger = createModuleLogger('redis');

/**
 * Redis Service Implementation
 * 
 * Provides Redis connection and operations for the application.
 * Uses db=0 and password 123578964 as specified.
 */
export class RedisService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    // Create Redis client
    this.client = createClient({
      url: `redis://:123578964@${config.redis?.host || 'localhost'}:${config.redis?.port || 6379}/0`,
    });

    // Set up event listeners
    this.client.on('error', (err) => {
      logger.error(`Redis Error: ${err.message}`);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      logger.info('Redis client disconnected');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }

  /**
   * Connect to Redis server
   */
  async connect(): Promise<boolean> {
    if (this.isConnected) {
      return true;
    }

    try {
      await this.client.connect();
      return true;
    } catch (error) {
      logger.error(`Failed to connect to Redis: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Disconnect from Redis server
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.disconnect();
      logger.info('Redis client disconnected successfully');
    } catch (error) {
      logger.error(`Error disconnecting from Redis: ${(error as Error).message}`);
    }
  }

  /**
   * Check if Redis client is connected
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Set a string value
   */
  async set(key: string, value: string, expireSeconds?: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      if (expireSeconds) {
        await this.client.set(key, value, { EX: expireSeconds });
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      logger.error(`Redis SET error: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Get a string value
   */
  async get(key: string): Promise<string | null> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      return await this.client.get(key);
    } catch (error) {
      logger.error(`Redis GET error: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error(`Redis DEL error: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Redis EXISTS error: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Set key with expiration (TTL)
   */
  async setEx(key: string, seconds: number, value: string): Promise<boolean> {
    return this.set(key, value, seconds);
  }

  /**
   * Hash operations - HSET
   */
  async hSet(key: string, field: string, value: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      await this.client.hSet(key, field, value);
      return true;
    } catch (error) {
      logger.error(`Redis HSET error: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Hash operations - HGET
   */
  async hGet(key: string, field: string): Promise<string | null> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      const result = await this.client.hGet(key, field);
      return result ?? null;
    } catch (error) {
      logger.error(`Redis HGET error: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Hash operations - HGETALL
   */
  async hGetAll(key: string): Promise<Record<string, string> | null> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      const result = await this.client.hGetAll(key);
      // Convert Redis response object to Record<string, string>
      return Object.keys(result).length > 0 ? result as Record<string, string> : null;
    } catch (error) {
      logger.error(`Redis HGETALL error: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * List operations - LPUSH
   */
  async lPush(key: string, ...values: string[]): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      await this.client.lPush(key, values);
      return true;
    } catch (error) {
      logger.error(`Redis LPUSH error: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * List operations - RPUSH
   */
  async rPush(key: string, ...values: string[]): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      await this.client.rPush(key, values);
      return true;
    } catch (error) {
      logger.error(`Redis RPUSH error: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * List operations - LRANGE
   */
  async lRange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      return await this.client.lRange(key, start, stop);
    } catch (error) {
      logger.error(`Redis LRANGE error: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * List operations - LLEN
   */
  async lLen(key: string): Promise<number> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      return await this.client.lLen(key);
    } catch (error) {
      logger.error(`Redis LLEN error: ${(error as Error).message}`);
      return 0;
    }
  }

  /**
   * List operations - LINDEX
   */
  async lIndex(key: string, index: number): Promise<string | null> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      return await this.client.lIndex(key, index);
    } catch (error) {
      logger.error(`Redis LINDEX error: ${(error as Error).message}`);
      return null;
    }
  }
}

// Singleton instance
let redisServiceInstance: RedisService | null = null;

/**
 * Get Redis service instance (singleton pattern)
 */
export function getRedisService(): RedisService {
  if (!redisServiceInstance) {
    redisServiceInstance = new RedisService();
  }
  return redisServiceInstance;
}

/**
 * Utility function to create and connect a Redis service instance
 */
export async function createRedisService(): Promise<RedisService> {
  const service = getRedisService();
  await service.connect();
  return service;
}

// Export a singleton instance of RedisService as redisClient
export const redisClient = getRedisService(); 