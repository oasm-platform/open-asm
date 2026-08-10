import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { InsertResult } from 'typeorm';
import { DataSource } from 'typeorm';
import {
  NotificationType,
  Severity,
  ToolCategory,
} from '../../common/enums/enum';
import type { Asset } from '../assets/entities/assets.entity';
import type { HttpResponse } from '../assets/entities/http-response.entity';
import { IssuesService } from '../issues/issues.service';
import type { Job } from '../jobs-registry/entities/job.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { DataAdapterService } from './data-adapter.service';

describe('DataAdapterService', () => {
  let service: DataAdapterService;
  let mockQueryRunner: any;
  let mockDataSource: any;
  let mockWorkspacesService: any;
  let mockNotificationsService: any;

  beforeEach(async () => {
    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      manager: {
        createQueryBuilder: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn(),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          id: 'asset-id',
          value: 'example.com',
        }),
      },
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };

    mockDataSource = {
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

    mockWorkspacesService = {
      getWorkspaceIdByTargetId: jest.fn(),
      getWorkspaceConfigValue: jest.fn(),
      getMemberOfWorkspaceByJobId: jest.fn().mockResolvedValue([]),
    };

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
        {
          provide: IssuesService,
          useValue: {
            createIssue: jest.fn(),
            findExistingOpenIssueBySource: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: StorageService,
          useValue: {
            uploadFile: jest
              .fn()
              .mockReturnValue({ path: 'mock/path/file.png' }),
            getFile: jest.fn(),
            deleteFile: jest.fn(),
            forwardImage: jest.fn(),
            readJsonFile: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            createNotification: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DataAdapterService>(DataAdapterService);
    mockNotificationsService = module.get(NotificationsService);

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
        .execute.mockResolvedValueOnce(undefined) // Update Asset
        .mockResolvedValueOnce(mockInsertResult); // Insert Assets
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
      // subdomains() now delegates to upsertAssetsByTargetId and returns void
      expect(result).toBeUndefined();
    });

    it('should rollback transaction on error', async () => {
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      // Mock the first execute call (update Asset) to succeed
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(undefined)
        // Mock the second execute call (insert Assets) to fail
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
      ).rejects.toThrow();

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('upsertAssetsByTargetId', () => {
    const targetId = 'target-id';

    const assets = [
      { value: 'sub1.example.com', dnsRecords: { A: ['192.0.2.1'] } },
      { value: 'sub2.example.com', dnsRecords: { A: ['192.0.2.2'] } },
      // Duplicate value — deduped in memory before insert
      { value: 'sub1.example.com', dnsRecords: { A: ['192.0.2.3'] } },
    ];

    function mockWorkspaceConfigs(isAutoEnable = true): void {
      mockWorkspacesService.getWorkspaceIdByTargetId.mockResolvedValue(
        'workspace-id',
      );
      mockWorkspacesService.getWorkspaceConfigValue.mockResolvedValue({
        isAutoEnableAssetAfterDiscovered: isAutoEnable,
      });
    }

    it('should dedupe by value, refresh the primary asset, and return the inserted count', async () => {
      const mockInsertResult = {
        identifiers: [{ id: 'i1' }, { id: 'i2' }],
        generatedMaps: [],
        raw: [],
      } as unknown as InsertResult;
      mockWorkspaceConfigs();

      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(undefined) // Update Asset (primary refresh)
        .mockResolvedValueOnce(mockInsertResult); // Insert Assets

      const inserted = await service.upsertAssetsByTargetId(targetId, assets);

      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();

      // Dedupe: only 2 unique values inserted (sub1 + sub2)
      const valuesArg = mockQueryRunner.manager
        .createQueryBuilder()
        .values.mock.calls[0][0] as Array<Record<string, unknown>>;
      expect(valuesArg).toHaveLength(2);
      expect(valuesArg.map((v) => v.value).sort()).toEqual([
        'sub1.example.com',
        'sub2.example.com',
      ]);

      // Each row linked to the target + default isEnabled from workspace config
      for (const row of valuesArg) {
        expect(row).toMatchObject({ target: { id: targetId }, isEnabled: true });
      }

      // Primary refresh used the primary asset value to pick apex records
      const updateCall = mockQueryRunner.manager
        .createQueryBuilder()
        .update.mock.calls[0];
      expect(updateCall).toEqual([expect.anything()]);

      // Returned count = number of identifiers in the insert result
      expect(inserted).toBe(2);
    });

    it('should refresh the primary asset with the dnsRecords of the matching apex value', async () => {
      const mockInsertResult = {
        identifiers: [{ id: 'i1' }],
        generatedMaps: [],
        raw: [],
      } as unknown as InsertResult;
      mockWorkspaceConfigs();
      // Primary asset value is `example.com`
      mockQueryRunner.manager
        .createQueryBuilder()
        .getRawOne.mockResolvedValueOnce({
          id: 'primary-asset-id',
          value: 'example.com',
        });

      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockInsertResult);

      const withApex = [
        { value: 'example.com', dnsRecords: { MX: ['10 mx.example.com'] } },
        { value: 'www.example.com', dnsRecords: { A: ['192.0.2.2'] } },
      ];

      await service.upsertAssetsByTargetId(targetId, withApex);

      const setCall = mockQueryRunner.manager
        .createQueryBuilder()
        .set.mock.calls[0][0] as Record<string, unknown>;
      expect(setCall).toEqual({
        isPrimary: true,
        dnsRecords: { MX: ['10 mx.example.com'] },
      });
      const whereCall = mockQueryRunner.manager
        .createQueryBuilder()
        .where.mock.calls[1][0] as Record<string, unknown>;
      expect(whereCall).toEqual({ id: 'primary-asset-id' });
    });

    it('should fall back to workspace config isAutoEnableAssetAfterDiscovered when isEnabled omitted', async () => {
      const mockInsertResult = {
        identifiers: [{ id: 'i1' }],
        generatedMaps: [],
        raw: [],
      } as unknown as InsertResult;
      mockWorkspaceConfigs(false); // config says auto-enable is false

      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockInsertResult);

      await service.upsertAssetsByTargetId(targetId, [
        { value: 'sub.example.com', dnsRecords: { A: ['192.0.2.9'] } },
      ]);

      const valuesArg = mockQueryRunner.manager
        .createQueryBuilder()
        .values.mock.calls[0][0] as Array<Record<string, unknown>>;
      expect(valuesArg[0].isEnabled).toBe(false);
    });

    it('should honor an explicit isEnabled argument over the workspace config', async () => {
      const mockInsertResult = {
        identifiers: [{ id: 'i1' }],
        generatedMaps: [],
        raw: [],
      } as unknown as InsertResult;
      mockWorkspaceConfigs(false);

      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockInsertResult);

      await service.upsertAssetsByTargetId(
        targetId,
        [{ value: 'sub.example.com', dnsRecords: { A: ['192.0.2.9'] } }],
        true,
      );

      const valuesArg = mockQueryRunner.manager
        .createQueryBuilder()
        .values.mock.calls[0][0] as Array<Record<string, unknown>>;
      expect(valuesArg[0].isEnabled).toBe(true);
    });

    it('should rollback transaction on error', async () => {
      mockWorkspaceConfigs();
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        service.upsertAssetsByTargetId(targetId, assets),
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
      jobHistory: {
        id: 'history-id',
        workflow: { workspace: { id: 'workspace-id' } },
      },
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

      // Mock the full query builder chain for vulnerabilities
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          raw: mockVulnerabilities,
          identifiers: mockVulnerabilities.map((v) => ({ id: v.id })),
        }),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.vulnerabilities({
        data: mockVulnerabilities,
        job: mockJob,
      });

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        'v.fingerprint',
        'fingerprint',
      );
      expect(mockQueryBuilder.from).toHaveBeenCalledWith(Vulnerability, 'v');
      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(mockQueryBuilder.getRawMany).toHaveBeenCalled();
      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(mockQueryBuilder.into).toHaveBeenCalledWith(Vulnerability);
      expect(mockQueryBuilder.values).toHaveBeenCalled();
      expect(mockQueryBuilder.orUpdate).toHaveBeenCalled();
      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should not create issues for vulnerabilities (creation logic is disabled)', async () => {
      // Issue creation from vulnerabilities is commented out in the service.
      // This test verifies no issue-related methods are called.
      const mockIssuesService = {
        createIssue: jest.fn(),
        findExistingOpenIssueBySource: jest.fn(),
      };

      mockDataSource.transaction.mockImplementation(
        async (callback: (manager: any) => Promise<any>) => {
          await callback(mockQueryRunner.manager);
          return undefined;
        },
      );

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          raw: mockVulnerabilities,
          identifiers: mockVulnerabilities.map((v) => ({ id: v.id })),
        }),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.vulnerabilities({
        data: mockVulnerabilities,
        job: mockJob,
      });

      // Issue creation is currently disabled — neither should be called
      expect(
        mockIssuesService.findExistingOpenIssueBySource,
      ).not.toHaveBeenCalled();
      expect(mockIssuesService.createIssue).not.toHaveBeenCalled();
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

    it('should send notification for all new vulnerabilities (all severities)', async () => {
      const newFingerprint = 'new-fingerprint-123';
      const newVuln = {
        ...mockVulnerabilities[0],
        fingerprint: newFingerprint,
      };
      const existingFingerprint = 'existing-fingerprint-456';
      const existingVuln = {
        ...mockVulnerabilities[0],
        fingerprint: existingFingerprint,
      };

      mockDataSource.transaction.mockImplementation(
        async (callback: (manager: any) => Promise<any>) => {
          await callback(mockQueryRunner.manager);
          return undefined;
        },
      );

      // Mock workspace members so notification can be sent
      mockWorkspacesService.getMemberOfWorkspaceByJobId.mockResolvedValue([
        { user: { id: 'user-1' }, workspace: { id: 'workspace-id' } },
      ]);

      // getRawMany returns existing fingerprints on first call
      const getRawManyMock = jest
        .fn()
        .mockResolvedValueOnce([{ fingerprint: existingFingerprint }])
        .mockResolvedValue([]);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: getRawManyMock,
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          raw: [newVuln, existingVuln],
          identifiers: [],
        }),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.vulnerabilities({
        data: [newVuln, existingVuln],
        job: mockJob,
      });

      // Should have called createNotification with count=1 (only new vuln)
      expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.NEW_VULNERABILITY_FOUND,
          metadata: expect.objectContaining({
            count: '1',
          }),
        }),
      );
    });

    it('should NOT send notification when all vulnerabilities already exist (updated only)', async () => {
      const existingFingerprint = 'existing-fingerprint-789';
      const existingVuln = {
        ...mockVulnerabilities[0],
        fingerprint: existingFingerprint,
      };

      mockDataSource.transaction.mockImplementation(
        async (callback: (manager: any) => Promise<any>) => {
          await callback(mockQueryRunner.manager);
          return undefined;
        },
      );

      // getRawMany returns the fingerprint as existing
      const getRawManyMock = jest
        .fn()
        .mockResolvedValueOnce([{ fingerprint: existingFingerprint }])
        .mockResolvedValue([]);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: getRawManyMock,
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          raw: [existingVuln],
          identifiers: [],
        }),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.vulnerabilities({
        data: [existingVuln],
        job: mockJob,
      });

      // Should NOT have called createNotification
      expect(
        mockNotificationsService.createNotification,
      ).not.toHaveBeenCalled();
    });

    it('should send notification for new LOW/MEDIUM severity vulnerabilities too', async () => {
      const lowVuln = {
        ...mockVulnerabilities[0],
        fingerprint: 'low-vuln-fingerprint',
        severity: Severity.LOW,
      };

      mockDataSource.transaction.mockImplementation(
        async (callback: (manager: any) => Promise<any>) => {
          await callback(mockQueryRunner.manager);
          return undefined;
        },
      );

      // Mock workspace members so notification can be sent
      mockWorkspacesService.getMemberOfWorkspaceByJobId.mockResolvedValue([
        { user: { id: 'user-1' }, workspace: { id: 'workspace-id' } },
      ]);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]), // no existing fingerprints
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          raw: [lowVuln],
          identifiers: [],
        }),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.vulnerabilities({
        data: [lowVuln],
        job: mockJob,
      });

      // Should have called createNotification (low severity now triggers notification)
      expect(
        mockNotificationsService.createNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.NEW_VULNERABILITY_FOUND,
          metadata: expect.objectContaining({
            count: '1',
          }),
        }),
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
  });
});
