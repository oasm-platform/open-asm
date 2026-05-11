import { RedisService } from '@/services/redis/redis.service';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentWorkspaceMemory } from './entities/agent-workspace-memory.entity';

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

  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(AgentWorkspaceMemory)
    private readonly ltmRepository: Repository<AgentWorkspaceMemory>,
  ) {}

  private stmKey(conversationId: string): string {
    return `${AgentsMemoriesService.STM_PREFIX}:${conversationId}`;
  }

  async stmSet(
    conversationId: string,
    key: string,
    value: string,
  ): Promise<void> {
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

  async stmGet(conversationId: string, key: string): Promise<STMEntry | null> {
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

  async stmDelete(conversationId: string, key: string): Promise<void> {
    const redisKey = this.stmKey(conversationId);
    try {
      await this.redisService.cacheClient.hdel(redisKey, key);
    } catch (error) {
      this.logger.warn(
        `STM delete failed [conv=${conversationId}, key=${key}]: ${error}`,
      );
    }
  }

  async stmGetAll(conversationId: string): Promise<STMEntry[]> {
    const redisKey = this.stmKey(conversationId);
    try {
      const raw = await this.redisService.cacheClient.hgetall(redisKey);
      if (!raw) return [];
      return Object.values(raw).map((v) => JSON.parse(v) as STMEntry);
    } catch (error) {
      this.logger.warn(`STM getAll failed [conv=${conversationId}]: ${error}`);
      return [];
    }
  }

  async stmClear(conversationId: string): Promise<void> {
    const redisKey = this.stmKey(conversationId);
    try {
      await this.redisService.cacheClient.del(redisKey);
    } catch (error) {
      this.logger.warn(`STM clear failed [conv=${conversationId}]: ${error}`);
    }
  }

  async stmFormatForPrompt(conversationId: string): Promise<string> {
    const entries = await this.stmGetAll(conversationId);
    if (entries.length === 0) return '';
    const lines = entries.map((e) => `- ${e.key}: ${e.value}`).join('\n');
    return `[Short-Term Memory]\n${lines}`;
  }

  /**
   * Returns the LTM record for the workspace, creates an empty one if not exists.
   */
  async ltmGet(workspaceId: string): Promise<AgentWorkspaceMemory> {
    let record = await this.ltmRepository.findOne({ where: { workspaceId } });
    if (!record) {
      record = this.ltmRepository.create({ workspaceId, content: '' });
      record = await this.ltmRepository.save(record);
    }
    return record;
  }

  /**
   * Overwrites the LTM content for the workspace.
   */
  async ltmSet(
    workspaceId: string,
    content: string,
  ): Promise<AgentWorkspaceMemory> {
    let record = await this.ltmRepository.findOne({ where: { workspaceId } });
    if (!record) {
      record = this.ltmRepository.create({ workspaceId, content });
    } else {
      record.content = content;
    }
    return this.ltmRepository.save(record);
  }

  /**
   * Clears the LTM content for the workspace.
   */
  async ltmClear(workspaceId: string): Promise<void> {
    await this.ltmRepository.update({ workspaceId }, { content: '' });
  }

  /**
   * Returns LTM as a prompt context block.
   * Returns empty string if content is empty.
   */
  async ltmFormatForPrompt(workspaceId: string): Promise<string> {
    const record = await this.ltmRepository.findOne({ where: { workspaceId } });
    if (!record?.content?.trim()) return '';
    return `[Long-Term Memory]\n${record.content}`;
  }
}
