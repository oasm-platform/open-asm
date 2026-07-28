import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ToolCategory, Severity } from '@/common/enums/enum';
import type { Job } from '@/modules/jobs-registry/entities/job.entity';
import type { JobDataResultType } from '@/common/types/app.types';
import { DataAdapterService } from './data-adapter.service';
import { HandlerRegistry } from './registry/handler-registry';

describe('DataAdapterService', () => {
  let service: DataAdapterService;
  let mockHandlerRegistry: any;

  beforeEach(async () => {
    mockHandlerRegistry = {
      get: jest.fn().mockReturnValue({
        validate: jest.fn().mockResolvedValue({ valid: true }),
        handle: jest.fn().mockResolvedValue(undefined),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataAdapterService,
        {
          provide: HandlerRegistry,
          useValue: mockHandlerRegistry,
        },
      ],
    }).compile();

    service = module.get<DataAdapterService>(DataAdapterService);

    // Mock validateData method
    jest.spyOn(service, 'validateData').mockImplementation((data, cls) => {
      void cls;
      const arr = Array.isArray(data) ? data : [data];
      for (const item of arr) {
        if (
          item &&
          typeof item === 'object' &&
          Object.prototype.hasOwnProperty.call(item, 'value') &&
          typeof item.value === 'number'
        ) {
          return Promise.resolve(false);
        }
      }
      return Promise.resolve(true);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateData', () => {
    it('should validate single object successfully', async () => {
      class TestDto {
        value: string;
      }

      const data = { value: 'test' };
      const result = await service.validateData(data, TestDto);
      expect(result).toBe(true);
    });

    it('should validate array of objects successfully', async () => {
      class TestDto {
        value: string;
      }

      const data = [{ value: 'test1' }, { value: 'test2' }];
      const result = await service.validateData(data, TestDto);
      expect(result).toBe(true);
    });

    it('should return false for invalid data', async () => {
      class TestDto {
        value: string;
      }

      const data = { value: 123 };
      const result = await service.validateData(data, TestDto);
      expect(result).toBe(false);
    });
  });

  describe('syncData', () => {
    let mockHandler: { validate: jest.Mock; handle: jest.Mock };

    beforeEach(() => {
      mockHandler = {
        validate: jest.fn().mockResolvedValue({ valid: true }),
        handle: jest.fn().mockResolvedValue(undefined),
      };
      mockHandlerRegistry.get.mockReturnValue(mockHandler);
    });

    it('should sync ports scanner data', async () => {
      const mockJob = {
        asset: {
          id: 'asset-id',
          value: 'example.com',
          target: { id: 'target-id' },
          targetId: 'target-id',
          isEnabled: true,
          dnsRecords: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        assetServiceId: null,
        jobHistory: { id: 'history-id' },
        tool: { id: 'tool-id', category: ToolCategory.PORTS_SCANNER },
        category: ToolCategory.PORTS_SCANNER,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Job;

      const mockData: number[] = [80, 443];

      await service.syncData({
        data: mockData,
        job: mockJob,
      });

      expect(mockHandlerRegistry.get).toHaveBeenCalledWith(
        ToolCategory.PORTS_SCANNER,
      );
      expect(mockHandler.validate).toHaveBeenCalledWith(mockData, mockJob);
      expect(mockHandler.handle).toHaveBeenCalledWith({
        data: mockData,
        job: mockJob,
      });
    });

    it('should sync subdomains data', async () => {
      const mockJob = {
        asset: {
          id: 'asset-id',
          value: 'example.com',
          target: { id: 'target-id' },
          targetId: 'target-id',
          isEnabled: true,
          dnsRecords: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        assetServiceId: null,
        jobHistory: { id: 'history-id' },
        tool: { id: 'tool-id', category: ToolCategory.SUBDOMAINS },
        category: ToolCategory.SUBDOMAINS,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Job;

      const mockData = [
        {
          value: 'sub.example.com',
          target: { id: 'target-id' },
          targetId: 'target-id',
          isEnabled: true,
          id: 'sub-asset-id',
          dnsRecords: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as unknown as JobDataResultType;

      await service.syncData({
        data: mockData,
        job: mockJob,
      });

      expect(mockHandlerRegistry.get).toHaveBeenCalledWith(
        ToolCategory.SUBDOMAINS,
      );
      expect(mockHandler.handle).toHaveBeenCalledWith({
        data: mockData,
        job: mockJob,
      });
    });

    it('should sync HTTP responses data', async () => {
      const mockJob = {
        asset: {
          id: 'asset-id',
          value: 'example.com',
          target: { id: 'target-id' },
          targetId: 'target-id',
          isEnabled: true,
          dnsRecords: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        assetServiceId: 'service-id',
        jobHistory: { id: 'history-id' },
        tool: { id: 'tool-id', category: ToolCategory.HTTP_PROBE },
        assetService: { id: 'service-id' },
        category: ToolCategory.HTTP_PROBE,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Job;

      const mockData = {
        timestamp: new Date(),
        tls: {},
        port: '443',
        url: 'https://example.com',
        status_code: 200,
        failed: false,
      } as unknown as JobDataResultType;

      await service.syncData({
        data: mockData,
        job: mockJob,
      });

      expect(mockHandlerRegistry.get).toHaveBeenCalledWith(
        ToolCategory.HTTP_PROBE,
      );
      expect(mockHandler.handle).toHaveBeenCalledWith({
        data: mockData,
        job: mockJob,
      });
    });

    it('should sync vulnerabilities data', async () => {
      const mockJob = {
        asset: {
          id: 'asset-id',
          value: 'example.com',
          target: { id: 'target-id' },
          targetId: 'target-id',
          isEnabled: true,
          dnsRecords: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        assetServiceId: null,
        jobHistory: { id: 'history-id' },
        tool: { id: 'tool-id', category: ToolCategory.VULNERABILITIES },
        category: ToolCategory.VULNERABILITIES,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Job;

      const mockData = [
        {
          name: 'Test Vulnerability',
          severity: Severity.HIGH,
          description: 'Test description',
          tags: [],
          jobHistoryId: 'history-id',
          assetId: 'asset-id',
          fingerprint: 'test-fingerprint',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as unknown as JobDataResultType;

      await service.syncData({
        data: mockData,
        job: mockJob,
      });

      expect(mockHandlerRegistry.get).toHaveBeenCalledWith(
        ToolCategory.VULNERABILITIES,
      );
      expect(mockHandler.handle).toHaveBeenCalledWith({
        data: mockData,
        job: mockJob,
      });
    });

    it('should throw error for unsupported tool category', async () => {
      mockHandlerRegistry.get.mockImplementation(() => {
        throw new Error('No handler registered for category: UNSUPPORTED_CATEGORY');
      });

      const mockJob = {
        asset: {
          id: 'asset-id',
          value: 'example.com',
          target: { id: 'target-id' },
          targetId: 'target-id',
          isEnabled: true,
          dnsRecords: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        assetServiceId: null,
        jobHistory: { id: 'history-id' },
        tool: { id: 'tool-id', category: 'UNSUPPORTED_CATEGORY' as any },
        category: 'UNSUPPORTED_CATEGORY' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Job;

      await expect(
        service.syncData({
          data: [],
          job: mockJob,
        }),
      ).rejects.toThrow('No handler registered for category: UNSUPPORTED_CATEGORY');
    });

    it('should throw error for undefined tool category', async () => {
      const mockJob = {
        asset: {
          id: 'asset-id',
          value: 'example.com',
          target: { id: 'target-id' },
          targetId: 'target-id',
          isEnabled: true,
          dnsRecords: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        assetServiceId: null,
        jobHistory: { id: 'history-id' },
        tool: { id: 'tool-id', category: undefined },
        category: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Job;

      await expect(
        service.syncData({
          data: [],
          job: mockJob,
        }),
      ).rejects.toThrow('Tool category is undefined');
    });

    it('should throw error when validation fails', async () => {
      const failingHandler = {
        validate: jest.fn().mockResolvedValue({
          valid: false,
          errors: ['Field is required'],
        }),
        handle: jest.fn(),
      };
      mockHandlerRegistry.get.mockReturnValue(failingHandler);

      const mockJob = {
        asset: {
          id: 'asset-id',
          value: 'example.com',
          target: { id: 'target-id' },
          targetId: 'target-id',
          isEnabled: true,
          dnsRecords: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        assetServiceId: null,
        jobHistory: { id: 'history-id' },
        tool: { id: 'tool-id', category: ToolCategory.SUBDOMAINS },
        category: ToolCategory.SUBDOMAINS,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Job;

      await expect(
        service.syncData({
          data: [],
          job: mockJob,
        }),
      ).rejects.toThrow('Data validation failed for category subdomains: Field is required');

      expect(failingHandler.handle).not.toHaveBeenCalled();
    });
  });
});
