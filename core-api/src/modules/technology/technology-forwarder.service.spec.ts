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
  signStoragePath: jest.fn(),
};

jest.mock('../storage/storage.service', () => ({
  StorageService: jest.fn().mockImplementation(() => mockStorageService),
}));

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const RAW_ICON_PATH = 'cached-static/abc123.svg';
const CLIENT_ICON_URL = 'https://cdn.test/cached-static/abc123.svg';
const ICON_TTL = 2592000;

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
    iconUrl: CLIENT_ICON_URL,
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

    mockStorageService.forwardImage.mockResolvedValue({
      buffer: Buffer.from('icon'),
      contentType: 'image/svg+xml',
    });
    mockStorageService.uploadFile.mockResolvedValue({
      path: RAW_ICON_PATH,
    });
    mockStorageService.signStoragePath.mockResolvedValue(CLIENT_ICON_URL);
    mockRedisClient.setex.mockResolvedValue('OK');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchTechnologyInfo', () => {
    it('should return enriched technology info when tech exists in cache', async () => {
      const techName = 'React';

      mockRedisClient.get.mockImplementation((key: string) => {
        if (key === 'technology:React') return JSON.stringify(mockTechData);
        if (key === 'categories') return JSON.stringify(mockCategoryData);
        if (key === 'icon:v2:react.svg') return null;
        return null;
      });

      const result = await service.fetchTechnologyInfo(techName);

      expect(result).toEqual(mockEnrichedTech);
      expect(mockStorageService.signStoragePath).toHaveBeenCalledWith(
        RAW_ICON_PATH,
      );
      expect(mockStorageService.signStoragePath).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/'),
      );
      // technology: JSON is written without iconUrl
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'technology:React',
        ICON_TTL,
        expect.not.stringContaining('iconUrl'),
      );
      const techWrite = mockRedisClient.setex.mock.calls.find(
        (c: unknown[]) => c[0] === 'technology:React',
      );
      expect(JSON.parse(techWrite[2] as string)).not.toHaveProperty('iconUrl');
      // icon raw path cached under icon:v2:
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'icon:v2:react.svg',
        ICON_TTL,
        RAW_ICON_PATH,
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
      mockRedisClient.get.mockImplementation((key: string) => {
        if (key === 'categories') return JSON.stringify(mockCategoryData);
        if (key.startsWith('icon:v2:')) return null;
        return null;
      });

      const result = await service.enrichTechnologies(techNames);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('React');
      expect(result[1].name).toBe('Vue');
      expect(result[0].iconUrl).toBe(CLIENT_ICON_URL);
      expect(result[1].iconUrl).toBe(CLIENT_ICON_URL);
      expect(mockStorageService.signStoragePath).toHaveBeenCalledWith(
        RAW_ICON_PATH,
      );
      expect(mockStorageService.signStoragePath).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/'),
      );
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
    it('should return helper URL on miss and cache the raw path', async () => {
      const iconName = 'react.svg';

      // Prime a cache miss so the test exercises the forward + upload path.
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.getIconUrl(iconName);

      expect(result).toBe(CLIENT_ICON_URL);
      expect(mockRedisClient.get).toHaveBeenCalledWith(`icon:v2:${iconName}`);
      expect(mockStorageService.forwardImage).toHaveBeenCalled();
      expect(mockStorageService.uploadFile).toHaveBeenCalled();
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `icon:v2:${iconName}`,
        ICON_TTL,
        RAW_ICON_PATH,
      );
      expect(mockStorageService.signStoragePath).toHaveBeenCalledWith(
        RAW_ICON_PATH,
      );
      expect(mockStorageService.signStoragePath).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/'),
      );
    });

    it('should return empty string for empty icon name', async () => {
      const result = await service.getIconUrl('');

      expect(result).toBe('');
      expect(mockStorageService.forwardImage).not.toHaveBeenCalled();
      expect(mockStorageService.signStoragePath).not.toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      const iconName = 'react.svg';

      // Prime a cache miss so the storage error path is actually exercised.
      mockRedisClient.get.mockResolvedValue(null);
      mockStorageService.forwardImage.mockRejectedValue(
        new Error('Storage error'),
      );

      const result = await service.getIconUrl(iconName);

      expect(result).toBe('');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('getIconUrl returns helper URL on hit without calling storageService upload', async () => {
      const iconName = 'react.svg';

      mockRedisClient.get.mockResolvedValue(RAW_ICON_PATH);

      const result = await service.getIconUrl(iconName);

      expect(result).toBe(CLIENT_ICON_URL);
      expect(mockRedisClient.get).toHaveBeenCalledWith(`icon:v2:${iconName}`);
      expect(mockStorageService.signStoragePath).toHaveBeenCalledWith(
        RAW_ICON_PATH,
      );
      expect(mockStorageService.forwardImage).not.toHaveBeenCalled();
      expect(mockStorageService.uploadFile).not.toHaveBeenCalled();
    });

    it('getIconUrl caches the raw path on miss', async () => {
      const iconName = 'react.svg';

      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.getIconUrl(iconName);

      expect(result).toBe(CLIENT_ICON_URL);
      expect(mockRedisClient.get).toHaveBeenCalledWith(`icon:v2:${iconName}`);
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `icon:v2:${iconName}`,
        ICON_TTL,
        RAW_ICON_PATH,
      );
      expect(mockStorageService.signStoragePath).toHaveBeenCalledWith(
        RAW_ICON_PATH,
      );
    });

    it('getIconUrl treats a stale absolute URL value as a miss', async () => {
      const iconName = 'react.svg';

      // Old contract cached the emitted absolute path; the new guard rejects
      // anything containing /api/ and must re-derive from the raw path.
      mockRedisClient.get.mockResolvedValue(
        '/api/storage/cached-static/react.svg',
      );

      const result = await service.getIconUrl(iconName);

      expect(result).toBe(CLIENT_ICON_URL);
      expect(mockStorageService.forwardImage).toHaveBeenCalled();
      expect(mockStorageService.uploadFile).toHaveBeenCalled();
      expect(mockStorageService.signStoragePath).toHaveBeenCalledWith(
        RAW_ICON_PATH,
      );
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `icon:v2:${iconName}`,
        ICON_TTL,
        RAW_ICON_PATH,
      );
    });

    it('getIconUrl treats an empty cached value as a miss', async () => {
      const iconName = 'react.svg';

      // Expired keys read as null; a stored empty string must degrade the
      // same way — asRawIconPath rejects falsy values.
      mockRedisClient.get.mockResolvedValue('');

      const result = await service.getIconUrl(iconName);

      expect(result).toBe(CLIENT_ICON_URL);
      expect(mockStorageService.forwardImage).toHaveBeenCalled();
      expect(mockStorageService.signStoragePath).toHaveBeenCalledWith(
        RAW_ICON_PATH,
      );
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `icon:v2:${iconName}`,
        ICON_TTL,
        RAW_ICON_PATH,
      );
    });

    it('getIconUrl treats a malformed cached value as a miss', async () => {
      const iconName = 'react.svg';

      // No slash / wrong bucket: asRawIconPath rejects it.
      mockRedisClient.get.mockResolvedValue('other-bucket/react.svg');

      const result = await service.getIconUrl(iconName);

      expect(result).toBe(CLIENT_ICON_URL);
      expect(mockStorageService.forwardImage).toHaveBeenCalled();
      expect(mockStorageService.signStoragePath).toHaveBeenCalledWith(
        RAW_ICON_PATH,
      );
    });

    it('getIconUrl still serves the icon when Redis is unavailable', async () => {
      const iconName = 'react.svg';

      // Redis read fails — must degrade to forward+upload instead of
      // returning an empty icon (icons must not hard-depend on Redis).
      mockRedisClient.get.mockRejectedValue(new Error('Redis down'));

      const result = await service.getIconUrl(iconName);

      expect(result).toBe(CLIENT_ICON_URL);
      expect(mockStorageService.forwardImage).toHaveBeenCalled();
      expect(mockStorageService.uploadFile).toHaveBeenCalled();
      expect(mockStorageService.signStoragePath).toHaveBeenCalledWith(
        RAW_ICON_PATH,
      );
    });

    it('getIconUrl still serves the icon when the Redis write fails after upload', async () => {
      const iconName = 'react.svg';

      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setex.mockRejectedValue(new Error('Redis down'));

      const result = await service.getIconUrl(iconName);

      expect(result).toBe(CLIENT_ICON_URL);
      expect(mockStorageService.signStoragePath).toHaveBeenCalledWith(
        RAW_ICON_PATH,
      );
    });

    it('getIconUrl does not cache the path when forwarding fails', async () => {
      const iconName = 'react.svg';

      mockRedisClient.get.mockResolvedValue(null);
      mockStorageService.forwardImage.mockRejectedValue(
        new Error('Storage error'),
      );

      const result = await service.getIconUrl(iconName);

      expect(result).toBe('');
      expect(mockRedisClient.get).toHaveBeenCalledWith(`icon:v2:${iconName}`);
      expect(mockRedisClient.setex).not.toHaveBeenCalled();
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
