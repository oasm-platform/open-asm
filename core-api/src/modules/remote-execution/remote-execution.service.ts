import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/services/redis/redis.service';
import {
  CreateSessionDto,
  CliOutputDto,
  RemoteExecutionSession,
  SendCommandDto,
} from './dto/remote-execution.dto';

@Injectable()
export class CliService {
  private readonly logger = new Logger(CliService.name);
  private readonly SESSION_TTL = 24 * 60 * 60;

  constructor(private readonly redisService: RedisService) {}

  private getSessionKey(sessionId: string): string {
    return `cli:sessions:${sessionId}`;
  }

  private getWorkerSessionsKey(workerId: string): string {
    return `cli:worker-sessions:${workerId}`;
  }

  private getOutputChannel(sessionId: string): string {
    return `cli:output:${sessionId}`;
  }

  private getInputChannel(sessionId: string): string {
    return `cli:input:${sessionId}`;
  }

  async createSession(
    dto: CreateSessionDto,
    userId: string,
  ): Promise<RemoteExecutionSession> {
    const sessionId = crypto.randomUUID();
    const session: RemoteExecutionSession = {
      sessionId,
      workerId: dto.workerId,
      workspaceId: dto.workspaceId,
      status: 'active',
      createdAt: new Date(),
      createdBy: userId,
    };

    const key = this.getSessionKey(sessionId);
    const workerKey = this.getWorkerSessionsKey(dto.workerId);

    const pipeline = this.redisService.client.pipeline();
    pipeline.hset(key, {
      workerId: session.workerId,
      workspaceId: session.workspaceId,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      createdBy: session.createdBy,
    });
    pipeline.expire(key, this.SESSION_TTL);
    pipeline.sadd(workerKey, sessionId);
    pipeline.expire(workerKey, this.SESSION_TTL);
    await pipeline.exec();

    this.logger.verbose(
      `Created session ${sessionId} for worker ${dto.workerId}`,
    );
    return session;
  }

  async getSession(sessionId: string): Promise<RemoteExecutionSession | null> {
    const key = this.getSessionKey(sessionId);
    const data = await this.redisService.client.hgetall(key);

    if (!data || Object.keys(data).length === 0) return null;

    return {
      sessionId,
      workerId: data.workerId,
      workspaceId: data.workspaceId,
      status: data.status as 'active' | 'disconnected' | 'closed',
      createdAt: new Date(data.createdAt),
      createdBy: data.createdBy,
    };
  }

  async updateSessionStatus(
    sessionId: string,
    status: 'active' | 'disconnected' | 'closed',
  ): Promise<void> {
    const key = this.getSessionKey(sessionId);
    await this.redisService.client.hset(key, 'status', status);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    const deleted = await this.redisService.client.del(
      this.getSessionKey(sessionId),
    );
    if (deleted === 0) return;

    await this.redisService.client.srem(
      this.getWorkerSessionsKey(session.workerId),
      sessionId,
    );
    this.logger.verbose(`Deleted session ${sessionId}`);
  }

  async publishCommand(
    sessionId: string,
    command: SendCommandDto,
  ): Promise<void> {
    await this.redisService.publish(
      this.getInputChannel(sessionId),
      JSON.stringify(command),
    );
  }

  async publishOutput(
    sessionId: string,
    output: Omit<CliOutputDto, 'sessionId'>,
  ): Promise<void> {
    await this.redisService.publish(
      this.getOutputChannel(sessionId),
      JSON.stringify(output),
    );
  }

  // RedisService.subscribe callback signature is (channel, message)
  // We wrap it so callers only deal with the message string
  async subscribeToOutput(
    sessionId: string,
    callback: (message: string) => void,
  ): Promise<void> {
    const channel = this.getOutputChannel(sessionId);
    await this.redisService.subscribe(channel, (_ch, message) =>
      callback(message),
    );
  }

  async unsubscribeFromOutput(sessionId: string): Promise<void> {
    await this.redisService.unsubscribe(this.getOutputChannel(sessionId));
  }

  async subscribeToInput(
    sessionId: string,
    callback: (message: string) => void,
  ): Promise<void> {
    const channel = this.getInputChannel(sessionId);
    await this.redisService.subscribe(channel, (_ch, message) =>
      callback(message),
    );
  }

  async unsubscribeFromInput(sessionId: string): Promise<void> {
    await this.redisService.unsubscribe(this.getInputChannel(sessionId));
  }
}
