import { BadRequestException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Repository } from 'typeorm';
import { IntegrationType } from '@/common/enums/enum';
import type { TargetsService } from '@/modules/targets/targets.service';
import type { DataAdapterService } from '@/modules/data-adapter/data-adapter.service';
import type { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import type { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import type { RedisLockService } from '@/services/redis/distributed-lock.service';
import { TargetSource } from '@/modules/targets/entities/target.entity';
import {
  IntegrationSyncService,
} from './integrations-sync.service';
import type { Integration } from './entities/integration.entity';
import { IntegrationsService } from './integrations.service';
import { VercelConnector } from './connectors/vercel.connector';
import { getConnectorClass } from './connectors/connector.registry';
import type { AwsSsoService } from './connectors/aws/aws-sso.service';

/**
 * F3 — Vercel mocked end-to-end QA.
 *
 * Unlike integration-sync.service.spec.ts (which mocks connector.factory),
 * this suite wires the REAL IntegrationSyncService → REAL connector.factory →
 * REAL VercelConnector chain and only mocks `global.fetch` + the DI
 * collaborators. That proves the Vercel integration is wired end to end
 * through the service (registry lookup, config assembly, dry-run probe,
 * ingestion writes) rather than only the connector in isolation.
 *
 * No live Vercel token/network: fetch is always mocked and restored.
 */

const VERCEL = 'vercel';

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () =>
      Promise.resolve(
        typeof body === 'string' ? body : JSON.stringify(body ?? {}),
      ),
  } as unknown as Response;
}

const PROJECT_A = { id: 'prj_a', name: 'site-a' };

function projectsPage(projects: unknown[]): unknown {
  return { projects, pagination: {} };
}

function domainsPage(domains: unknown[]): unknown {
  return { domains, pagination: {} };
}

const VERIFIED_DOMAIN = {
  name: 'www.example.com',
  apexName: 'example.com',
  verified: true,
};

const EMPTY_DNS_RECORDS = {
  A: [],
  AAAA: [],
  CNAME: [],
  MX: [],
  NS: [],
  SOA: [],
  TXT: [],
};

