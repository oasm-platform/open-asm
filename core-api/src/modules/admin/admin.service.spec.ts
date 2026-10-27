import { Role } from '@/common/enums/enum';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { RedisService } from '@/services/redis/redis.service';
import { ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from '../auth/auth.service';
import { User } from '../auth/entities/user.entity';
import { AdminService } from './admin.service';

type StoredUser = {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
};

/** Yields to the event loop so concurrent calls interleave like real I/O. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** In-memory Redis with the `SET NX PX` / owner-checked `DEL` semantics the lock relies on. */
function createFakeRedisClient() {
  const store = new Map<string, string>();
  return {
    store,
    set: jest.fn(async (key: string, value: string, ..._opts: unknown[]) => {
      await tick();
      if (store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    eval: jest.fn(
      async (_script: string, _numKeys: number, key: string, value: string) => {
        await tick();
        if (store.get(key) !== value) return 0;
        store.delete(key);
        return 1;
      },
    ),
  };
}

describe('AdminService', () => {
  let service: AdminService;
  let users: Map<string, StoredUser>;
  let redisClient: ReturnType<typeof createFakeRedisClient>;
  let usersRepository: {
    exists: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let authApi: { signUpEmail: jest.Mock; signInEmail: jest.Mock };

  const adminCount = () =>
    [...users.values()].filter((u) => u.role === Role.ADMIN).length;

  beforeEach(async () => {
    users = new Map();
    redisClient = createFakeRedisClient();

    usersRepository = {
      exists: jest.fn(async ({ where }: { where: { role: Role } }) => {
        await tick();
        return [...users.values()].some((u) => u.role === where.role);
      }),
      update: jest.fn(async (id: string, patch: Partial<StoredUser>) => {
        await tick();
        Object.assign(users.get(id)!, patch);
      }),
      delete: jest.fn(async (id: string) => {
        await tick();
        users.delete(id);
      }),
    };
    authApi = {
      signUpEmail: jest.fn(async ({ body }: { body: { email: string } }) => {
        await tick();
        if ([...users.values()].some((u) => u.email === body.email)) {
          throw new Error('User already exists');
        }
        const id = `user-${users.size + 1}`;
        users.set(id, {
          id,
          email: body.email,
          role: Role.USER,
          emailVerified: false,
        });
        return { user: { id } };
      }),
      signInEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        RedisLockService,
        { provide: RedisService, useValue: { client: redisClient } },
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: AuthService, useValue: { api: authApi } },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createFirstAdmin', () => {
    const dto = { email: 'admin@example.com', password: 'secret-password' };

    it('signs up the user and promotes it to a verified admin', async () => {
      const result = await service.createFirstAdmin(dto);

      expect(usersRepository.exists).toHaveBeenCalledWith({
        where: { role: Role.ADMIN },
      });
      expect(authApi.signUpEmail).toHaveBeenCalledWith({
        body: { name: 'Admin', ...dto },
      });
      expect(usersRepository.update).toHaveBeenCalledWith('user-1', {
        role: Role.ADMIN,
        emailVerified: true,
      });
      expect(result).toEqual({ message: 'Admin user created successfully' });
      expect(redisClient.store.size).toBe(0);
    });

    it('refuses once an admin already exists', async () => {
      users.set('existing', {
        id: 'existing',
        email: 'existing@example.com',
        role: Role.ADMIN,
        emailVerified: true,
      });

      await expect(service.createFirstAdmin(dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(authApi.signUpEmail).not.toHaveBeenCalled();
      expect(usersRepository.update).not.toHaveBeenCalled();
      expect(redisClient.store.size).toBe(0);
    });

    it('creates exactly one admin when requests race', async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) =>
          service.createFirstAdmin({
            email: `racer-${i}@example.com`,
            password: 'secret-password',
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(4);
      for (const r of rejected) {
        expect(r.reason).toBeInstanceOf(ConflictException);
      }
      // Losers never reach sign-up, so no stray account exists to promote later.
      expect(authApi.signUpEmail).toHaveBeenCalledTimes(1);
      expect(users.size).toBe(1);
      expect(adminCount()).toBe(1);
      expect(redisClient.store.size).toBe(0);
    });

    it('refuses a request that arrives after another one finished', async () => {
      await service.createFirstAdmin(dto);

      await expect(
        service.createFirstAdmin({
          email: 'late@example.com',
          password: 'secret-password',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(adminCount()).toBe(1);
    });

    it('removes the half-created account and releases the lock when promotion fails', async () => {
      // withLock logs the action's error before rethrowing it.
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      usersRepository.update.mockRejectedValueOnce(new Error('db down'));

      await expect(service.createFirstAdmin(dto)).rejects.toThrow('db down');
      expect(users.size).toBe(0);
      expect(redisClient.store.size).toBe(0);

      // Same email again: works because the failed attempt left nothing behind.
      await expect(service.createFirstAdmin(dto)).resolves.toEqual({
        message: 'Admin user created successfully',
      });
      expect(adminCount()).toBe(1);
    });
  });
});
