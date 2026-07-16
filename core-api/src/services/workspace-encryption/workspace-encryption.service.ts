import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { encrypt } from '@/common/utils/encryption.util';
import {
  decryptWithDEK,
  encryptWithDEK,
  generateDEK,
  unwrapDEK,
  wrapDEK,
} from '@/common/utils/workspace-encryption.util';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { RedisLockService } from '@/services/redis/distributed-lock.service';

<<<<<<< HEAD
// ponytail: encryptCache / decryptCache removed — caching ciphertext breaks
// AES-CBC randomized IV; caching plaintext leaks memory. Add back only if
// profiling shows getDEK is a hot-path bottleneck, and only for dekCache.

=======
>>>>>>> b1971b62ab769592fa3b8078b4aea17200eeebfc
/**
 * Centralized service for workspace-level Data Encryption Key (DEK) resolution.
 *
 * Each workspace gets its own DEK (envelope encryption). This service fetches
 * the wrapped DEK from the workspace record and unwraps it using the system KEK.
 *
 * Services that need workspace-aware encryption inject this service instead of
 * duplicating the Workspace repository query + unwrapDEK call.
 */
@Injectable()
export class WorkspaceEncryptionService implements OnModuleInit {
  private readonly logger = new Logger(WorkspaceEncryptionService.name);
  private readonly dekCache = new Map<string, Buffer>();
<<<<<<< HEAD
  private static readonly MAX_CACHE_SIZE = 1024;

  private evictOldestIfNeeded(): void {
    if (this.dekCache.size >= WorkspaceEncryptionService.MAX_CACHE_SIZE) {
      const oldest = this.dekCache.keys().next();
      if (!oldest.done) {
        this.dekCache.delete(oldest.value);
      }
=======
  private readonly encryptCache = new Map<string, string>();
  private readonly decryptCache = new Map<string, string>();
  private static readonly MAX_CACHE_SIZE = 1024;

  private evictIfNeeded<K, V>(map: Map<K, V>): void {
    if (map.size >= WorkspaceEncryptionService.MAX_CACHE_SIZE) {
      const oldest = map.keys().next().value as K | undefined;
      if (oldest !== undefined) map.delete(oldest);
>>>>>>> b1971b62ab769592fa3b8078b4aea17200eeebfc
    }
  }

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    private readonly redisLockService: RedisLockService,
  ) {}

  async onModuleInit() {
    const lockKey = 'workspace-dek-backfill';
    // TTL generous enough for backfill; withLock releases promptly on completion.
    const lockTTL = 60_000;

    const ran = await this.redisLockService.withLock(
      lockKey,
      lockTTL,
      async () => this.backfillMissingDEKs(),
    );

    if (ran === null) {
      this.logger.log('Another instance holds the DEK backfill lock, skipping');
    }
  }

  /**
   * Backfill DEK for all workspaces missing one (pre-envelope-encryption).
   * Protected by distributed lock — only one instance executes this at a time.
   */
  private async backfillMissingDEKs(): Promise<void> {
    const workspaces = await this.workspaceRepo.find({
      where: { dek: IsNull() },
      select: ['id'],
    });

    if (workspaces.length === 0) {
      this.logger.log('All workspaces already have a DEK, nothing to backfill');
      return;
    }

    this.logger.log(`Backfilling DEK for ${workspaces.length} workspace(s)...`);

    let success = 0;
    for (const ws of workspaces) {
      try {
        await this.ensureDEK(ws.id);
        success++;
      } catch (err) {
        this.logger.error(`Failed to generate DEK for workspace ${ws.id}`, err);
      }
    }

    this.logger.log(
      `DEK backfill complete: ${success}/${workspaces.length} workspace(s) updated`,
    );
  }

  /**
   * Generate a DEK and persist the wrapped form for a specific workspace.
<<<<<<< HEAD
   * Uses a conditional update (WHERE dek IS NULL) so concurrent backfill
   * instances or lock-expiry races cannot overwrite an existing DEK.
   */
  async ensureDEK(workspaceId: string): Promise<boolean> {
    const dek = generateDEK();
    const wrappedDEK = wrapDEK(dek);
    const result = await this.workspaceRepo.update(
      { id: workspaceId, dek: IsNull() },
      { dek: wrappedDEK, dekAt: new Date() },
    );
    if (result.affected && result.affected > 0) {
      this.evictOldestIfNeeded();
      this.dekCache.set(workspaceId, dek);
      return true;
    }
    // DEK already exists — another instance won the race. Load it into cache.
    const existing = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
      select: ['dek'],
    });
    if (existing?.dek) {
      this.evictOldestIfNeeded();
      this.dekCache.set(workspaceId, unwrapDEK(existing.dek));
    }
    return false;
=======
   */
  async ensureDEK(workspaceId: string): Promise<void> {
    const dek = generateDEK();
    const wrappedDEK = wrapDEK(dek);
    await this.workspaceRepo.update(workspaceId, {
      dek: wrappedDEK,
      dekAt: new Date(),
    });
    this.dekCache.set(workspaceId, dek);
    // Ciphertexts encrypted with old DEK won't decrypt with the new one
    this.encryptCache.clear();
    this.decryptCache.clear();
>>>>>>> b1971b62ab769592fa3b8078b4aea17200eeebfc
  }