describe('Vercel integration — mocked end-to-end through IntegrationSyncService (F3)', () => {
  let fetchSpy: jest.SpyInstance;
  let queueMock: { add: jest.Mock; removeJobScheduler: jest.Mock };
  let repoMock: {
    findOneBy: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let integrationsServiceMock: { getIntegrationWithDecryptedConfig: jest.Mock };
  let targetsServiceMock: {
    findByWorkspaceAndValues: jest.Mock;
    createMultipleTargets: jest.Mock;
  };
  let dataAdapterServiceMock: { upsertAssetsByTargetId: jest.Mock };
  let workspacesServiceMock: { getWorkspacesByIds: jest.Mock };
  let redisLockServiceMock: { withLock: jest.Mock };
  let service: IntegrationSyncService;

  const integration = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'integration-1',
      workspaceId: 'ws-1',
      appType: VERCEL,
      category: IntegrationType.CLOUD_PROVIDER,
      config: {},
      createdById: 'user-1',
      syncSchedule: 'disabled',
      syncJobId: null,
      lastRunAt: null,
      ...overrides,
    }) as unknown as Integration;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(global, 'fetch');
    queueMock = {
      add: jest.fn().mockResolvedValue({ repeatJobKey: null }),
      removeJobScheduler: jest.fn().mockResolvedValue(undefined),
    };
    repoMock = {
      findOneBy: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((entity: Integration) => entity),
      update: jest.fn().mockResolvedValue(undefined),
    };
    integrationsServiceMock = {
      getIntegrationWithDecryptedConfig: jest.fn().mockResolvedValue({
        integration: integration(),
        decryptedConfig: { apiToken: 'vercel-token' },
      }),
    };
    targetsServiceMock = {
      findByWorkspaceAndValues: jest.fn().mockResolvedValue([]),
      createMultipleTargets: jest.fn().mockResolvedValue({
        created: [{ id: 'target-1', value: 'example.com' }],
        skipped: [],
        totalRequested: 1,
        totalCreated: 1,
        totalSkipped: 0,
      }),
    };
    dataAdapterServiceMock = {
      upsertAssetsByTargetId: jest.fn().mockResolvedValue(1),
    };
    workspacesServiceMock = {
      getWorkspacesByIds: jest
        .fn()
        .mockResolvedValue([{ id: 'ws-1', owner: { id: 'owner-1' } }]),
    };
    redisLockServiceMock = {
      // Must ACTUALLY invoke the callback, otherwise runSync takes the
      // lock-held null path and the connector never runs.
      withLock: jest
        .fn()
        .mockImplementation(
          (_key: string, _ttl: number, action: () => Promise<unknown>) =>
            action(),
        ),
    };

    service = new IntegrationSyncService(
      queueMock as unknown as Queue,
      repoMock as unknown as Repository<Integration>,
      integrationsServiceMock as unknown as IntegrationsService,
      targetsServiceMock as unknown as TargetsService,
      dataAdapterServiceMock as unknown as DataAdapterService,
      workspacesServiceMock as unknown as WorkspacesService,
      {} as unknown as AwsSsoService,
      {
        getDEK: jest.fn().mockResolvedValue(Buffer.alloc(32, 1)),
      } as unknown as WorkspaceEncryptionService,
      redisLockServiceMock as unknown as RedisLockService,
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('stale_state probe: the real VercelConnector is registered (no mocked factory)', () => {
    // No jest.mock('./connectors/connector.factory') anywhere in this file, so
    // this registry lookup proves the true module graph is loaded.
    expect(getConnectorClass(VERCEL)).toBe(VercelConnector);
  });

  describe('1. dry-run probe over the real service path', () => {
    it('returns the dry-run tokenStatus and performs zero ingestion writes / no lastRunAt', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse([]));

      const result = await service.runSync('integration-1', 'ws-1', {
        dryRun: true,
      });

      // The exact URL proves the connector's lightweight credential probe ran
      // through config assembled by runSync (apiToken forwarding).
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0][0])).toBe(
        'https://api.vercel.com/v10/projects?limit=1',
      );
      expect((fetchSpy.mock.calls[0][1] as RequestInit).headers).toEqual({
        Authorization: 'Bearer vercel-token',
      });

      expect(result).toEqual({
        projects: 0,
        domains: 0,
        truncated: false,
        targetsCreated: 0,
        assetsUpserted: 0,
        tokenStatus: 'active',
      });

      // No persistence side effects whatsoever in dry-run.
      expect(
        targetsServiceMock.findByWorkspaceAndValues,
      ).not.toHaveBeenCalled();
      expect(targetsServiceMock.createMultipleTargets).not.toHaveBeenCalled();
      expect(
        dataAdapterServiceMock.upsertAssetsByTargetId,
      ).not.toHaveBeenCalled();
      expect(repoMock.save).not.toHaveBeenCalled();
      const savedRows = repoMock.save.mock.calls.map(
        (call) => call[0] as Record<string, unknown>,
      );
      expect(savedRows.some((row) => row.lastRunAt instanceof Date)).toBe(false);
    });
  });

  describe('2. auth failures on the dry-run probe surface as BadRequestException', () => {
    it('401: the VercelSyncError text is re-thrown as BadRequestException', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ error: { message: 'invalid access token' } }, 401),
      );

      const error = await service
        .runSync('integration-1', 'ws-1', { dryRun: true })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toContain('Vercel API error 401');
      expect((error as Error).message).toContain('invalid access token');
      expect(fetchSpy).toHaveBeenCalledTimes(1); // no retry on 401
      expect(
        dataAdapterServiceMock.upsertAssetsByTargetId,
      ).not.toHaveBeenCalled();
    });

    it('403: the VercelSyncError text is re-thrown as BadRequestException', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ error: { message: 'forbidden' } }, 403),
      );

      const error = await service
        .runSync('integration-1', 'ws-1', { dryRun: true })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toContain('Vercel API error 403');
      expect((error as Error).message).toContain('forbidden');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. integration catalog exposes Vercel', () => {
    it('getSchemas() returns the vercel schema with the CLOUD_PROVIDER const and a password apiToken', () => {
      const catalogService = new IntegrationsService(
        {} as unknown as Repository<Integration>,
        {} as unknown as WorkspaceEncryptionService,
        {} as unknown as IntegrationSyncService,
      );

      const schema = catalogService.getSchemas() as {
        oneOf: Array<{
          $id?: string;
          properties: Record<string, Record<string, unknown>>;
        }>;
      };
      const vercel = schema.oneOf.find((entry) => entry.$id === VERCEL);

      expect(vercel).toBeDefined();
      expect(vercel?.properties.category.const).toBe(
        IntegrationType.CLOUD_PROVIDER,
      );
      expect(vercel?.properties.apiToken['ui:widget']).toBe('password');
    });
  });

  describe('4. regression: non-dry-run full ingestion path', () => {
    it('creates exactly one DOMAIN target with TargetSource.VERCEL and upserts assets once', async () => {
      fetchSpy
        .mockResolvedValueOnce(mockResponse(projectsPage([PROJECT_A])))
        .mockResolvedValueOnce(mockResponse(domainsPage([VERIFIED_DOMAIN])));

      const result = await service.runSync('integration-1', 'ws-1');

      expect(result).toEqual({
        projects: 1,
        domains: 1,
        truncated: false,
        targetsCreated: 1,
        assetsUpserted: 1,
      });

      // Real service call args (not logs): the target write carries the apex
      // as a DOMAIN with the vercel source, attributed to the workspace owner.
      expect(targetsServiceMock.createMultipleTargets).toHaveBeenCalledTimes(1);
      expect(targetsServiceMock.createMultipleTargets).toHaveBeenCalledWith(
        { targets: [{ value: 'example.com', type: 'DOMAIN' }] },
        'ws-1',
        expect.objectContaining({ id: 'owner-1' }),
        undefined,
        TargetSource.VERCEL,
      );

      // Exactly one asset upsert, on the created target, with the empty DNS
      // shape and no replaceOptions.
      expect(
        dataAdapterServiceMock.upsertAssetsByTargetId,
      ).toHaveBeenCalledTimes(1);
      expect(
        dataAdapterServiceMock.upsertAssetsByTargetId,
      ).toHaveBeenCalledWith(
        'target-1',
        [{ value: 'www.example.com', dnsRecords: EMPTY_DNS_RECORDS }],
        undefined,
        undefined,
      );

      // Non-dry-run DOES persist lastRunAt.
      expect(repoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ lastRunAt: expect.any(Date) }),
      );
    });
  });
});
