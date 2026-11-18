import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import {
  ToolCategory,
  WorkerScope,
  WorkerType,
} from '@/common/enums/enum';
import { GrpcWorkerContext } from '@/common/guards/grpc-worker-context.service';
import { Metadata } from '@grpc/grpc-js';
import {
  Aes256Gcm,
  CipherSuite,
  DhkemP256HkdfSha256,
  HkdfSha256,
} from '@hpke/core';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import { EventBridgeService } from '../event-bridge/publishing/event-bridge.service';
import { IntegrationConfigReader } from '../integrations/integration-config.reader';
import { ToolConfigProfilesService } from '../tools/tool-config-profiles.service';
import type { WorkerInstance } from '../workers/entities/worker.entity';
import { WorkersService } from '../workers/workers.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { JobsRegistryController } from './jobs-registry.controller';
import { JobsRegistryGrpcController } from './jobs-registry.grpc.controller';
import { JobDispatchService } from './job-dispatch.service';
import { JobHistoryQueryService } from './job-history-query.service';
import { JobsRegistryService } from './jobs-registry.service';
import { WorkflowRunnerService } from './workflow-runner.service';

/** The worker GrpcWorkerTokenGuard / WorkerTokenGuard authenticated. */
let authedWorker: WorkerInstance;
const metadata = new Metadata();

beforeEach(() => {
  authedWorker = {
    id: 'worker-1',
    type: WorkerType.BUILT_IN,
    scope: WorkerScope.WORKSPACE,
    workspaceId: 'ws-1',
  } as WorkerInstance;
});

