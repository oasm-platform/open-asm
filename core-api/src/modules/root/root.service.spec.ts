import { RedisService } from '@/services/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { StorageService } from '../storage/storage.service';
import { SystemConfigsService } from '../system-configs/system-configs.service';
import { UsersService } from '../users/users.service';
import { RootService } from './root.service';

describe('RootService', () => {
  let service: RootService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        RootService,
        {
          provide: UsersService,
          useValue: {
            createFirstAdmin: jest.fn(),
            usersRepository: {
              count: jest.fn(),
              exists: jest.fn().mockResolvedValue(true),
            },
          },
        },
        {
          provide: SystemConfigsService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({
              name: 'Open ASM',
              logoPath: 'http://localhost:9000/system/logo.png',
            }),
          },
        },
        {
          provide: StorageService,
          useValue: {
            getPresignTtlSeconds: jest.fn().mockReturnValue(900),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'APP_VERSION') return '1.0.0';
              if (key === 'NODE_ENV') return 'test';
              return null;
            }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(
              JSON.stringify({
                tag_name: 'v1.0.0',
                body: 'Test release notes',
                published_at: '2024-01-01T00:00:00Z',
              }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<RootService>(RootService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMetadata', () => {
    it('includes storagePresignTtlSeconds from StorageService config', async () => {
      const storageService = module.get<StorageService>(StorageService);
      jest
        .spyOn(storageService, 'getPresignTtlSeconds')
        .mockReturnValue(1800);

      const result = await service.getMetadata();

      expect(result.storagePresignTtlSeconds).toBe(1800);
    });

    it('passes the client logoPath through for logged-out login page reads', async () => {
      const result = await service.getMetadata();

      expect(result.logoPath).toBe('http://localhost:9000/system/logo.png');
      expect(result.storagePresignTtlSeconds).toBe(900);
    });
  });
});