  /**
   * Generate and return a wrapped DEK string.
   * Useful for creation flows that save the workspace entity in one shot.
   */
  generateWrappedDEK(): string {
    return wrapDEK(generateDEK());
  }

  /**
   * Fetch and unwrap the DEK for a given workspace.
   * Returns null for old/pre-envelope-encryption workspaces (backward compat).
   */
  async getDEK(workspaceId: string): Promise<Buffer | null> {
    const cached = this.dekCache.get(workspaceId);
    if (cached) return cached;

    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
      select: ['dek'],
    });

    if (!workspace?.dek) return null;

    const dek = unwrapDEK(workspace.dek);
<<<<<<< HEAD
    this.evictOldestIfNeeded();
=======
    this.evictIfNeeded(this.dekCache);
>>>>>>> b1971b62ab769592fa3b8078b4aea17200eeebfc
    this.dekCache.set(workspaceId, dek);
    return dek;
  }

  /**
   * Encrypt text using the workspace's DEK.
   * Fetches the DEK automatically. Falls back to KEK encryption
   * for legacy workspaces without a DEK.
   */
  async encrypt(workspaceId: string, text: string): Promise<string> {
<<<<<<< HEAD
    const dek = await this.getDEK(workspaceId);
    return dek ? encryptWithDEK(text, dek) : encrypt(text);
=======
    const cacheKey = `${workspaceId}\0${text}`;
    const cached = this.encryptCache.get(cacheKey);
    if (cached) return cached;

    const dek = await this.getDEK(workspaceId);
    const result = dek ? encryptWithDEK(text, dek) : encrypt(text);
    this.evictIfNeeded(this.encryptCache);
    this.encryptCache.set(cacheKey, result);
    return result;
>>>>>>> b1971b62ab769592fa3b8078b4aea17200eeebfc
  }

  /**
   * Decrypt text using the workspace's DEK.
   * Fetches the DEK automatically. Falls back through DEK → KEK
   * for legacy encrypted data and pre-envelope-encryption workspaces.
   */
  async decrypt(workspaceId: string, encryptedText: string): Promise<string> {
<<<<<<< HEAD
    const dek = await this.getDEK(workspaceId);
    return decryptWithDEK(encryptedText, dek);
=======
    const cached = this.decryptCache.get(encryptedText);
    if (cached) return cached;

    const dek = await this.getDEK(workspaceId);
    const result = decryptWithDEK(encryptedText, dek);
    this.evictIfNeeded(this.decryptCache);
    this.decryptCache.set(encryptedText, result);
    return result;
>>>>>>> b1971b62ab769592fa3b8078b4aea17200eeebfc
  }
}