describe('JobsRegistryController', () => {
  // ── Existing decorator tests ────────────────────────────────────────

  describe('workspace guards', () => {
    const required = (methodName: keyof JobsRegistryController) =>
      new Reflector().getAllAndOverride(WorkspacePermissions, [
        JobsRegistryController.prototype[methodName],
        JobsRegistryController,
      ]);

    it('requires job.read on getManyJobs', () => {
      expect(required('getManyJobs')).toEqual(['job.read']);
    });

    it('requires job.read on getJobsTimeline', () => {
      expect(required('getJobsTimeline')).toEqual(['job.read']);
    });

    it('requires job.read on getManyJobHistories', () => {
      expect(required('getManyJobHistories')).toEqual(['job.read']);
    });

    it('requires job.read on getJobHistoryDetail', () => {
      expect(required('getJobHistoryDetail')).toEqual(['job.read']);
    });

    it('requires job.write on reRunJob', () => {
      expect(required('reRunJob')).toEqual(['job.write']);
    });

    it('requires job.write on cancelJob', () => {
      expect(required('cancelJob')).toEqual(['job.write']);
    });

    it('requires job.write on cancelJobHistory', () => {
      expect(required('cancelJobHistory')).toEqual(['job.write']);
    });

    it('requires job.delete on deleteJob', () => {
      expect(required('deleteJob')).toEqual(['job.delete']);
    });
  });

  // ── Task 4.3: gRPC Next handler ─────────────────────────────────────

  describe('next (gRPC)', () => {
    let grpc: JobsRegistryGrpcController;
    let mockJobsRegistryService: any;
    let mockConnectorRegistry: any;
    let mockToolConfigProfilesService: any;
    let mockIntegrationConfig: { getIntegrationWithDecryptedConfig: jest.Mock };
    let eventBridge: { publishSafely: jest.Mock };

    beforeEach(async () => {
      mockJobsRegistryService = {
        getNextJob: jest.fn(),
        getNextJobs: jest.fn(),
        failUndispatchableJob: jest.fn(),
      };
      mockConnectorRegistry = {
        getConnector: jest.fn(),
        getResourceDefaults: jest.fn(() => ({
          cpu: '500m',
          memory: '512Mi',
          timeoutSeconds: 600,
        })),
      };
      mockToolConfigProfilesService = {
        resolveConfigForJob: jest.fn(),
      };
      mockIntegrationConfig = {
        getIntegrationWithDecryptedConfig: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [JobsRegistryController, JobsRegistryGrpcController],
        providers: [
          { provide: JobsRegistryService, useValue: mockJobsRegistryService },
          { provide: JobHistoryQueryService, useValue: {} },
          // One bag of mocks: getNextJob(s) on the dispatch side, the rest on the registry
          { provide: JobDispatchService, useValue: mockJobsRegistryService },
          { provide: ConnectorRegistryService, useValue: mockConnectorRegistry },
          { provide: ToolConfigProfilesService, useValue: mockToolConfigProfilesService },
          { provide: IntegrationConfigReader, useValue: mockIntegrationConfig },
          { provide: WorkflowRunnerService, useValue: { retryRun: jest.fn() } },
          { provide: WorkspacesService, useValue: { getWorkspace: jest.fn() } },
          { provide: WorkersService, useValue: { validateWorkerToken: jest.fn() } },
          { provide: GrpcWorkerContext, useValue: { requireWorker: () => authedWorker } },
          { provide: EventBridgeService, useValue: { publishSafely: jest.fn() } },
        ],
      }).compile();


      grpc = module.get(JobsRegistryGrpcController);
      eventBridge = module.get(EventBridgeService);
    });

    it('should return empty stub when no job found', async () => {
      mockJobsRegistryService.getNextJob.mockResolvedValue(null);

      const result = await grpc.next({ id: 'worker-1' }, metadata);

      expect(result).toEqual({ id: '', asset: {}, command: '' });
    });

    it('should send the connector slug, not the display name, as the job tool', async () => {
      // The worker derives the container name and the in-container TOOL env var
      // from the proto `tool` field. The manifest display name ("Nikto - Web
      // Server Scanner") is not a safe identifier: it is long, not unique, and
      // sanitizes into "nikto---web-server-scanner". The slug is the identifier
      // connectors are addressed by everywhere else.
      mockJobsRegistryService.getNextJob.mockResolvedValue({
        id: 'job-1',
        workspaceId: 'ws-1',
        category: 'vulnerability',
        asset: { value: 'https://example.com' },
        config: null,
        configProfileId: undefined,
        tool: { id: 'nikto', name: 'Nikto - Web Server Scanner' },
      });
      mockConnectorRegistry.getConnector.mockReturnValue({
        name: 'Nikto - Web Server Scanner',
        slug: 'nikto',
        image: 'ghcr.io/oasm-platform/connector-nikto:2.6.1',
      });
      mockToolConfigProfilesService.resolveConfigForJob.mockResolvedValue({});

      const result = await grpc.next({ id: 'worker-1' }, metadata);

      // Lookup still keys off the persisted tool name...
      expect(mockConnectorRegistry.getConnector).toHaveBeenCalledWith(
        'Nikto - Web Server Scanner',
      );
      // ...but the worker receives the stable slug.
      expect(result.tool).toBe('nikto');
      expect(result.image).toBe(
        'ghcr.io/oasm-platform/connector-nikto:2.6.1',
      );
      // Host asset: the historical single `target` input.
      expect(result.inputs).toEqual({
        fields: { target: { stringValue: 'https://example.com' } },
      });
      // camelCase keys: proto-loader drops snake_case ones on serialize.
      expect(result.timeoutSeconds).toBe(600);
      expect(result).not.toHaveProperty('timeout_seconds');
      // No manifest egress: proxied.
      expect(result.directEgress).toBe(false);
    });

    it('passes manifest egress: direct to the worker', async () => {
      mockJobsRegistryService.getNextJob.mockResolvedValue({
        id: 'job-nmap',
        workspaceId: 'ws-1',
        category: 'ports_scanner',
        asset: { value: 'example.com' },
        config: null,
        tool: { id: 'nmap', name: 'Nmap' },
      });
      mockConnectorRegistry.getConnector.mockReturnValue({
        name: 'Nmap',
        slug: 'nmap',
        image: 'ghcr.io/oasm-platform/connector-nmap:7.97',
        egress: 'direct',
      });
      mockToolConfigProfilesService.resolveConfigForJob.mockResolvedValue({});

      const result = await grpc.next({ id: 'worker-1' }, metadata);

      expect(result.directEgress).toBe(true);
      // Only manifests that declare it keep the config out of the env.
      expect(result.configInband).toBe(false);
    });

    it('tells the worker the job workspace and whether the connector reads its config in-band', async () => {
      mockJobsRegistryService.getNextJob.mockResolvedValue({
        id: 'job-ws',
        workspaceId: 'ws-1',
        category: 'vulnerabilities',
        asset: { value: 'example.com' },
        config: null,
        tool: { id: 'nuclei', name: 'nuclei' },
      });
      mockConnectorRegistry.getConnector.mockReturnValue({
        slug: 'nuclei',
        image: 'ghcr.io/oasm-platform/connector-nuclei:3',
        configInband: true,
      });
      mockToolConfigProfilesService.resolveConfigForJob.mockResolvedValue({});

      const result = await grpc.next({ id: 'worker-1' }, metadata);

      expect(result.workspaceId).toBe('ws-1');
      expect(result.configInband).toBe(true);
    });

    it('sends the inputs a job was planned with, e.g. the URL of a web service', async () => {
      mockJobsRegistryService.getNextJob.mockResolvedValue({
        id: 'job-3',
        workspaceId: 'ws-1',
        category: 'vulnerabilities',
        asset: { value: 'app.example.com' },
        config: null,
        inputs: { target: 'https://app.example.com:8443' },
        tool: { id: 'nikto', name: 'nikto' },
      });
      mockConnectorRegistry.getConnector.mockReturnValue({
        name: 'Nikto',
        slug: 'nikto',
        image: 'ghcr.io/oasm-platform/connector-nikto:2.6.1',
      });
      mockToolConfigProfilesService.resolveConfigForJob.mockResolvedValue({});

      const result = await grpc.next({ id: 'worker-1' }, metadata);

      expect(result.inputs).toEqual({
        fields: { target: { stringValue: 'https://app.example.com:8443' } },
      });
    });

    it('sends repository inputs with the integration token for a Git organization asset', async () => {
      mockJobsRegistryService.getNextJob.mockResolvedValue({
        id: 'job-2',
        workspaceId: 'ws-1',
        category: 'vulnerabilities',
        asset: {
          value: 'github.com/acme/web',
          metadata: { url: 'https://github.com/acme/web', defaultBranch: 'main' },
          target: { type: 'GIT_ORG', integrationId: 'int-1' },
        },
        config: null,
        tool: { id: 'gitleaks', name: 'gitleaks' },
      });
      mockConnectorRegistry.getConnector.mockReturnValue({
        name: 'Gitleaks',
        slug: 'gitleaks',
        image: 'ghcr.io/oasm-platform/connector-gitleaks:8',
      });
      mockToolConfigProfilesService.resolveConfigForJob.mockResolvedValue({});
      mockIntegrationConfig.getIntegrationWithDecryptedConfig.mockResolvedValue({
        integration: { appType: 'gitlab' },
        decryptedConfig: { apiToken: 'glpat-secret' },
      });

      const result = await grpc.next({ id: 'worker-1' }, metadata);

      expect(
        mockIntegrationConfig.getIntegrationWithDecryptedConfig,
      ).toHaveBeenCalledWith('int-1', 'ws-1');
      expect(result.inputs).toEqual({
        fields: {
          repository: { stringValue: 'https://github.com/acme/web' },
          ref: { stringValue: 'main' },
          username: { stringValue: 'oauth2' },
          token: { stringValue: 'glpat-secret' },
        },
      });
    });

    it('dispatches a repository job unauthenticated when the integration is unavailable', async () => {
      mockJobsRegistryService.getNextJob.mockResolvedValue({
        id: 'job-3',
        workspaceId: 'ws-1',
        category: 'vulnerabilities',
        asset: {
          value: 'github.com/acme/web',
          metadata: { url: 'https://github.com/acme/web', defaultBranch: 'main' },
          target: { type: 'GIT_ORG', integrationId: 'int-gone' },
        },
        config: null,
        tool: { id: 'gitleaks', name: 'gitleaks' },
      });
      mockConnectorRegistry.getConnector.mockReturnValue({
        slug: 'gitleaks',
        image: 'ghcr.io/oasm-platform/connector-gitleaks:8',
      });
      mockToolConfigProfilesService.resolveConfigForJob.mockResolvedValue({});
      mockIntegrationConfig.getIntegrationWithDecryptedConfig.mockRejectedValue(
        new Error('not found'),
      );

      const result = await grpc.next({ id: 'worker-1' }, metadata);

      expect(result.inputs).toEqual({
        fields: {
          repository: { stringValue: 'https://github.com/acme/web' },
          ref: { stringValue: 'main' },
        },
      });
    });

    // ── Worker identity and secret release ──

    const connectorJob = (overrides: Record<string, unknown> = {}) => ({
      id: 'job-9',
      workspaceId: 'ws-1',
      category: 'vulnerabilities',
      asset: { value: 'example.com' },
      config: null,
      tool: { id: 'tool-nessus', name: 'nessus' },
      ...overrides,
    });

    const useNessusConnector = (): void => {
      mockConnectorRegistry.getConnector.mockReturnValue({
        slug: 'nessus',
        image: 'ghcr.io/oasm-platform/connector-nessus:1',
        configSchema: {
          properties: { apiKey: { type: 'string' }, rate: { type: 'number' } },
        },
      });
    };

    it('claims as the authenticated worker, not the worker id in the request', async () => {
      mockJobsRegistryService.getNextJob.mockResolvedValue(null);

      await grpc.next({ id: 'someone-elses-worker' }, metadata);

      expect(mockJobsRegistryService.getNextJob).toHaveBeenCalledWith('worker-1');
    });

    it('batch-claims as the authenticated worker', async () => {
      mockJobsRegistryService.getNextJobs.mockResolvedValue([]);

      await grpc.nextBatch({ id: 'someone-elses-worker', limit: 3 }, metadata);

      expect(mockJobsRegistryService.getNextJobs).toHaveBeenCalledWith(
        'worker-1',
        3,
      );
    });

    it('fails a claimed job the worker may not receive the secrets of, without decrypting them', async () => {
      useNessusConnector();
      mockJobsRegistryService.getNextJobs.mockResolvedValue([
        connectorJob({ workspaceId: 'ws-2' }),
        connectorJob({ id: 'job-10' }),
      ]);
      mockToolConfigProfilesService.resolveConfigForJob.mockResolvedValue({});

      const { values } = await grpc.nextBatch(
        { id: 'worker-1', limit: 2 },
        metadata,
      );

      expect(values.map((job) => job.id)).toEqual(['job-10']);
      expect(mockJobsRegistryService.failUndispatchableJob).toHaveBeenCalledWith(
        'job-9',
        expect.stringMatching(/another workspace/),
      );
      expect(
        mockToolConfigProfilesService.resolveConfigForJob,
      ).toHaveBeenCalledTimes(1);
    });

    it('records which secret fields were released to which worker', async () => {
      useNessusConnector();
      mockJobsRegistryService.getNextJob.mockResolvedValue(connectorJob());
      mockToolConfigProfilesService.resolveConfigForJob.mockResolvedValue({
        apiKey: 'nessus-key',
        rate: 5,
      });

      await grpc.next({ id: 'worker-1' }, metadata);

      expect(eventBridge.publishSafely).toHaveBeenCalledWith(
        EVENT_CATALOG.job.secrets.released,
        expect.objectContaining({
          workspaceId: 'ws-1',
          resourceType: 'job',
          resourceId: 'job-9',
          metadata: { workerId: 'worker-1', fields: ['apiKey'] },
        }),
        expect.anything(),
      );
      const [, data] = eventBridge.publishSafely.mock.calls[0];
      expect(JSON.stringify(data)).not.toContain('nessus-key');
    });

    it('seals the config and repository token to a worker that registered a key, sending neither in the clear', async () => {
      // The Go worker's sealing fixture: open with its private key below.
      authedWorker.encryptionPublicKey = Buffer.from(
        '048f2c1839582ec03f19e8d7c573e64ee1b4d53a6f89647491e3ecc54fbe5623cdce67bd25f51b6a46593576ebdfef573b5f4e95cb4ca8874de3e7b413037fd712',
        'hex',
      ).toString('base64');
      useNessusConnector();
      mockJobsRegistryService.getNextJob.mockResolvedValue(
        connectorJob({
          asset: {
            value: 'github.com/acme/web',
            metadata: { url: 'https://github.com/acme/web', defaultBranch: 'main' },
            target: { type: 'GIT_ORG', integrationId: 'int-1' },
          },
        }),
      );
      mockToolConfigProfilesService.resolveConfigForJob.mockResolvedValue({ apiKey: 'nessus-key' });
      mockIntegrationConfig.getIntegrationWithDecryptedConfig.mockResolvedValue({
        integration: { appType: 'github' },
        decryptedConfig: { apiToken: 'ghp-secret' },
      });

      const result = await grpc.next({ id: 'worker-1' }, metadata);

      expect(JSON.stringify(result)).not.toMatch(/nessus-key|ghp-secret/);
      expect(result.config).toBeUndefined();
      expect(Object.keys((result.inputs as { fields: object }).fields)).toEqual([
        'repository',
        'ref',
      ]);
      const sealed = result.sealed as { enc: Buffer; ciphertext: Buffer };
      const suite = new CipherSuite({
        kem: new DhkemP256HkdfSha256(),
        kdf: new HkdfSha256(),
        aead: new Aes256Gcm(),
      });
      const recipient = await suite.createRecipientContext({
        recipientKey: await suite.kem.deserializePrivateKey(
          Buffer.from('7585c485a1a72bc3b66395caaa37a1940848a5acba85dfff49a0a2b446792360', 'hex'),
        ),
        enc: sealed.enc,
        info: new TextEncoder().encode('oasm job secrets v1'),
      });
      const opened = await recipient.open(
        sealed.ciphertext,
        new TextEncoder().encode('job-9|worker-1'),
      );
      expect(JSON.parse(new TextDecoder().decode(opened))).toEqual({
        config: { apiKey: 'nessus-key' },
        inputs: { username: 'x-access-token', token: 'ghp-secret' },
      });
    });

    it('records nothing for a job that carries no secret', async () => {
      useNessusConnector();
      mockJobsRegistryService.getNextJob.mockResolvedValue(connectorJob());
      mockToolConfigProfilesService.resolveConfigForJob.mockResolvedValue({
        rate: 5,
      });

      await grpc.next({ id: 'worker-1' }, metadata);

      expect(eventBridge.publishSafely).not.toHaveBeenCalled();
    });
  });

  // ── url_discovery: REST + gRPC delegation ───────────────────────────

  describe('url-discovery result endpoints', () => {
    let controller: JobsRegistryController;
    let grpc: JobsRegistryGrpcController;
    let mockJobsRegistryService: any;

    beforeEach(async () => {
      mockJobsRegistryService = {
        getNextJob: jest.fn(),
        updateResultByCategory: jest.fn().mockResolvedValue({
          jobId: 'bull-job-id',
          queueId: 'job-result',
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [JobsRegistryController, JobsRegistryGrpcController],
        providers: [
          { provide: JobsRegistryService, useValue: mockJobsRegistryService },
          { provide: JobHistoryQueryService, useValue: {} },
          // One bag of mocks: getNextJob(s) on the dispatch side, the rest on the registry
          { provide: JobDispatchService, useValue: mockJobsRegistryService },
          {
            provide: ConnectorRegistryService,
            useValue: { getConnector: jest.fn(), getResourceDefaults: jest.fn() },
          },
          {
            provide: IntegrationConfigReader,
            useValue: { getIntegrationWithDecryptedConfig: jest.fn() },
          },
          {
            provide: ToolConfigProfilesService,
            useValue: { resolveConfigForJob: jest.fn() },
          },
          { provide: WorkflowRunnerService, useValue: { retryRun: jest.fn() } },
          { provide: WorkspacesService, useValue: { getWorkspace: jest.fn() } },
          { provide: WorkersService, useValue: { validateWorkerToken: jest.fn() } },
          { provide: GrpcWorkerContext, useValue: { requireWorker: () => authedWorker } },
          { provide: EventBridgeService, useValue: { publishSafely: jest.fn() } },
        ],
      }).compile();

      controller = module.get(JobsRegistryController);

      grpc = module.get(JobsRegistryGrpcController);
    });

    it('S1 REST: POST :workerId/result/url-discovery delegates with ToolCategory.URL_DISCOVERY', async () => {
      const dto = {
        jobId: 'job-uuid',
        error: false,
        payload: [{ url: 'https://a.example.com' }],
      } as any;

      const result = await controller.updateUrlDiscoveryResult(
        { workerId: 'worker-1' },
        dto,
        authedWorker,
      );

      expect(mockJobsRegistryService.updateResultByCategory).toHaveBeenCalledTimes(
        1,
      );
      const [workerId, passedDto, category] =
        mockJobsRegistryService.updateResultByCategory.mock.calls[0];
      expect(workerId).toBe('worker-1');
      expect(passedDto).toBe(dto);
      expect(category).toBe(ToolCategory.URL_DISCOVERY);
      expect(result).toEqual({ jobId: 'bull-job-id', queueId: 'job-result' });
    });

    it('S1 gRPC: ResultUrlDiscovery maps proto urls → dto.payload and returns {success:true}', async () => {
      const urls = [
        { url: 'https://a.example.com' },
        { url: 'https://b.example.com' },
      ];

      const result = await grpc.resultUrlDiscovery(
        {
          workerId: 'worker-1',
          jobId: 'job-uuid',
          error: false,
          raw: 'raw-out',
          urls,
        },
        metadata,
      );

      expect(mockJobsRegistryService.updateResultByCategory).toHaveBeenCalledTimes(
        1,
      );
      const [, passedDto, category] =
        mockJobsRegistryService.updateResultByCategory.mock.calls[0];
      expect(passedDto.jobId).toBe('job-uuid');
      expect(passedDto.raw).toBe('raw-out');
      expect(passedDto.payload).toEqual(urls);
      expect(category).toBe(ToolCategory.URL_DISCOVERY);
      expect(result).toEqual({ success: true });
    });

    it('submits gRPC results as the authenticated worker, not the worker id in the request', async () => {
      await grpc.resultSubdomains(
        { workerId: 'someone-elses-worker', jobId: 'job-uuid', error: false },
        metadata,
      );

      const [workerId] =
        mockJobsRegistryService.updateResultByCategory.mock.calls[0];
      expect(workerId).toBe('worker-1');
    });

    it('submits HTTP results as the authenticated worker, not the :workerId path param', async () => {
      const dto = { jobId: 'job-uuid', error: false, payload: [] } as any;

      await controller.updateSubdomainResult(
        { workerId: 'someone-elses-worker' },
        dto,
        authedWorker,
      );

      const [workerId] =
        mockJobsRegistryService.updateResultByCategory.mock.calls[0];
      expect(workerId).toBe('worker-1');
    });

    it('S2 edge: urls undefined → payload [] (no throw)', async () => {
      const result = await grpc.resultUrlDiscovery(
        { workerId: 'worker-1', jobId: 'job-uuid', error: false },
        metadata,
      );

      const [, passedDto] =
        mockJobsRegistryService.updateResultByCategory.mock.calls[0];
      expect(passedDto.payload).toEqual([]);
      expect(result).toEqual({ success: true });
    });

    it('S3 regression: updatePortsResult still delegates with PORTS_SCANNER', async () => {
      const dto = { jobId: 'job-uuid', error: false, payload: [80, 443] } as any;

      await controller.updatePortsResult(
        { workerId: 'worker-1' },
        dto,
        authedWorker,
      );

      const [, passedDto, category] =
        mockJobsRegistryService.updateResultByCategory.mock.calls[0];
      expect(passedDto).toBe(dto);
      expect(category).toBe(ToolCategory.PORTS_SCANNER);
    });
  });

  // ── vulnerability result: severity case normalization at gRPC boundary ──

  describe('vulnerability result endpoints', () => {
    let grpc: JobsRegistryGrpcController;
    let mockJobsRegistryService: any;

    beforeEach(async () => {
      mockJobsRegistryService = {
        updateResultByCategory: jest.fn().mockResolvedValue({
          jobId: 'bull-job-id',
          queueId: 'job-result',
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [JobsRegistryController, JobsRegistryGrpcController],
        providers: [
          { provide: JobsRegistryService, useValue: mockJobsRegistryService },
          { provide: JobHistoryQueryService, useValue: {} },
          // One bag of mocks: getNextJob(s) on the dispatch side, the rest on the registry
          { provide: JobDispatchService, useValue: mockJobsRegistryService },
          {
            provide: ConnectorRegistryService,
            useValue: { getConnector: jest.fn(), getResourceDefaults: jest.fn() },
          },
          {
            provide: IntegrationConfigReader,
            useValue: { getIntegrationWithDecryptedConfig: jest.fn() },
          },
          {
            provide: ToolConfigProfilesService,
            useValue: { resolveConfigForJob: jest.fn() },
          },
          { provide: WorkflowRunnerService, useValue: { retryRun: jest.fn() } },
          { provide: WorkspacesService, useValue: { getWorkspace: jest.fn() } },
          { provide: WorkersService, useValue: { validateWorkerToken: jest.fn() } },
          { provide: GrpcWorkerContext, useValue: { requireWorker: () => authedWorker } },
          { provide: EventBridgeService, useValue: { publishSafely: jest.fn() } },
        ],
      }).compile();


      grpc = module.get(JobsRegistryGrpcController);
    });

    it('lowercases proto enum severity names before persisting', async () => {
      const vulnerabilities = {
        values: [
          { name: 'CVE-1', severity: 'HIGH' },
          { name: 'CVE-2', severity: 'Critical' },
          { name: 'CVE-3', severity: 'info' },
        ],
      } as any;

      const result = await grpc.resultVulnerabilities(
        { workerId: 'worker-1', jobId: 'job-uuid', error: false, vulnerabilities },
        metadata,
      );

      const [, passedDto, category] =
        mockJobsRegistryService.updateResultByCategory.mock.calls[0];
      expect(
        (passedDto.payload as { severity: string }[]).map((v) => v.severity),
      ).toEqual(['high', 'critical', 'info']);
      expect(category).toBe(ToolCategory.VULNERABILITIES);
      expect(result).toEqual({ success: true });
    });

    it('falls back to info for unrecognized severity', async () => {
      const vulnerabilities = {
        values: [{ name: 'CVE-1', severity: 'SEVERITY_UNSPECIFIED' }],
      } as any;

      await grpc.resultVulnerabilities(
        { workerId: 'worker-1', jobId: 'job-uuid', error: false, vulnerabilities },
        metadata,
      );

      const [, passedDto] =
        mockJobsRegistryService.updateResultByCategory.mock.calls[0];
      expect(passedDto.payload[0].severity).toBe('info');
    });
  });
});
