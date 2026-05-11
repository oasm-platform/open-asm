import { RedisService } from '@/services/redis/redis.service';
import { Injectable, Logger } from '@nestjs/common';

export interface STMEntry {
  key: string;
  value: string;
  updatedAt: string;
}

@Injectable()
export class AgentsMemoriesService {
  private readonly logger = new Logger(AgentsMemoriesService.name);
  private static readonly STM_PREFIX = 'agents:stm';
  private static readonly STM_TTL_SECONDS = 24 * 60 * 60; // 24 hours

  constructor(private readonly redisService: RedisService) {}

  private stmKey(conversationId: string): string {
    return `${AgentsMemoriesService.STM_PREFIX}:${conversationId}`;
  }

  /**
   * Stores a key-value pair in STM for the given conversation.
   * Refreshes the 24-hour TTL on every write.
   */
  async set(conversationId: string, key: string, value: string): Promise<void> {
    const redisKey = this.stmKey(conversationId);
    const entry: STMEntry = { key, value, updatedAt: new Date().toISOString() };
    try {
      await this.redisService.cacheClient.hset(
        redisKey,
        key,
        JSON.stringify(entry),
      );
      await this.redisService.cacheClient.expire(
        redisKey,
        AgentsMemoriesService.STM_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(
        `STM set failed [conv=${conversationId}, key=${key}]: ${error}`,
      );
    }
  }

  /**
   * Retrieves a single STM entry by key.
   * Returns null if not found or on error.
   */
  async get(conversationId: string, key: string): Promise<STMEntry | null> {
    const redisKey = this.stmKey(conversationId);
    try {
      const raw = await this.redisService.cacheClient.hget(redisKey, key);
      if (!raw) return null;
      return JSON.parse(raw) as STMEntry;
    } catch (error) {
      this.logger.warn(
        `STM get failed [conv=${conversationId}, key=${key}]: ${error}`,
      );
      return null;
    }
  }

  /**
   * Deletes a single STM entry by key.
   */
  async delete(conversationId: string, key: string): Promise<void> {
    const redisKey = this.stmKey(conversationId);
    try {
      await this.redisService.cacheClient.hdel(redisKey, key);
    } catch (error) {
      this.logger.warn(
        `STM delete failed [conv=${conversationId}, key=${key}]: ${error}`,
      );
    }
  }

  /**
   * Returns all STM entries for a conversation.
   */
  async getAll(conversationId: string): Promise<STMEntry[]> {
    const redisKey = this.stmKey(conversationId);
    try {
      const raw = await this.redisService.cacheClient.hgetall(redisKey);
      if (!raw) return [];
      return Object.values(raw).map((v) => JSON.parse(v) as STMEntry);
    } catch (error) {
      this.logger.warn(
        `STM getAll failed [conv=${conversationId}]: ${error}`,
      );
      return [];
    }
  }

  /**
   * Clears all STM entries for a conversation.
   */
  async clear(conversationId: string): Promise<void> {
    const redisKey = this.stmKey(conversationId);
    try {
      await this.redisService.cacheClient.del(redisKey);
    } catch (error) {
      this.logger.warn(
        `STM clear failed [conv=${conversationId}]: ${error}`,
      );
    }
  }

  /**
   * Formats all STM entries as a prompt context block.
   * Returns empty string if no entries exist.
   */
  async formatForPrompt(conversationId: string): Promise<string> {
    const entries = await this.getAll(conversationId);
    if (entries.length === 0) return '';
    const lines = entries.map((e) => `- ${e.key}: ${e.value}`).join('\n');
    return `[Short-Term Memory]\n${lines}`;
  }
}
