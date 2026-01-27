import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';
import { SystemConfigsService } from './system-configs.service';

describe('SystemConfigsService', () => {
  let service: SystemConfigsService;
  let mockRepository: Partial<Repository<SystemConfig>>;

  const mockConfig: SystemConfig = {
    id: randomUUID(),
    name: 'Open ASM',
    logoPath: '/logo.png',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemConfigsService,
        {
          provide: getRepositoryToken(SystemConfig),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<SystemConfigsService>(SystemConfigsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getConfig', () => {
    it('should return existing config', async () => {
      (mockRepository.findOne as jest.Mock).mockResolvedValue(mockConfig);

      const result = await service.getConfig();

      expect(result).toEqual({
        name: mockConfig.name,
        logoPath: mockConfig.logoPath,
      });
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: {} });
    });

    it('should create and return default config if none exists', async () => {
      (mockRepository.findOne as jest.Mock).mockResolvedValue(null);
      (mockRepository.create as jest.Mock).mockReturnValue(mockConfig);
      (mockRepository.save as jest.Mock).mockResolvedValue(mockConfig);

      const result = await service.getConfig();

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual({
        name: mockConfig.name,
        logoPath: mockConfig.logoPath,
      });
    });
  });

  describe('updateConfig', () => {
    it('should update config with provided name', async () => {
      const updatedConfig = { ...mockConfig, name: 'New Name' };
      (mockRepository.findOne as jest.Mock).mockResolvedValue(mockConfig);
      (mockRepository.save as jest.Mock).mockResolvedValue(updatedConfig);

      const result = await service.updateConfig({ name: 'New Name' });

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Name' }),
      );
      expect(result.message).toBe('System configuration updated successfully');
    });

    it('should update config with provided logoPath', async () => {
      const updatedConfig = { ...mockConfig, logoPath: '/new-logo.png' };
      (mockRepository.findOne as jest.Mock).mockResolvedValue(mockConfig);
      (mockRepository.save as jest.Mock).mockResolvedValue(updatedConfig);

      const result = await service.updateConfig({ logoPath: '/new-logo.png' });

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ logoPath: '/new-logo.png' }),
      );
      expect(result.message).toBe('System configuration updated successfully');
    });

    it('should update config with both name and logoPath', async () => {
      const updatedConfig = {
        ...mockConfig,
        name: 'New Name',
        logoPath: '/new-logo.png',
      };
      (mockRepository.findOne as jest.Mock).mockResolvedValue(mockConfig);
      (mockRepository.save as jest.Mock).mockResolvedValue(updatedConfig);

      const result = await service.updateConfig({
        name: 'New Name',
        logoPath: '/new-logo.png',
      });

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Name',
          logoPath: '/new-logo.png',
        }),
      );
      expect(result.message).toBe('System configuration updated successfully');
    });

    it('should not update fields when dto values are undefined', async () => {
      (mockRepository.findOne as jest.Mock).mockResolvedValue(mockConfig);
      (mockRepository.save as jest.Mock).mockResolvedValue(mockConfig);

      await service.updateConfig({});

      expect(mockRepository.save).toHaveBeenCalledWith(mockConfig);
    });

    it('should create default config if none exists before updating', async () => {
      (mockRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValue(mockConfig);
      (mockRepository.create as jest.Mock).mockReturnValue(mockConfig);
      (mockRepository.save as jest.Mock).mockResolvedValue(mockConfig);

      await service.updateConfig({ name: 'New Name' });

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalledTimes(2);
    });
  });
});
