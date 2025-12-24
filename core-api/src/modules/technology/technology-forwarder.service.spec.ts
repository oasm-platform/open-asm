import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { RedisService } from '../../services/redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { TechnologyDetailDTO } from './dto/technology-detail.dto';
import { TechnologyForwarderService } from './technology-forwarder.service';

// Mock external dependencies
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  eval: jest.fn(),
};

jest.mock('../../services/redis/redis.service', () => ({
  RedisService: jest.fn().mockImplementation(() => ({
    cacheClient: mockRedisClient,
  })),
}));

const mockStorageService = {
  forwardImage: jest.fn(),
  uploadFile: jest.fn(),
};

jest.mock('../storage/storage.service', () => ({
  StorageService: jest.fn().mockImplementation(() => mockStorageService),
}));

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('TechnologyForwarderService', () => {
  let service: TechnologyForwarderService;

  const mockTechData = {
    name: 'React',
    cats: [1, 2],
    description: 'A JavaScript library for building user interfaces',
    icon: 'react.svg',
  };

  const mockCategoryData = {
    '1': { name: 'JavaScript Framework', groups: [1], priority: 1 },
    '2': { name: 'Frontend', groups: [2], priority: 2 },
  };

  const mockEnrichedTech: TechnologyDetailDTO = {
    ...mockTechData,
    categories: [
      { name: 'JavaScript Framework', groups: [1], priority: 1 },
      { name: 'Frontend', groups: [2], priority: 2 },
    ],
    categoryNames: ['JavaScript Framework', 'Frontend'],
    iconUrl: '/api/storage/cached-static/react.svg',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TechnologyForwarderService, RedisService, StorageService],
    }).compile();

    service = module.get<TechnologyForwarderService>(
      TechnologyForwarderService,
    );

    // Mock Logger
    (service as any).logger = mockLogger;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchTechnologyInfo', () => {
    it('should return enriched technology info when tech exists in cache', async () => {
      const techName = 'React';

      // Mock getCachedTechnologyInfo to return basic tech data
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(mockTechData))
        .mockResolvedValueOnce(JSON.stringify(mockCategoryData)); // Categories

      mockStorageService.forwardImage.mockResolvedValue({
        buffer: Buffer.from('icon'),
        contentType: 'image/svg+xml',
      });
      mockStorageService.uploadFile.mockReturnValue({
        path: 'cached-static/react.svg',
      });

      const result = await service.fetchTechnologyInfo(techName);

      expect(result).toEqual(mockEnrichedTech);
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'technology:React',
        2592000,
        JSON.stringify(mockEnrichedTech),
      );
    });

    it('should return null when technology not found', async () => {
      const techName = 'NonExistentTech';

      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.fetchTechnologyInfo(techName);

      expect(result).toBeNull();
    });

    it('should handle fetch errors gracefully', async () => {
      const techName = 'React';

      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.fetchTechnologyInfo(techName);

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error getting cached technology info for React:',
        expect.any(Error),
      );
    });
  });

  describe('getCachedTechnologyInfo', () => {
    it('should return cached technology info when exists', async () => {
      const techName = 'React';
      const cachedData = JSON.stringify(mockEnrichedTech);

      mockRedisClient.get.mockResolvedValue(cachedData);

      const result = await service.getCachedTechnologyInfo(techName);

      expect(result).toEqual(mockEnrichedTech);
      expect(mockRedisClient.get).toHaveBeenCalledWith('technology:React');
    });

    it('should return null when not cached', async () => {
      const techName = 'React';

      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.getCachedTechnologyInfo(techName);

      expect(result).toBeNull();
    });

    it('should handle JSON parse errors', async () => {
      const techName = 'React';

      mockRedisClient.get.mockResolvedValue('invalid json');

      const result = await service.getCachedTechnologyInfo(techName);

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('enrichTechnologies', () => {
    it('should enrich multiple technologies successfully', async () => {
      const techNames = ['React', 'Vue'];
      const cachedData = [
        JSON.stringify(mockTechData),
        JSON.stringify({ ...mockTechData, name: 'Vue' }),
      ];

      mockRedisClient.eval.mockResolvedValue(cachedData);
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockCategoryData));
      mockStorageService.forwardImage.mockResolvedValue({
        buffer: Buffer.from('icon'),
        contentType: 'image/svg+xml',
      });
      mockStorageService.uploadFile.mockReturnValue({
        path: 'cached-static/icon.svg',
      });

      const result = await service.enrichTechnologies(techNames);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('React');
      expect(result[1].name).toBe('Vue');
    });

    it('should return empty array for empty input', async () => {
      const result = await service.enrichTechnologies([]);

      expect(result).toEqual([]);
    });

    it('should handle Redis eval errors', async () => {
      const techNames = ['React'];

      mockRedisClient.eval.mockRejectedValue(new Error('Redis error'));

      const result = await service.enrichTechnologies(techNames);

      expect(result).toEqual([new TechnologyDetailDTO()]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getIconUrl', () => {
    it('should return icon URL when icon exists', async () => {
      const iconName = 'react.svg';

      mockStorageService.forwardImage.mockResolvedValue({
        buffer: Buffer.from('icon'),
        contentType: 'image/svg+xml',
      });
      mockStorageService.uploadFile.mockReturnValue({
        path: 'cached-static/react.svg',
      });

      const result = await service.getIconUrl(iconName);

      expect(result).toBe('/api/storage/cached-static/react.svg');
      expect(mockStorageService.forwardImage).toHaveBeenCalled();
      expect(mockStorageService.uploadFile).toHaveBeenCalled();
    });

    it('should return empty string for empty icon name', async () => {
      const result = await service.getIconUrl('');

      expect(result).toBe('');
    });

    it('should handle storage errors gracefully', async () => {
      const iconName = 'react.svg';

      mockStorageService.forwardImage.mockRejectedValue(
        new Error('Storage error'),
      );

      const result = await service.getIconUrl(iconName);

      expect(result).toBe('');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // Edge cases and boundary conditions
  describe('Edge Cases', () => {
    it('should handle technology without categories', async () => {
      const techName = 'BasicTech';
      const techWithoutCats = { name: techName, description: 'No categories' };

      mockRedisClient.get.mockResolvedValueOnce(
        JSON.stringify(techWithoutCats),
      );

      const result = await service.fetchTechnologyInfo(techName);

      expect(result?.categories).toBeUndefined();
      expect(result?.categoryNames).toEqual([]);
    });

    it('should handle malformed cached data in enrichTechnologies', async () => {
      const techNames = ['React'];

      mockRedisClient.eval.mockResolvedValue(['invalid json']);

      const result = await service.enrichTechnologies(techNames);

      expect(result).toEqual([new TechnologyDetailDTO()]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
