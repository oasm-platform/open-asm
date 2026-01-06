import { Test, type TestingModule } from '@nestjs/testing';
import { RedisLockService } from './distributed-lock.service';
import { RedisService } from './redis.service';

// Mock RedisService
const mockRedisService = {
  client: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
};

describe('RedisLockService', () => {
  let service: RedisLockService;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisLockService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<RedisLockService>(RedisLockService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('lockWithTimeOut', () => {
    it('should acquire lock successfully', async () => {
      mockRedisService.client.set.mockResolvedValue('OK');

      const result = await service.lockWithTimeOut('test-key', 1000);

      expect(result).toBe(true);
      expect(redisService.client.set).toHaveBeenCalledWith(
        'distributed-lock:test-key',
        expect.any(String),
        'PX',
        1000,
      );
    });

    it('should fail to acquire lock when key exists', async () => {
      mockRedisService.client.set.mockResolvedValue(null);

      const result = await service.lockWithTimeOut('test-key', 1000);

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockRedisService.client.set.mockRejectedValue(new Error('Redis error'));

      await expect(service.lockWithTimeOut('test-key', 1000)).rejects.toThrow(
        'Redis error',
      );
    });
  });

  describe('isWithoutLock', () => {
    it('should return true when lock is absent', async () => {
      mockRedisService.client.get.mockResolvedValue(null);

      const result = await service.isWithoutLock('test-key');

      expect(result).toBe(true);
      expect(redisService.client.get).toHaveBeenCalledWith(
        'distributed-lock:test-key',
      );
    });

    it('should return false when lock exists', async () => {
      mockRedisService.client.get.mockResolvedValue('1234567890');

      const result = await service.isWithoutLock('test-key');

      expect(result).toBe(false);
    });
  });

  describe('withLock', () => {
    it('should execute action when lock is acquired', async () => {
      mockRedisService.client.set.mockResolvedValue('OK');
      mockRedisService.client.del.mockResolvedValue(1);

      const action = jest.fn().mockResolvedValue('success');
      const result = await service.withLock('test-key', 1000, action);

      expect(result).toBe('success');
      expect(action).toHaveBeenCalled();
      expect(redisService.client.del).toHaveBeenCalledWith(
        'distributed-lock:test-key',
      );
    });

    it('should return null when lock cannot be acquired', async () => {
      mockRedisService.client.set.mockResolvedValue(null);

      const action = jest.fn();
      const result = await service.withLock('test-key', 1000, action);

      expect(result).toBeNull();
      expect(action).not.toHaveBeenCalled();
      expect(redisService.client.del).not.toHaveBeenCalled();
    });

    it('should release lock even when action throws error', async () => {
      mockRedisService.client.set.mockResolvedValue('OK');
      mockRedisService.client.del.mockResolvedValue(1);

      const action = jest.fn().mockRejectedValue(new Error('Action failed'));

      await expect(service.withLock('test-key', 1000, action)).rejects.toThrow(
        'Action failed',
      );

      expect(redisService.client.del).toHaveBeenCalledWith(
        'distributed-lock:test-key',
      );
    });

    it('should handle concurrent lock attempts', async () => {
      // Simulate race condition where first call succeeds, second fails
      const setMock = mockRedisService.client.set;
      setMock.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

      const action1 = jest.fn().mockResolvedValue('result1');
      const action2 = jest.fn().mockResolvedValue('result2');

      const [result1, result2] = await Promise.all([
        service.withLock('test-key', 1000, action1),
        service.withLock('test-key', 1000, action2),
      ]);

      expect(result1).toBe('result1');
      expect(result2).toBeNull();
      expect(action1).toHaveBeenCalled();
      expect(action2).not.toHaveBeenCalled();
    });
  });

  describe('lock value generation', () => {
    it('should generate unique lock values based on timestamp', async () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      mockRedisService.client.set.mockResolvedValue('OK');

      await service.lockWithTimeOut('test-key', 1000);

      expect(mockRedisService.client.set).toHaveBeenCalledWith(
        'distributed-lock:test-key',
        now.toString(),
        'PX',
        1000,
      );
    });
  });
});
