import type { RedisService } from '@/services/redis/redis.service';
import {
  PRESENCE_TTL_SECONDS,
  UserPresenceService,
} from './user-presence.service';

describe('UserPresenceService', () => {
  let redis: { setWithExpiry: jest.Mock; cacheClient: { mget: jest.Mock } };
  let presence: UserPresenceService;

  beforeEach(() => {
    redis = {
      setWithExpiry: jest.fn().mockResolvedValue('OK'),
      cacheClient: { mget: jest.fn() },
    };
    presence = new UserPresenceService(redis as unknown as RedisService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('touch', () => {
    it('stores the current time under the user key', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

      presence.touch('u1');

      expect(redis.setWithExpiry).toHaveBeenCalledWith(
        'presence:u1',
        PRESENCE_TTL_SECONDS,
        1_700_000_000_000,
      );
    });

    it('swallows a Redis failure', async () => {
      redis.setWithExpiry.mockRejectedValue(new Error('down'));

      expect(() => presence.touch('u1')).not.toThrow();
      // Let the rejected write settle: an unhandled rejection fails the suite.
      await new Promise(process.nextTick);
    });
  });

  describe('lastActiveAt', () => {
    it('maps each recorded user to its time and leaves out the rest', async () => {
      redis.cacheClient.mget.mockResolvedValue(['1700000000000', null]);

      const result = await presence.lastActiveAt(['u1', 'u2']);

      expect(redis.cacheClient.mget).toHaveBeenCalledWith([
        'presence:u1',
        'presence:u2',
      ]);
      expect(result).toEqual(new Map([['u1', new Date(1_700_000_000_000)]]));
    });

    it('skips Redis for an empty list', async () => {
      await expect(presence.lastActiveAt([])).resolves.toEqual(new Map());
      expect(redis.cacheClient.mget).not.toHaveBeenCalled();
    });

    it('returns no presence when Redis fails', async () => {
      redis.cacheClient.mget.mockRejectedValue(new Error('down'));

      await expect(presence.lastActiveAt(['u1'])).resolves.toEqual(new Map());
    });
  });
});
