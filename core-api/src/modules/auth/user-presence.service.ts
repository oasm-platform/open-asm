import { RedisService } from '@/services/redis/redis.service';
import { Injectable, Logger } from '@nestjs/common';

/** Prefix of the key holding a user's last request time, in epoch ms. */
export const PRESENCE_KEY_PREFIX = 'presence:';

/**
 * How long a user's last activity is remembered. A user with no request in
 * this window reads as never seen.
 */
export const PRESENCE_TTL_SECONDS = 30 * 24 * 60 * 60;

const keyOf = (userId: string) => `${PRESENCE_KEY_PREFIX}${userId}`;

/**
 * When each user last made an authenticated request, kept in Redis only.
 * The auth guard writes it on every request; the admin user endpoints read it.
 */
@Injectable()
export class UserPresenceService {
  private readonly logger = new Logger(UserPresenceService.name);

  constructor(private readonly redis: RedisService) {}

  /** Records a request by the user now. Never blocks or fails the request. */
  touch(userId: string): void {
    this.redis
      .setWithExpiry(keyOf(userId), PRESENCE_TTL_SECONDS, Date.now())
      .catch((error: unknown) => {
        this.logger.warn(`Presence write failed: ${String(error)}`);
      });
  }

  /** Last request time per user id; users with none recorded are absent. */
  async lastActiveAt(userIds: string[]): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    if (!userIds.length) return result;

    try {
      const values = await this.redis.cacheClient.mget(userIds.map(keyOf));
      values.forEach((value, index) => {
        const ms = Number(value);
        if (value && Number.isFinite(ms)) {
          result.set(userIds[index], new Date(ms));
        }
      });
    } catch (error) {
      // Presence is informational: the users still load without it.
      this.logger.warn(`Presence read failed: ${String(error)}`);
    }
    return result;
  }
}
