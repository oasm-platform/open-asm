import { RedisService } from '@/services/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AiAssistantService } from '../ai-assistant/ai-assistant.service';
import { SystemConfigsService } from '../system-configs/system-configs.service';
import { UsersService } from '../users/users.service';
import { RootService } from './root.service';

describe('RootService', () => {
  let service: RootService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RootService,
        {
          provide: UsersService,
          useValue: {
            createFirstAdmin: jest.fn(),
            usersRepository: {
              count: jest.fn(),
            },
          },
        },
        {
          provide: AiAssistantService,
          useValue: {
            healthCheck: jest.fn(),
          },
        },
        {
          provide: SystemConfigsService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({
              name: 'Open ASM',
              logoPath: undefined,
            }),
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
});
