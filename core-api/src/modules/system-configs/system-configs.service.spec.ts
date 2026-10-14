import { RedisService } from '@/services/redis/redis.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { SystemConfig } from './entities/system-config.entity';
import { SystemConfigsService } from './system-configs.service';

describe('SystemConfigsService', () => {
  let service: SystemConfigsService;
  let mockSystemConfigRepository: Partial<Repository<SystemConfig>>;
  let mockStorageService: Partial<StorageService>;

  beforeEach(async () => {
    mockSystemConfigRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockStorageService = {
      deleteFile: jest.fn(),
      signStoragePath: jest.fn(),
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemConfigsService,
        {
          provide: getRepositoryToken(SystemConfig),
          useValue: mockSystemConfigRepository,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<SystemConfigsService>(SystemConfigsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getConfig', () => {
    it('emits logoPath via signStoragePath when raw path present', async () => {
      const rawPath = 'system/logo-123.png';
      const clientUrl = 'http://localhost:9000/system/logo-123.png';
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        name: 'Test System',
        logoPath: rawPath,
      });
      (mockStorageService.signStoragePath as jest.Mock).mockResolvedValue(
        clientUrl,
      );

      const result = await service.getConfig();

      expect(
        mockStorageService.signStoragePath as jest.Mock,
      ).toHaveBeenCalledWith(rawPath);
      expect(result).toEqual({ name: 'Test System', logoPath: clientUrl });
    });

    it('returns null logoPath without calling helper when absent', async () => {
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        name: 'OASM',
        logoPath: null,
      });

      const result = await service.getConfig();

      expect(
        mockStorageService.signStoragePath as jest.Mock,
      ).not.toHaveBeenCalled();
      expect(result).toEqual({ name: 'OASM', logoPath: null });
    });
  });

  describe('getRawLogoPath', () => {
    it('returns the raw stored path without calling the client-URL helper', async () => {
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        name: 'Test System',
        logoPath: 'system/logo-123.png',
      });

      const result = await service.getRawLogoPath();

      expect(
        mockStorageService.signStoragePath as jest.Mock,
      ).not.toHaveBeenCalled();
      expect(result).toBe('system/logo-123.png');
    });

    it('returns null when no logo is configured', async () => {
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        name: 'OASM',
        logoPath: null,
      });

      await expect(service.getRawLogoPath()).resolves.toBeNull();
    });
  });

  describe('removeLogo', () => {
    it('should remove logo and set logoPath to null', async () => {
      const mockConfig = {
        id: 1,
        name: 'Test System',
        logoPath: '/uploads/logo.png',
      };

      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue(
        mockConfig,
      );
      (mockSystemConfigRepository.save as jest.Mock).mockResolvedValue({
        ...mockConfig,
        logoPath: null,
      });

      const result = await service.removeLogo();

      expect(mockSystemConfigRepository.findOne).toHaveBeenCalled();
      expect(mockSystemConfigRepository.save).toHaveBeenCalledWith({
        ...mockConfig,
        logoPath: null,
      });
      expect(result).toEqual({
        message: 'System logo removed successfully',
      });
    });

    it('should create default config if none exists and return no logo message', async () => {
      const mockConfig = {
        id: 1,
        name: 'OASM',
        logoPath: null,
      };

      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue(null);
      (mockSystemConfigRepository.create as jest.Mock).mockReturnValue(
        mockConfig,
      );
      (mockSystemConfigRepository.save as jest.Mock).mockResolvedValue(
        mockConfig,
      );

      const result = await service.removeLogo();

      expect(mockSystemConfigRepository.findOne).toHaveBeenCalled();
      expect(mockSystemConfigRepository.create).toHaveBeenCalledWith({
        name: 'OASM',
        logoPath: undefined,
      });
      expect(result).toEqual({
        message: 'No system logo to remove',
      });
    });
  });
});
