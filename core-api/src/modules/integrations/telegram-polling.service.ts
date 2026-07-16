import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { decryptSensitiveConfigFields } from './validators/integration.validator';
import { Integration } from './entities/integration.entity';
import { TelegramWebhookService } from './telegram-webhook.service';

const POLL_TIMEOUT = 30; // seconds
const POLL_INTERVAL_MS = 3000; // 3 seconds between poll cycles
const LOCK_TTL_MS = 35_000; // 35 seconds — must be > POLL_TIMEOUT * 1000

/**
 * Fallback long-polling service for local/dev environments where BASE_URL
 * is not set (no public webhook endpoint). Uses RedisLockService so only
 * one worker instance polls each bot in a cluster.
 */
@Injectable()
export class TelegramPollingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramPollingService.name);
  private active = false;
  private abortController?: AbortController;

  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepo: Repository<Integration>,
    private readonly redisLockService: RedisLockService,
    private readonly telegramWebhookService: TelegramWebhookService,
    private readonly workspaceEncryption: WorkspaceEncryptionService,
  ) {}

  /**
   * Auto-start on app bootstrap if BASE_URL is not set (local/dev mode).
   */
  onApplicationBootstrap(): void {
    if (!process.env.BASE_URL) {
      this.logger.log('BASE_URL not set — starting Telegram polling service');
      this.start();
    } else {
      this.logger.log(
        'BASE_URL is set — Telegram webhook mode (polling disabled)',
      );
    }
  }

  /**
   * Starts the polling loop for all Telegram integrations.
   * Each bot is polled independently under a Redis lock.
   */
  start(): void {
    if (this.active) return;
    this.active = true;
    this.abortController = new AbortController();
    this.logger.log('Telegram polling service started');
    this.pollLoop().catch((err) => {
      this.logger.error('Polling loop crashed, restarting...', err);
      this.active = false;
      this.start();
    });
  }

  /**
   * Stops the polling loop.
   */
  stop(): void {
    this.active = false;
    this.abortController?.abort();
    this.logger.log('Telegram polling service stopped');
  }

  private async pollLoop(): Promise<void> {
    while (this.active) {
      try {
        await this.pollOnce();
      } catch (err) {
        this.logger.error('pollOnce error', err);
      }
      await this.sleep(POLL_INTERVAL_MS);
    }
  }

  private async pollOnce(): Promise<void> {
    const integrations = await this.integrationRepo.find({
      where: { appType: 'telegram' },
    });

    await Promise.allSettled(
      integrations.map((integration) =>
        this.redisLockService.withLock(
          `telegram:poll:${integration.id}`,
          LOCK_TTL_MS,
          () => this.pollBot(integration),
        ),
      ),
    );
  }
  private async pollBot(integration: Integration): Promise<void> {
<<<<<<< HEAD
=======
    const dek = await this.workspaceEncryption.getDEK(integration.workspaceId);
    const config = decryptSensitiveConfigFields(integration.config, dek);
    const botToken = config.botToken as string | undefined;
    if (!botToken) return;

    // Use getUpdates with a long timeout — Telegram holds the connection
    // open for up to POLL_TIMEOUT seconds if no new messages.
    const offset = this.getOffset(botToken);
    const params = new URLSearchParams({
      timeout: String(POLL_TIMEOUT),
      offset: String(offset),
    });

>>>>>>> b1971b62ab769592fa3b8078b4aea17200eeebfc
    try {
      const dek = await this.workspaceEncryption.getDEK(integration.workspaceId);
      const config = decryptSensitiveConfigFields(integration.config, dek);
      const botToken = config.botToken as string | undefined;
      if (!botToken) return;

      // Use getUpdates with a long timeout — Telegram holds the connection
      // open for up to POLL_TIMEOUT seconds if no new messages.
      const offset = this.getOffset(botToken);
      const params = new URLSearchParams({
        timeout: String(POLL_TIMEOUT),
        offset: String(offset),
      });

      const signal = this.abortController?.signal;
      if (signal?.aborted) return;

      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/getUpdates?${params}`,
        { signal },
      );

      if (!response.ok) {
        this.logger.warn(
          `Telegram polling HTTP ${response.status} for integration ${integration.id}`,
        );
        return;
      }

      const data = (await response.json()) as {
        ok: boolean;
        result?: Array<{ update_id: number }>;
      };

      if (!data.ok || !data.result?.length) return;

      for (const update of data.result) {
        if (signal?.aborted) return;

        try {
          await this.telegramWebhookService.processUpdate(update);
        } catch (err) {
          this.logger.error('Error processing polling update', err);
        }
      }

      // Mark processed updates
      const maxId = Math.max(...data.result.map((u) => u.update_id));
      this.saveOffset(botToken, maxId + 1);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      this.logger.error(`Polling error for integration ${integration.id}`, err);
    }
  }

  /**
   * Returns the next offset (update_id + 1) so Telegram doesn't resend updates.
   * Stored per botToken in memory; in cluster mode only the polling instance
   * tracks this, which is fine since only one polls under the Redis lock.
   */
  private offsets = new Map<string, number>();

  private getOffset(botToken: string): number {
    return this.offsets.get(botToken) ?? 0;
  }

  private saveOffset(botToken: string, offset: number): void {
    this.offsets.set(botToken, offset);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
