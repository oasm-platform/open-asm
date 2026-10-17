import {
  API_KEY_LENGTH,
  WORKER_JOIN_KEY_ID_PREFIX,
  WORKER_JOIN_KEY_PREFIX,
  WORKER_JOIN_KEY_TTL_SECONDS,
} from '@/common/constants/app.constants';
import { RedisService } from '@/services/redis/redis.service';
import { generateToken } from '@/utils/genToken';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { WorkerJoinKeyResponseDto } from './dto/workers.dto';

/** What `workers:api:<apiKey>` holds. */
export interface WorkerJoinKeyRecord {
  /** Public alias of the key, carried by `worker.joined` as `joinKeyId`. */
  id: string;
  workspaceId: string;
  createdBy: string;
  createdAt: string;
}

/** Anything longer is not a key this service issued; skip the Redis lookup. */
const MAX_KEY_LENGTH = 128;

/**
 * One-time worker join keys for a workspace, stored only in Redis.
 *
 * Each key lives under two entries with the same TTL: the record at
 * `workers:api:<apiKey>` and an alias `workers:api-id:<id>` → apiKey, so the
 * console can rotate or revoke a key — and match its `worker.joined` event —
 * by id without ever handling the secret again. Expiry is Redis' TTL; there
 * is no cleanup job.
 *
 * Cloud workers (`OASM_CLOUD_APIKEY`) never go through here.
 */
@Injectable()
export class WorkerJoinKeyService {
  constructor(private readonly redisService: RedisService) {}

  /** Issues a fresh key for `workspaceId`, valid for the configured TTL. */
  public async create(
    workspaceId: string,
    userId: string,
  ): Promise<WorkerJoinKeyResponseDto> {
    const apiKey = generateToken(API_KEY_LENGTH);
    const record: WorkerJoinKeyRecord = {
      id: randomUUID(),
      workspaceId,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };

    await this.redisService.client
      .multi()
      .set(
        WORKER_JOIN_KEY_PREFIX + apiKey,
        JSON.stringify(record),
        'EX',
        WORKER_JOIN_KEY_TTL_SECONDS,
      )
      .set(
        WORKER_JOIN_KEY_ID_PREFIX + record.id,
        apiKey,
        'EX',
        WORKER_JOIN_KEY_TTL_SECONDS,
      )
      .exec();

    return {
      id: record.id,
      apiKey,
      expiresInSeconds: WORKER_JOIN_KEY_TTL_SECONDS,
      expiresAt: new Date(
        Date.now() + WORKER_JOIN_KEY_TTL_SECONDS * 1000,
      ).toISOString(),
    };
  }

  /**
   * Revokes the key `keyId` (when it still exists and belongs to
   * `workspaceId`) and issues a new one. An already expired or consumed key
   * is simply replaced, which is what an auto-rotate on expiry relies on.
   */
  public async rotate(
    workspaceId: string,
    userId: string,
    keyId: string,
  ): Promise<WorkerJoinKeyResponseDto> {
    await this.revoke(workspaceId, keyId);
    return this.create(workspaceId, userId);
  }

  /** Deletes the key `keyId` if it exists and belongs to `workspaceId`. */
  public async revoke(workspaceId: string, keyId: string): Promise<void> {
    const client = this.redisService.client;
    const aliasKey = WORKER_JOIN_KEY_ID_PREFIX + keyId;
    const apiKey = await client.get(aliasKey);
    if (!apiKey) return;

    const record = this.parse(await client.get(WORKER_JOIN_KEY_PREFIX + apiKey));
    // Never let one workspace delete another's key by guessing its id.
    if (record && record.workspaceId !== workspaceId) return;

    await client.del(WORKER_JOIN_KEY_PREFIX + apiKey, aliasKey);
  }

  /**
   * Atomically takes `apiKey` out of Redis and returns its record, or null
   * when it is unknown, expired or already used. GETDEL makes it single-use:
   * of two workers joining with the same key, only one gets the record.
   */
  public async consume(apiKey: string): Promise<WorkerJoinKeyRecord | null> {
    if (!apiKey || apiKey.length > MAX_KEY_LENGTH) return null;

    const client = this.redisService.client;
    const record = this.parse(
      await client.getdel(WORKER_JOIN_KEY_PREFIX + apiKey),
    );
    if (!record) return null;

    await client.del(WORKER_JOIN_KEY_ID_PREFIX + record.id);
    return record;
  }

  private parse(raw: string | null): WorkerJoinKeyRecord | null {
    if (!raw) return null;
    try {
      const record = JSON.parse(raw) as Partial<WorkerJoinKeyRecord>;
      if (
        typeof record.id !== 'string' ||
        typeof record.workspaceId !== 'string'
      ) {
        return null;
      }
      return record as WorkerJoinKeyRecord;
    } catch {
      return null;
    }
  }
}
