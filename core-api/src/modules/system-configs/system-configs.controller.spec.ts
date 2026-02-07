import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { SystemConfigsController } from './system-configs.controller';
import { SystemConfigsService } from './system-configs.service';

describe('SystemConfigsController', () => {
  let controller: SystemConfigsController;
  let mockSystemConfigsService: Partial<SystemConfigsService>;

  beforeEach(async () => {
    mockSystemConfigsService = {
      getConfig: jest.fn(),
      updateConfig: jest.fn(),
      removeLogo: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemConfigsController],
      providers: [
        {
          provide: SystemConfigsService,
          useValue: mockSystemConfigsService,
        },
      ],
    }).compile();

    controller = module.get<SystemConfigsController>(SystemConfigsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getConfig', () => {
    it('should return system configuration', async () => {
      const mockConfig = {
        name: 'Test System',
        logoPath: '/uploads/logo.png',
      };

      (mockSystemConfigsService.getConfig as jest.Mock).mockResolvedValue(
        mockConfig,
      );

      const result = await controller.getConfig();

      expect(mockSystemConfigsService.getConfig).toHaveBeenCalled();
      expect(result).toEqual(mockConfig);
    });
  });

  describe('updateConfig', () => {
    it('should update system configuration', async () => {
      const mockDto = {
        name: 'Updated System',
        logoPath: '/uploads/new-logo.png',
      };

      const mockResponse = {
        message: 'System configuration updated successfully',
      };

      (mockSystemConfigsService.updateConfig as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await controller.updateConfig(mockDto);

      expect(mockSystemConfigsService.updateConfig).toHaveBeenCalledWith(
        mockDto,
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('removeLogo', () => {
    it('should remove system logo and revert to default avatar', async () => {
      const mockResponse = {
        message: 'System logo removed successfully',
      };

      (mockSystemConfigsService.removeLogo as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await controller.removeLogo();

      expect(mockSystemConfigsService.removeLogo).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });
  });
});
