import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';
import { SystemConfigsService } from './system-configs.service';

describe('SystemConfigsService', () => {
  let service: SystemConfigsService;
  let mockSystemConfigRepository: Partial<Repository<SystemConfig>>;

  beforeEach(async () => {
    mockSystemConfigRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemConfigsService,
        {
          provide: getRepositoryToken(SystemConfig),
          useValue: mockSystemConfigRepository,
        },
      ],
    }).compile();

    service = module.get<SystemConfigsService>(SystemConfigsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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

    it('should create default config if none exists and set logoPath to null', async () => {
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
      expect(mockSystemConfigRepository.save).toHaveBeenCalledWith(mockConfig);
      expect(result).toEqual({
        message: 'System logo removed successfully',
      });
    });
  });
});
