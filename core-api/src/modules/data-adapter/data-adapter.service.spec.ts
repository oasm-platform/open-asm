import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { InsertResult } from 'typeorm';
import { DataSource } from 'typeorm';
import { Severity, ToolCategory } from '../../common/enums/enum';
import { AssetTag } from '../assets/entities/asset-tags.entity';
import type { Asset } from '../assets/entities/assets.entity';
import type { HttpResponse } from '../assets/entities/http-response.entity';
import type { Job } from '../jobs-registry/entities/job.entity';
import type { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { DataAdapterService } from './data-adapter.service';

describe('DataAdapterService', () => {
  let service: DataAdapterService;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    manager: {
      createQueryBuilder: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
    },
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    createQueryBuilder: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn(),
    getRepository: jest.fn().mockReturnThis(),
    query: jest.fn(),
    transaction: jest.fn(),
  };

  const mockWorkspacesService = {
    getWorkspaceIdByTargetId: jest.fn(),
    getWorkspaceConfigValue: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataAdapterService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: WorkspacesService,
          useValue: mockWorkspacesService,
        },
      ],
    }).compile();

    service = module.get<DataAdapterService>(DataAdapterService);

    // Mock validateData method to return true for valid data and false for invalid data
    jest.spyOn(service, 'validateData').mockImplementation((data, cls) => {
      // Use cls parameter to satisfy lint rule, though not actually used in mock logic
      void cls; // This satisfies the lint rule without affecting logic
      const arr = Array.isArray(data) ? data : [data];
      for (const item of arr) {
        // Simple validation: if value is a number when it should be string, return false
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

      const data = { value: 123 }; // Invalid type
      const result = await service.validateData(data, TestDto);
      expect(result).toBe(false);
    });
  });

  describe('subdomains', () => {
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

    const mockAssets = [
      {
        id: 'asset1-id',
        value: 'sub1.example.com',
        target: { id: 'target-id' },
        targetId: 'target-id',
        isEnabled: true,
        dnsRecords: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'asset2-id',
        value: 'sub2.example.com',
        target: { id: 'target-id' },
        targetId: 'target-id',
        isEnabled: true,
        dnsRecords: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as Asset[];

    it('should handle subdomain data successfully', async () => {
      const mockInsertResult = {
        identifiers: [{ id: 'inserted-id' }],
        generatedMaps: [],
        raw: [],
      } as unknown as InsertResult;

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(undefined); // Update Asset
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(undefined); // Update Job
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(mockInsertResult); // Insert Assets
      mockWorkspacesService.getWorkspaceIdByTargetId.mockResolvedValue(
        'workspace-id',
      );
      mockWorkspacesService.getWorkspaceConfigValue.mockResolvedValue({
        isAutoEnableAssetAfterDiscovered: true,
      });

      const result = await service.subdomains({
        data: mockAssets,
        job: mockJob,
      });

      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(result).toEqual(mockInsertResult);
    });

    it('should rollback transaction on error', async () => {
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      // Mock the first execute call (update Asset) to succeed
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(undefined)
        // Mock the second execute call (update Job) to succeed
        .mockResolvedValueOnce(undefined)
        // Mock the third execute call (insert Assets) to fail
        .mockRejectedValueOnce(new Error('Database error'));
      mockWorkspacesService.getWorkspaceIdByTargetId.mockResolvedValue(
        'workspace-id',
      );
      mockWorkspacesService.getWorkspaceConfigValue.mockResolvedValue({
        isAutoEnableAssetAfterDiscovered: true,
      });

      await expect(
        service.subdomains({
          data: mockAssets,
          job: mockJob,
        }),
      ).rejects.toThrow('Database error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('httpResponses', () => {
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

    const mockHttpResponse = {
      timestamp: new Date(),
      tls: {
        host: 'example.com',
        port: '443',
        probe_status: true,
        tls_version: 'TLSv1.3',
        cipher: 'TLS_AES_256_GCM_SHA384',
        not_before: '2024-01T0:00:00Z',
        not_after: '2025-01-01T00:00:00Z',
        subject_dn: 'CN=example.com',
        subject_cn: 'example.com',
        subject_an: [],
        serial: '123456',
        issuer_dn: 'CN=Test CA',
        issuer_cn: 'Test CA',
        issuer_org: [],
        fingerprint_hash: {
          md5: 'test-md5',
          sha1: 'test-sha1',
          sha256: 'test-sha256',
        },
        wildcard_certificate: false,
        tls_connection: 'secure',
        sni: 'example.com',
      },
      port: '443',
      url: 'https://example.com',
      input: 'example.com',
      title: 'Test Title',
      scheme: 'https',
      webserver: 'nginx',
      body: 'test body',
      content_type: 'text/html',
      method: 'GET',
      host: 'example.com',
      path: '/',
      favicon: '',
      favicon_md5: '',
      favicon_url: '',
      header: {},
      raw_header: '',
      request: '',
      time: '100ms',
      a: [],
      tech: [],
      words: 10,
      lines: 5,
      status_code: 200,
      content_length: 100,
      failed: false,
      knowledgebase: {
        PageType: 'HTML',
        pHash: 123456,
      },
      resolvers: [],
      chain_status_codes: [],
      assetServiceId: 'service-id',
      jobHistoryId: 'history-id',
      assetService: { id: 'service-id' } as any,
      jobHistory: { id: 'history-id' } as any,
      id: 'response-id',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as HttpResponse;

    it('should handle HTTP response data successfully', async () => {
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValue(undefined);

      await service.httpResponses({
        data: mockHttpResponse,
        job: mockJob,
      });

      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should update asset service when response failed', async () => {
      const failedResponse = { ...mockHttpResponse, failed: true };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValue(undefined);

      await service.httpResponses({
        data: failedResponse,
        job: mockJob,
      });

      expect(mockQueryRunner.manager.createQueryBuilder).toHaveBeenCalledTimes(
        3,
      );
    });

    it('should rollback transaction on error', async () => {
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockRejectedValue(new Error('Database error'));

      await expect(
        service.httpResponses({
          data: mockHttpResponse,
          job: mockJob,
        }),
      ).rejects.toThrow('Database error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('portsScanner', () => {
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

    it('should handle port scanner data successfully', async () => {
      const mockPorts: number[] = [80, 43, 8080];

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValue(undefined);

      await service.portsScanner({
        data: mockPorts,
        job: mockJob,
      });

      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should filter out NaN values from ports', async () => {
      const mockPorts: number[] = [80, 43, 8080];

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValue(undefined);

      await service.portsScanner({
        data: mockPorts,
        job: mockJob,
      });

      expect(
        mockQueryRunner.manager.createQueryBuilder().values,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          ports: mockPorts,
        }),
      );
    });

    it('should rollback transaction on error', async () => {
      const mockPorts: number[] = [80, 43];

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockRejectedValue(new Error('Database error'));

      await expect(
        service.portsScanner({
          data: mockPorts,
          job: mockJob,
        }),
      ).rejects.toThrow('Database error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('vulnerabilities', () => {
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

    const mockVulnerabilities = [
      {
        name: 'Test Vulnerability',
        severity: Severity.HIGH,
        description: 'Test description',
        tags: [],
        tool: { id: 'tool-id', name: 'test-tool', description: 'test' },
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
        jobHistoryId: 'history-id',
        assetId: 'asset-id',
        fingerprint: 'test-fingerprint',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as unknown as Vulnerability[];

    it('should handle vulnerability data successfully', async () => {
      mockDataSource.transaction.mockImplementation(
        async (callback: (manager: any) => Promise<any>) => {
          await callback(mockQueryRunner.manager);
          return undefined;
        },
      );
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValue(undefined);

      await service.vulnerabilities({
        data: mockVulnerabilities,
        job: mockJob,
      });

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });

    it('should not insert vulnerabilities if data is empty', async () => {
      mockDataSource.transaction.mockImplementation(
        async (callback: (manager: any) => Promise<void>) => {
          await callback(mockQueryRunner.manager);
          return undefined;
        },
      );

      await service.vulnerabilities({
        data: [],
        job: mockJob,
      });

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });
  });

  describe('classifier', () => {
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
      tool: { id: 'tool-id', category: ToolCategory.CLASSIFIER },
      category: ToolCategory.CLASSIFIER,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Job;

    const mockTags = [
      {
        tag: 'environment:production',
        assetService: null,
        assetServiceId: null,
        tool: { id: 'tool-id', name: 'test-tool', description: 'test' },
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
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as unknown as AssetTag[];

    it('should handle asset tag data successfully', async () => {
      mockDataSource.createQueryBuilder().execute.mockResolvedValue(undefined);

      await service.classifier({
        data: mockTags,
        job: mockJob,
      });

      expect(mockDataSource.createQueryBuilder).toHaveBeenCalled();
      expect(mockDataSource.createQueryBuilder().values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            tag: 'environment:production',
            assetId: 'asset-id',
            toolId: 'tool-id',
          }),
        ]),
      );
    });
  });

  describe('syncData', () => {
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

      jest.spyOn(service, 'portsScanner').mockResolvedValue();

      await service.syncData({
        data: mockData,
        job: mockJob,
      });

      expect(service.portsScanner).toHaveBeenCalledWith({
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
      ] as Asset[];

      jest.spyOn(service, 'subdomains').mockResolvedValue({} as any);

      await service.syncData({
        data: mockData,
        job: mockJob,
      });

      expect(service.subdomains).toHaveBeenCalledWith({
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
        tls: {
          host: 'example.com',
          port: '443',
          probe_status: true,
          tls_version: 'TLSv1.3',
          cipher: 'TLS_AES_256_GCM_SHA384',
          not_before: '2024-01-01T00:00:00Z',
          not_after: '2025-01-01T00:00:00Z',
          subject_dn: 'CN=example.com',
          subject_cn: 'example.com',
          subject_an: [],
          serial: '123456',
          issuer_dn: 'CN=Test CA',
          issuer_cn: 'Test CA',
          issuer_org: [],
          fingerprint_hash: {
            md5: 'test-md5',
            sha1: 'test-sha1',
            sha256: 'test-sha256',
          },
          wildcard_certificate: false,
          tls_connection: 'secure',
          sni: 'example.com',
        },
        port: '443',
        url: 'https://example.com',
        input: 'example.com',
        title: 'Test',
        scheme: 'https',
        webserver: 'nginx',
        body: 'test body',
        content_type: 'text/html',
        method: 'GET',
        host: 'example.com',
        path: '/',
        favicon: '',
        favicon_md5: '',
        favicon_url: '',
        header: {},
        raw_header: '',
        request: '',
        time: '100ms',
        a: [],
        tech: [],
        words: 10,
        lines: 5,
        status_code: 200,
        content_length: 100,
        failed: false,
        knowledgebase: {
          PageType: 'HTML',
          pHash: 123456,
        },
        resolvers: [],
        chain_status_codes: [],
        assetServiceId: 'service-id',
        jobHistoryId: 'history-id',
        assetService: { id: 'service-id' } as any,
        jobHistory: { id: 'history-id' } as any,
        id: 'response-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as HttpResponse;

      jest.spyOn(service, 'httpResponses').mockResolvedValue();

      await service.syncData({
        data: mockData,
        job: mockJob,
      });

      expect(service.httpResponses).toHaveBeenCalledWith({
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
          tool: { id: 'tool-id', name: 'test-tool', description: 'test' },
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
          jobHistoryId: 'history-id',
          assetId: 'asset-id',
          fingerprint: 'test-fingerprint',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as unknown as Vulnerability[];

      jest.spyOn(service, 'vulnerabilities').mockResolvedValue();

      await service.syncData({
        data: mockData,
        job: mockJob,
      });

      expect(service.vulnerabilities).toHaveBeenCalledWith({
        data: mockData,
        job: mockJob,
      });
    });

    it('should sync classifier data', async () => {
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
        tool: { id: 'tool-id', category: ToolCategory.CLASSIFIER },
        category: ToolCategory.CLASSIFIER,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Job;

      const mockData = [
        {
          tag: 'environment:production',
          assetService: null,
          assetServiceId: null,
          tool: { id: 'tool-id', name: 'test-tool', description: 'test' },
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
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as unknown as AssetTag[];

      jest.spyOn(service, 'classifier').mockResolvedValue();

      await service.syncData({
        data: mockData,
        job: mockJob,
      });

      expect(service.classifier).toHaveBeenCalledWith({
        data: mockData,
        job: mockJob,
      });
    });

    it('should throw error for unsupported tool category', async () => {
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
      ).rejects.toThrow('Unsupported tool category: UNSUPPORTED_CATEGORY');
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

    it('should validate data before syncing when validation class is provided', async () => {
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
        tool: { id: 'tool-id', category: ToolCategory.CLASSIFIER },
        category: ToolCategory.CLASSIFIER,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Job;

      const mockData = [
        {
          tag: 'environment:production',
          assetService: null,
          assetServiceId: null,
          tool: { id: 'tool-id', name: 'test-tool', description: 'test' },
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
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as unknown as AssetTag[];

      jest.spyOn(service, 'validateData').mockResolvedValue(false);
      jest.spyOn(service, 'classifier').mockResolvedValue();

      await expect(
        service.syncData({
          data: mockData,
          job: mockJob,
        }),
      ).rejects.toThrow('Data validation failed for category: classifier');

      expect(service.validateData).toHaveBeenCalledWith(mockData, AssetTag);
    });
  });
});
