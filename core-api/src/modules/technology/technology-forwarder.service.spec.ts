import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TechnologyForwarderService } from './technology-forwarder.service';
import { RedisService } from '../../services/redis/redis.service';

describe('TechnologyForwarderService', () => {
  let service: TechnologyForwarderService;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TechnologyForwarderService,
        {
          provide: RedisService,
          useValue: {
            client: {
              get: jest.fn(),
              setex: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<TechnologyForwarderService>(
      TechnologyForwarderService,
    );
    redisService = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('fetchTechnologyInfo', () => {
    it('should fetch technology info from GitHub', async () => {
      // Mock Redis to return null (no cache)
      jest.spyOn(redisService.client, 'get').mockResolvedValue(null);

      // Mock fetch for technology data
      global.fetch = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                React: {
                  cats: [5],
                  description:
                    'A JavaScript library for building user interfaces',
                  icon: 'React.svg',
                  website: 'https://reactjs.org/',
                },
              }),
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          }),
        );

      const result = await service.fetchTechnologyInfo('React');

      expect(result).toEqual({
        cats: [5],
        description: 'A JavaScript library for building user interfaces',
        icon: 'React.svg',
        website: 'https://reactjs.org/',
        categories: [],
        categoryNames: [],
      });
    });

    it('should return cached technology info', async () => {
      // Mock Redis to return cached data
      const cachedData = {
        cats: [5],
        description: 'A JavaScript library for building user interfaces',
        icon: 'React.svg',
        website: 'https://reactjs.org/',
        categories: [],
        categoryNames: [],
      };

      jest
        .spyOn(redisService.client, 'get')
        .mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.fetchTechnologyInfo('React');

      expect(result).toEqual(cachedData);
    });
  });
});

