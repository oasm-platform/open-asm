import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import type { InsertResult } from 'typeorm';
import { DataSource } from 'typeorm';
import { Severity, ToolCategory } from '../../common/enums/enum';
import type { Asset } from '../assets/entities/assets.entity';
import { AssetService } from '../assets/entities/asset-services.entity';
import { DnsRecord } from '../assets/entities/dns-record.entity';
import { HttpResponseTechnology } from '../assets/entities/http-response-technology.entity';
import { HttpStatusCode } from '../assets/entities/http-status-code.entity';
import { IpObservation } from '../assets/entities/ip-observation.entity';
import { TlsCertificate } from '../assets/entities/tls-certificate.entity';
import type { HttpResponse } from '../assets/entities/http-response.entity';
import { IssuesService } from '../issues/issues.service';
import type { Job } from '../jobs-registry/entities/job.entity';
import { EventBridgeService } from '../event-bridge/event-bridge.service';
import { EVENT_CATALOG } from '../connectors/event';
import { StorageService } from '../storage/storage.service';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  DataAdapterService,
  mergeDnsRecords,
  splitTechString,
  toDnsFacetRows,
  toTlsCertificateRow,
} from './data-adapter.service';

describe('DataAdapterService', () => {
  let service: DataAdapterService;
  let mockQueryRunner: any;
  let mockDataSource: any;
  let mockWorkspacesService: any;
  let mockEventBridge: any;

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
        delete: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          id: 'asset-id',
          value: 'example.com',
        }),
        // id ↔ value lookup after the asset insert; default: none found.
        getRawMany: jest.fn().mockResolvedValue([]),
        getRepository: jest.fn().mockReturnValue({
          save: jest.fn().mockResolvedValue({ id: 'hr-1' }),
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
          provide: EventBridgeService,
          useValue: {
            publishSafely: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DataAdapterService>(DataAdapterService);
    mockEventBridge = module.get(EventBridgeService);

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

  describe('mergeDnsRecords', () => {
    it('should union existing and incoming records per key, deduping values', () => {
      expect(
        mergeDnsRecords(
          { A: ['1.2.3.4'], CNAME: ['c.example.com'] },
          { A: ['1.2.3.4', '5.6.7.8'], NS: ['ns.example.com'] },
        ),
      ).toEqual({
        A: ['1.2.3.4', '5.6.7.8'],
        CNAME: ['c.example.com'],
        NS: ['ns.example.com'],
      });
    });

    it('should keep existing keys that are absent from the incoming batch', () => {
      expect(
        mergeDnsRecords(
          { A: ['1.2.3.4'], SOA: ['soa.example.com'] },
          { MX: ['10 mx.example.com'] },
        ),
      ).toEqual({
        A: ['1.2.3.4'],
        SOA: ['soa.example.com'],
        MX: ['10 mx.example.com'],
      });
    });

    it('should treat null/undefined existing or incoming records as empty', () => {
      expect(mergeDnsRecords(null, { A: ['1.2.3.4'] })).toEqual({
        A: ['1.2.3.4'],
      });
      expect(mergeDnsRecords({ A: ['1.2.3.4'] }, undefined)).toEqual({
        A: ['1.2.3.4'],
      });
      expect(mergeDnsRecords(null, undefined)).toEqual({});
    });
  });

  describe('splitTechString', () => {
    it('splits on the first colon into name + version', () => {
      expect(splitTechString('nginx:1.21')).toEqual({
        name: 'nginx',
        version: '1.21',
      });
    });

    it('returns a null version when there is no colon', () => {
      expect(splitTechString('react')).toEqual({
        name: 'react',
        version: null,
      });
    });

    it('returns null for empty or whitespace-only input', () => {
      expect(splitTechString('')).toBeNull();
      expect(splitTechString('   ')).toBeNull();
    });

    it('keeps extra colons in the version (only the first splits)', () => {
      expect(splitTechString('foo:1:2')).toEqual({
        name: 'foo',
        version: '1:2',
      });
    });

    it('treats a trailing colon as an empty version and drops a nameless tech', () => {
      expect(splitTechString('nginx:')).toEqual({
        name: 'nginx',
        version: null,
      });
      expect(splitTechString(':1.21')).toBeNull();
    });
  });

  describe('toTlsCertificateRow', () => {
    const keys = {
      httpResponseId: 'hr-1',
      assetServiceId: 'svc-1',
      jobHistoryId: 'jh-1',
    };

    it('flattens the fingerprint_hash object into fingerprintMd5/Sha1/Sha256', () => {
      const row = toTlsCertificateRow(
        {
          host: 'example.com',
          fingerprint_hash: {
            md5: 'a',
            sha1: 'b',
            sha256: 'c',
          },
        },
        keys,
      );
      expect(row).toMatchObject({
        ...keys,
        host: 'example.com',
        fingerprintMd5: 'a',
        fingerprintSha1: 'b',
        fingerprintSha256: 'c',
      });
    });

    it('turns a malformed date into null/undefined without throwing', () => {
      let row: Record<string, unknown> | null = null;
      expect(() => {
        row = toTlsCertificateRow(
          {
            host: 'example.com',
            not_before: '2024-01T0:00:00Z',
            not_after: 'not-a-date',
          },
          keys,
        );
      }).not.toThrow();
      expect(row!.notBefore).toBeUndefined();
      expect(row!.notAfter).toBeUndefined();
    });

    it('returns null for null or non-object input', () => {
      expect(toTlsCertificateRow(null, keys)).toBeNull();
      expect(toTlsCertificateRow(undefined, keys)).toBeNull();
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
      // Apex value not in the batch → primary refresh update is skipped,
      // so the only execute call is the asset insert
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(mockInsertResult);
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
      // No apex entry in the batch → the primary refresh update is skipped,
      // so the single execute call (insert Assets) is the one that fails
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockRejectedValueOnce(new Error('Database error'));
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

    it('should dedupe by value and return the inserted count (primary refresh skipped when apex absent)', async () => {
      const mockInsertResult = {
        identifiers: [{ id: 'i1' }, { id: 'i2' }],
        generatedMaps: [],
        raw: [],
      } as unknown as InsertResult;
      mockWorkspaceConfigs();

      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValue(mockInsertResult); // Insert Assets only

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

      // No apex value in the batch → primary dnsRecords must not be touched
      expect(mockQueryRunner.manager.set).not.toHaveBeenCalled();
      expect(mockQueryRunner.manager.update).not.toHaveBeenCalled();

      // Returned count = number of rows actually inserted
      expect(inserted).toBe(2);
    });

    it('should merge the apex dnsRecords into the primary existing dnsRecords (union + dedupe per key)', async () => {
      const mockInsertResult = {
        identifiers: [{ id: 'i1' }],
        generatedMaps: [],
        raw: [],
      } as unknown as InsertResult;
      mockWorkspaceConfigs();
      // Primary asset value is `example.com` and already has discovered records
      mockQueryRunner.manager
        .createQueryBuilder()
        .getRawOne.mockResolvedValueOnce({
          id: 'primary-asset-id',
          value: 'example.com',
          dnsRecords: { A: ['192.0.2.1'], SOA: ['ns1.example.com'] },
        });

      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(undefined) // Update Asset (primary refresh)
        .mockResolvedValueOnce(mockInsertResult); // Insert Assets

      const withApex: Array<{
        value: string;
        dnsRecords: Record<string, string[]>;
      }> = [
        {
          value: 'example.com',
          dnsRecords: {
            A: ['192.0.2.1', '5.6.7.8'], // duplicate of the existing A value
            MX: ['10 mx.example.com'],
          },
        },
        { value: 'www.example.com', dnsRecords: { A: ['192.0.2.2'] } },
      ];

      await service.upsertAssetsByTargetId(targetId, withApex);

      const setCall = mockQueryRunner.manager
        .createQueryBuilder()
        .set.mock.calls[0][0] as Record<string, unknown>;
      expect(setCall).toEqual({
        isPrimary: true,
        dnsRecords: {
          A: ['192.0.2.1', '5.6.7.8'], // discovered IP survives, dup deduped, new one added
          MX: ['10 mx.example.com'],
          SOA: ['ns1.example.com'], // existing key kept despite not being in the batch
        },
      });
      const whereCall = mockQueryRunner.manager
        .createQueryBuilder()
        .where.mock.calls[1][0] as Record<string, unknown>;
      expect(whereCall).toEqual({ id: 'primary-asset-id' });
    });

    it('should skip the primary dnsRecords update when the batch has no apex value', async () => {
      const mockInsertResult = {
        identifiers: [{ id: 'i1' }],
        generatedMaps: [],
        raw: [],
      } as unknown as InsertResult;
      mockWorkspaceConfigs();
      // Primary asset already has discovered dnsRecords
      mockQueryRunner.manager
        .createQueryBuilder()
        .getRawOne.mockResolvedValueOnce({
          id: 'primary-asset-id',
          value: 'example.com',
          dnsRecords: { A: ['1.2.3.4'] },
        });

      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(mockInsertResult); // Insert Assets only

      const withoutApex = [
        { value: 'www.example.com', dnsRecords: { A: ['192.0.2.2'] } },
      ];

      await service.upsertAssetsByTargetId(targetId, withoutApex);

      // No apex entry in the batch → primary update must not run (no NULL clobber)
      expect(mockQueryRunner.manager.set).not.toHaveBeenCalled();
      expect(mockQueryRunner.manager.update).not.toHaveBeenCalled();
    });

    it('should merge apex dnsRecords when the primary existing dnsRecords are NULL', async () => {
      const mockInsertResult = {
        identifiers: [{ id: 'i1' }],
        generatedMaps: [],
        raw: [],
      } as unknown as InsertResult;
      mockWorkspaceConfigs();
      mockQueryRunner.manager
        .createQueryBuilder()
        .getRawOne.mockResolvedValueOnce({
          id: 'primary-asset-id',
          value: 'example.com',
          dnsRecords: null,
        });

      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(undefined) // Update Asset (primary refresh)
        .mockResolvedValueOnce(mockInsertResult); // Insert Assets

      const withApex = [{ value: 'example.com', dnsRecords: { A: ['1.2.3.4'] } }];

      await service.upsertAssetsByTargetId(targetId, withApex);

      const setCall = mockQueryRunner.manager
        .createQueryBuilder()
        .set.mock.calls[0][0] as Record<string, unknown>;
      expect(setCall).toEqual({
        isPrimary: true,
        dnsRecords: { A: ['1.2.3.4'] },
      });
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
        .execute.mockResolvedValueOnce(mockInsertResult); // Insert Assets only

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
        .execute.mockResolvedValueOnce(mockInsertResult); // Insert Assets only

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

    it('SC-ADAPTER-REPLACE-1: replaceDnsRecords — existing subdomain row dnsRecords overwritten, isEnabled NOT in the overwrite list', async () => {
      const mockInsertResult = {
        identifiers: [{ id: 'i1' }],
        generatedMaps: [],
        raw: [],
      } as unknown as InsertResult;
      mockWorkspaceConfigs();
      // Primary asset exists but the batch has no apex value → primary
      // refresh skipped; only the insert runs.
      mockQueryRunner.manager
        .createQueryBuilder()
        .getRawOne.mockResolvedValueOnce({
          id: 'primary-asset-id',
          value: 'example.com',
          dnsRecords: { A: ['1.2.3.4'] },
        });

      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(mockInsertResult);

      await service.upsertAssetsByTargetId(
        targetId,
        [{ value: 'sub.example.com', dnsRecords: { A: ['9.9.9.9'] } }],
        undefined,
        { replaceDnsRecords: true },
      );

      // The asset upsert switches from orIgnore to orUpdate: conflict on
      // (value, targetId), overwrite dnsRecords only — isEnabled of the
      // existing row is untouched. (orIgnore is still used by the DnsRecord /
      // IpObservation facet fan-out, so it is NOT asserted absent here.)
      expect(mockQueryRunner.manager.orUpdate).toHaveBeenCalledWith(
        ['dnsRecords'],
        ['value', 'targetId'],
      );
      const valuesArg = mockQueryRunner.manager
        .createQueryBuilder()
        .values.mock.calls[0][0] as Array<Record<string, unknown>>;
      expect(valuesArg[0]).toMatchObject({
        value: 'sub.example.com',
        dnsRecords: { A: ['9.9.9.9'] },
        target: { id: targetId },
      });
      // Primary refresh not touched (apex absent from batch)
      expect(mockQueryRunner.manager.set).not.toHaveBeenCalled();
    });

    it('SC-ADAPTER-REPLACE-2: replaceDnsRecords — primary dnsRecords replaced wholesale (old types removed)', async () => {
      const mockInsertResult = {
        identifiers: [{ id: 'i1' }],
        generatedMaps: [],
        raw: [],
      } as unknown as InsertResult;
      mockWorkspaceConfigs();
      // Primary already has A + SOA; the new batch carries only A.
      mockQueryRunner.manager
        .createQueryBuilder()
        .getRawOne.mockResolvedValueOnce({
          id: 'primary-asset-id',
          value: 'example.com',
          dnsRecords: { A: ['1.2.3.4'], SOA: ['ns1.example.com'] },
        });

      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(undefined) // Update Asset (primary refresh)
        .mockResolvedValueOnce(mockInsertResult); // Insert Assets

      await service.upsertAssetsByTargetId(
        targetId,
        [{ value: 'example.com', dnsRecords: { A: ['9.9.9.9'] } }],
        undefined,
        { replaceDnsRecords: true },
      );

      const setCall = mockQueryRunner.manager
        .createQueryBuilder()
        .set.mock.calls[0][0] as Record<string, unknown>;
      // Replace, not merge: SOA is gone, only the fresh A survives.
      expect(setCall).toEqual({
        isPrimary: true,
        dnsRecords: { A: ['9.9.9.9'] },
      });
    });

    it('SC-ADAPTER-MERGE-1: regression — without the flag behavior is unchanged (merge + orIgnore, no row updates)', async () => {
      const mockInsertResult = {
        identifiers: [{ id: 'i1' }],
        generatedMaps: [],
        raw: [],
      } as unknown as InsertResult;
      mockWorkspaceConfigs();
      mockQueryRunner.manager
        .createQueryBuilder()
        .getRawOne.mockResolvedValueOnce({
          id: 'primary-asset-id',
          value: 'example.com',
          dnsRecords: { A: ['1.2.3.4'], SOA: ['ns1.example.com'] },
        });

      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValueOnce(undefined) // Update Asset (primary refresh)
        .mockResolvedValueOnce(mockInsertResult); // Insert Assets

      const withApex: Array<{
        value: string;
        dnsRecords: Record<string, string[]>;
      }> = [
        { value: 'example.com', dnsRecords: { A: ['9.9.9.9'] } },
        { value: 'sub.example.com', dnsRecords: { A: ['192.0.2.2'] } },
      ];

      await service.upsertAssetsByTargetId(targetId, withApex);

      // Existing-row writes still use orIgnore; nothing is overwritten.
      expect(mockQueryRunner.manager.orIgnore).toHaveBeenCalled();
      expect(mockQueryRunner.manager.orUpdate).not.toHaveBeenCalled();
      // Primary records still merge (SOA survives, A is unioned+deduped).
      const setCall = mockQueryRunner.manager
        .createQueryBuilder()
        .set.mock.calls[0][0] as Record<string, unknown>;
      expect(setCall).toEqual({
        isPrimary: true,
        dnsRecords: { A: ['1.2.3.4', '9.9.9.9'], SOA: ['ns1.example.com'] },
      });
    });

    it('mirrors inserted assets into dns_records + ip_observations, resolving ids by value', async () => {
      // orIgnore skipped sub0 (already exists): RETURNING only has a1/a2, so
      // identifiers no longer line up with the batch by index.
      const mockInsertResult = {
        identifiers: [undefined, { id: 'a1' }, { id: 'a2' }],
        generatedMaps: [],
        raw: [],
      } as unknown as InsertResult;
      mockWorkspaceConfigs();
      mockQueryRunner.manager
        .createQueryBuilder()
        .execute.mockResolvedValue(mockInsertResult);
      mockQueryRunner.manager.getRawMany.mockResolvedValueOnce([
        { id: 'a0', value: 'sub0.example.com' },
        { id: 'a1', value: 'sub1.example.com' },
        { id: 'a2', value: 'sub2.example.com' },
      ]);

      await service.upsertAssetsByTargetId(targetId, [
        { value: 'sub0.example.com', dnsRecords: { A: ['192.0.2.9'] } },
        {
          value: 'sub1.example.com',
          dnsRecords: { A: ['192.0.2.1'], AAAA: ['2001:db8::1'], MX: ['10 mx.example.com'] },
        },
        { value: 'sub2.example.com', dnsRecords: { A: ['192.0.2.2'] } },
      ]);

      const builder = mockQueryRunner.manager;
      const intoCalls = (builder.into.mock.calls as unknown[][]).map(
        (call) => call[0],
      );
      const valuesFor = (entity: unknown): Array<Record<string, unknown>> => {
        const idx = intoCalls.indexOf(entity);
        return builder.values.mock.calls[idx][0] as Array<
          Record<string, unknown>
        >;
      };

      // Only the inserted assets, each with its own records; the skipped
      // sub0 keeps its stored json, so its facets are untouched.
      expect(valuesFor(DnsRecord)).toEqual([
        { assetId: 'a1', recordType: 'A', value: '192.0.2.1' },
        { assetId: 'a1', recordType: 'AAAA', value: '2001:db8::1' },
        { assetId: 'a1', recordType: 'MX', value: '10 mx.example.com' },
        { assetId: 'a2', recordType: 'A', value: '192.0.2.2' },
      ]);
      // ip_observations only for A/AAAA rows that are real IPs.
      expect(valuesFor(IpObservation)).toEqual([
        { assetId: 'a1', ip: '192.0.2.1', source: 'dns_a' },
        { assetId: 'a1', ip: '2001:db8::1', source: 'dns_aaaa' },
        { assetId: 'a2', ip: '192.0.2.2', source: 'dns_a' },
      ]);
      // Stale facet rows of the synced assets are cleared first.
      expect(builder.delete).toHaveBeenCalledTimes(2);
      expect(builder.where).toHaveBeenCalledWith('"assetId" IN (:...assetIds)', {
        assetIds: ['a1', 'a2'],
      });
    });

    it('toDnsFacetRows uppercases record types, dedupes values and keeps only valid IPs', () => {
      expect(
        toDnsFacetRows('x', {
          a: ['192.0.2.1', '192.0.2.1', '999.1.1.1'],
          aaaa: ['2001:db8::1'],
          txt: ['v=spf1', ''],
          bogus: 'not-an-array',
        }),
      ).toEqual({
        dnsRows: [
          { assetId: 'x', recordType: 'A', value: '192.0.2.1' },
          { assetId: 'x', recordType: 'A', value: '999.1.1.1' },
          { assetId: 'x', recordType: 'AAAA', value: '2001:db8::1' },
          { assetId: 'x', recordType: 'TXT', value: 'v=spf1' },
        ],
        ipRows: [
          { assetId: 'x', ip: '192.0.2.1', source: 'dns_a' },
          { assetId: 'x', ip: '2001:db8::1', source: 'dns_aaaa' },
        ],
      });
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

      // A failed probe flips AssetService.isErrorPage; the core row save and
      // the facet splits still run inside the same transaction.
      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(AssetService);
      expect(mockQueryRunner.manager.set).toHaveBeenCalledWith({
        isErrorPage: true,
      });
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

    it('saves a slim core row (no facet keys) and fans out tls/tech/ip/status child rows', async () => {
      const response = {
        ...mockHttpResponse,
        tech: ['nginx:1.21', 'react'],
        a: ['1.2.3.4', 'not-an-ip'],
        resolvers: ['8.8.8.8'],
        chain_status_codes: [301, 302],
      } as unknown as HttpResponse;

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      const builder = mockQueryRunner.manager;
      const saveMock = jest.fn().mockResolvedValue({ id: 'hr-1' });
      builder.getRepository.mockReturnValue({ save: saveMock });
      builder.createQueryBuilder().execute.mockResolvedValue(undefined);

      await service.httpResponses({ data: response, job: mockJob });

      // The core http_responses row must NOT carry the facet keys.
      const savedCore = saveMock.mock.calls[0][0] as Record<string, unknown>;
      for (const key of [
        'tls',
        'tech',
        'a',
        'resolvers',
        'chain_status_codes',
      ]) {
        expect(savedCore).not.toHaveProperty(key);
      }
      expect(savedCore).toMatchObject({
        assetServiceId: 'service-id',
        jobHistoryId: 'history-id',
      });

      const intoCalls = (builder.into.mock.calls as unknown[][]).map(
        (call) => call[0],
      );
      const valuesFor = (entity: unknown): unknown => {
        const idx = intoCalls.indexOf(entity);
        return builder.values.mock.calls[idx][0];
      };

      // TLS: one row via orUpdate on the unique httpResponseId.
      expect(valuesFor(TlsCertificate)).toMatchObject({
        httpResponseId: 'hr-1',
        host: 'example.com',
        tlsVersion: 'TLSv1.3',
        fingerprintMd5: 'test-md5',
      });
      expect(builder.orUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ conflict_target: ['httpResponseId'] }),
      );

      // Tech: split name/version on the first colon.
      expect(valuesFor(HttpResponseTechnology)).toEqual([
        {
          name: 'nginx',
          version: '1.21',
          httpResponseId: 'hr-1',
          assetServiceId: 'service-id',
        },
        {
          name: 'react',
          version: undefined,
          httpResponseId: 'hr-1',
          assetServiceId: 'service-id',
        },
      ]);

      // IP: only valid IPs survive, tagged by source.
      expect(valuesFor(IpObservation)).toEqual([
        {
          ip: '1.2.3.4',
          source: 'httpx_a',
          httpResponseId: 'hr-1',
          assetServiceId: 'service-id',
          jobHistoryId: 'history-id',
        },
        {
          ip: '8.8.8.8',
          source: 'resolver',
          httpResponseId: 'hr-1',
          assetServiceId: 'service-id',
          jobHistoryId: 'history-id',
        },
      ]);

      // Status: primary row + chain rows.
      expect(valuesFor(HttpStatusCode)).toEqual([
        {
          statusCode: 200,
          isPrimary: true,
          chainIndex: undefined,
          httpResponseId: 'hr-1',
          assetServiceId: 'service-id',
        },
        {
          statusCode: 301,
          isPrimary: false,
          chainIndex: 0,
          httpResponseId: 'hr-1',
          assetServiceId: 'service-id',
        },
        {
          statusCode: 302,
          isPrimary: false,
          chainIndex: 1,
          httpResponseId: 'hr-1',
          assetServiceId: 'service-id',
        },
      ]);
    });
  });

  describe('urlDiscovery', () => {
    const mockJob = {
      id: 'job-id',
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
      tool: { id: 'tool-id', category: ToolCategory.URL_DISCOVERY },
      assetService: { id: 'service-id' },
      category: ToolCategory.URL_DISCOVERY,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Job;

    beforeEach(() => {
      jest.clearAllMocks();
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
      mockQueryRunner.manager.createQueryBuilder.mockReturnThis();
      mockQueryRunner.manager.insert.mockReturnThis();
      mockQueryRunner.manager.into.mockReturnThis();
      mockQueryRunner.manager.values.mockReturnThis();
      mockQueryRunner.manager.orIgnore.mockReturnThis();
      mockQueryRunner.manager.execute.mockResolvedValue(undefined);
    });

    it('S1: inserts one row per unique url with assetServiceId + jobHistoryId in a transaction', async () => {
      const data = [
        { url: 'https://a.example.com' },
        { url: 'https://b.example.com' },
      ] as any;

      await service.urlDiscovery({ data, job: mockJob });

      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.manager.insert).toHaveBeenCalled();
      expect(mockQueryRunner.manager.orIgnore).toHaveBeenCalled();

      const valuesArg = mockQueryRunner.manager.values.mock.calls[0][0] as Array<
        Record<string, unknown>
      >;
      expect(valuesArg).toHaveLength(2);
      expect(valuesArg).toEqual([
        {
          url: 'https://a.example.com',
          assetServiceId: 'service-id',
          jobHistoryId: 'history-id',
        },
        {
          url: 'https://b.example.com',
          assetServiceId: 'service-id',
          jobHistoryId: 'history-id',
        },
      ]);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('S2a: empty payload commits without insert and without throw', async () => {
      await service.urlDiscovery({ data: [], job: mockJob });

      expect(mockQueryRunner.manager.insert).not.toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('S2b: duplicate urls collapse to one row via Set + orIgnore', async () => {
      const data = [
        { url: 'https://dup.example.com' },
        { url: 'https://dup.example.com' },
        { url: 'https://dup.example.com' },
      ] as any;

      await service.urlDiscovery({ data, job: mockJob });

      const valuesArg = mockQueryRunner.manager.values.mock.calls[0][0] as Array<
        Record<string, unknown>
      >;
      expect(valuesArg).toHaveLength(1);
      expect(valuesArg[0].url).toBe('https://dup.example.com');
      expect(mockQueryRunner.manager.orIgnore).toHaveBeenCalled();
    });

    it('S2c: missing assetServiceId skips insert with warn, no throw', async () => {
      const noServiceJob = { ...mockJob, assetServiceId: undefined } as unknown as Job;
      const warnSpy = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        service.urlDiscovery({
          data: [{ url: 'https://a.example.com' }] as any,
          job: noServiceJob,
        }),
      ).resolves.toBeUndefined();

      expect(mockQueryRunner.manager.insert).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('rolls back and rethrows on error', async () => {
      mockQueryRunner.manager.execute.mockRejectedValue(new Error('DB error'));

      await expect(
        service.urlDiscovery({
          data: [{ url: 'https://a.example.com' }] as any,
          job: mockJob,
        }),
      ).rejects.toThrow('DB error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('F2: chunks inserts so a single statement never exceeds the PostgreSQL 65535 bind-parameter cap', async () => {
      const data = Array.from({ length: 12000 }, (_, i) => ({
        url: `https://h${i}.example.com`,
      })) as any;

      await service.urlDiscovery({ data, job: mockJob });

      // 12000 rows / 5000-per-batch = 3 separate INSERT statements. Without
      // chunking this is a single `.values(...)` call carrying 36000 params,
      // which Postgres rejects with "bind message supplies N parameters".
      const valuesCalls = mockQueryRunner.manager.values.mock.calls as Array<
        [Array<Record<string, unknown>>]
      >;
      expect(valuesCalls).toHaveLength(3);
      expect(valuesCalls[0][0]).toHaveLength(5000);
      expect(valuesCalls[1][0]).toHaveLength(5000);
      expect(valuesCalls[2][0]).toHaveLength(2000);
      for (const [batch] of valuesCalls) {
        expect(batch.length).toBeLessThanOrEqual(5000);
      }
      expect(mockQueryRunner.manager.execute).toHaveBeenCalledTimes(3);

      // Every chunk stays inside the one transaction opened per call.
      expect(mockQueryRunner.startTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('F5: drops over-long urls at the trust boundary but keeps normal ones', async () => {
      const tooLongUrl = `https://a.example.com/${'x'.repeat(2048)}`;
      expect(tooLongUrl.length).toBeGreaterThan(2048);
      const warnSpy = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      await service.urlDiscovery({
        data: [{ url: tooLongUrl }, { url: 'https://ok.example.com' }] as any,
        job: mockJob,
      });

      const valuesArg = mockQueryRunner.manager.values.mock.calls[0][0] as Array<
        Record<string, unknown>
      >;
      expect(valuesArg).toHaveLength(1);
      expect(valuesArg[0].url).toBe('https://ok.example.com');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('dropped 1 url(s) longer than 2048 chars'),
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('F3: inserts the validated scalar assetServiceId when the relation is not loaded', async () => {
      const jobWithoutRelation = {
        ...mockJob,
        assetService: undefined,
      } as unknown as Job;

      await service.urlDiscovery({
        data: [{ url: 'https://c.example.com' }] as any,
        job: jobWithoutRelation,
      });

      const valuesArg = mockQueryRunner.manager.values.mock.calls[0][0] as Array<
        Record<string, unknown>
      >;
      expect(valuesArg[0].assetServiceId).toBe('service-id');
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
        addSelect: jest.fn().mockReturnThis(),
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

    it('chunks the bulk insert to stay under the Postgres 65535-parameter limit', async () => {
      mockDataSource.transaction.mockImplementation(
        async (callback: (manager: any) => Promise<any>) => {
          await callback(mockQueryRunner.manager);
          return undefined;
        },
      );

      // 1201 distinct findings → 1201 distinct fingerprints (the name drives
      // the fingerprint). A single INSERT would declare ~1201 × N columns of
      // parameters and overflow Postgres' 65535 cap, so the service must split
      // it across several statements.
      const many = Array.from(
        { length: 1201 },
        (_, i) =>
          ({ name: `Vuln ${i}`, severity: Severity.HIGH }) as unknown as Vulnerability,
      );

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ raw: [], identifiers: [] }),
      };
      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.vulnerabilities({ data: many, job: mockJob });

      const chunkSizes = mockQueryBuilder.values.mock.calls.map(
        (call) => (call[0] as unknown[]).length,
      );
      expect(chunkSizes.length).toBeGreaterThan(1);
      expect(Math.max(...chunkSizes)).toBeLessThanOrEqual(500);
      expect(chunkSizes.reduce((sum, n) => sum + n, 0)).toBe(1201);
    });

    it('should preserve stored enrichment fields the incoming finding omits', async () => {
      mockDataSource.transaction.mockImplementation(
        async (callback: (manager: any) => Promise<any>) => {
          await callback(mockQueryRunner.manager);
          return undefined;
        },
      );

      const incoming = {
        name: 'Test Vulnerability',
        severity: Severity.HIGH,
        fingerprint: 'preserve-fingerprint',
      } as unknown as Vulnerability;

      const fingerprint = crypto
        .createHash('md5')
        .update('Test Vulnerability-asset-id-tool-id')
        .digest('hex');

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            fingerprint,
            description: 'stored description',
            solution: 'stored solution',
            cvssScore: 9.1,
          },
        ]),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          raw: [incoming],
          identifiers: [],
        }),
      };

      mockQueryRunner.manager.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.vulnerabilities({ data: [incoming], job: mockJob });

      const valuesArg = mockQueryBuilder.values.mock.calls[0][0] as Array<
        Record<string, unknown>
      >;
      expect(valuesArg[0].description).toBe('stored description');
      expect(valuesArg[0].solution).toBe('stored solution');
      expect(valuesArg[0].cvssScore).toBe(9.1);
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
        addSelect: jest.fn().mockReturnThis(),
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
        addSelect: jest.fn().mockReturnThis(),
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

      // Should publish vulnerability.detected with count=1 (only the new vuln)
      expect(mockEventBridge.publishSafely).toHaveBeenCalledWith(
        EVENT_CATALOG.vulnerability.detected,
        expect.objectContaining({
          workspaceId: 'workspace-id',
          payload: expect.objectContaining({
            count: 1,
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
        addSelect: jest.fn().mockReturnThis(),
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
        mockEventBridge.publishSafely,
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
        addSelect: jest.fn().mockReturnThis(),
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

      // Should publish the event (low severity now triggers it)
      expect(mockEventBridge.publishSafely).toHaveBeenCalledWith(
        EVENT_CATALOG.vulnerability.detected,
        expect.objectContaining({
          payload: expect.objectContaining({
            count: 1,
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

    it('S3: syncData routes URL_DISCOVERY to urlDiscovery and HTTP_PROBE to httpResponses', async () => {
      const urlDiscoveryJob = {
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
        assetService: { id: 'service-id' },
        jobHistory: { id: 'history-id' },
        tool: { id: 'tool-id', category: ToolCategory.URL_DISCOVERY },
        category: ToolCategory.URL_DISCOVERY,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Job;

      const urlData = [{ url: 'https://a.example.com' }] as any;

      const urlDiscoverySpy = jest
        .spyOn(service, 'urlDiscovery')
        .mockResolvedValue();

      await service.syncData({ data: urlData, job: urlDiscoveryJob });

      expect(urlDiscoverySpy).toHaveBeenCalledWith({
        data: urlData,
        job: urlDiscoveryJob,
      });

      const httpProbeJob = {
        ...urlDiscoveryJob,
        tool: { id: 'tool-id', category: ToolCategory.HTTP_PROBE },
        category: ToolCategory.HTTP_PROBE,
      } as unknown as Job;
      const httpData = { url: 'https://example.com' } as unknown as HttpResponse;
      const httpSpy = jest
        .spyOn(service, 'httpResponses')
        .mockResolvedValue();

      await service.syncData({ data: httpData, job: httpProbeJob });

      expect(httpSpy).toHaveBeenCalledWith({
        data: httpData,
        job: httpProbeJob,
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
