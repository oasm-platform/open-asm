import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { ToolCategory } from '@/common/enums/enum';
import { GrpcWorkerContext } from '@/common/guards/grpc-worker-context.service';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { ToolConfigProfilesService } from '../tools/tool-config-profiles.service';
import { WorkersService } from '../workers/workers.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { JobsRegistryController } from './jobs-registry.controller';
import { JobsRegistryService } from './jobs-registry.service';

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

    it('requires job.delete on deleteJob', () => {
      expect(required('deleteJob')).toEqual(['job.delete']);
    });
  });

  // ── Task 4.3: gRPC Next handler ─────────────────────────────────────

  describe('next (gRPC)', () => {
    let controller: JobsRegistryController;
    let mockJobsRegistryService: any;
    let mockConnectorRegistry: any;
    let mockToolConfigProfilesService: any;

    beforeEach(async () => {
      mockJobsRegistryService = {
        getNextJob: jest.fn(),
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

      const module: TestingModule = await Test.createTestingModule({
        controllers: [JobsRegistryController],
        providers: [
          { provide: JobsRegistryService, useValue: mockJobsRegistryService },
          { provide: ConnectorRegistryService, useValue: mockConnectorRegistry },
          { provide: ToolConfigProfilesService, useValue: mockToolConfigProfilesService },
          { provide: WorkspacesService, useValue: { getWorkspace: jest.fn() } },
          { provide: WorkersService, useValue: { validateWorkerToken: jest.fn() } },
          { provide: GrpcWorkerContext, useValue: { setWorker: jest.fn() } },
        ],
      }).compile();

      controller = module.get(JobsRegistryController);
    });

    it('should return empty stub when no job found', async () => {
      mockJobsRegistryService.getNextJob.mockResolvedValue(null);

      const result = await controller.next({ id: 'worker-1' });

      expect(result).toEqual({ id: '', asset: {}, command: '' });
    });

  });

  // ── url_discovery: REST + gRPC delegation ───────────────────────────

  describe('url-discovery result endpoints', () => {
    let controller: JobsRegistryController;
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
        controllers: [JobsRegistryController],
        providers: [
          { provide: JobsRegistryService, useValue: mockJobsRegistryService },
          {
            provide: ConnectorRegistryService,
            useValue: { getConnector: jest.fn(), getResourceDefaults: jest.fn() },
          },
          {
            provide: ToolConfigProfilesService,
            useValue: { resolveConfigForJob: jest.fn() },
          },
          { provide: WorkspacesService, useValue: { getWorkspace: jest.fn() } },
          { provide: WorkersService, useValue: { validateWorkerToken: jest.fn() } },
          { provide: GrpcWorkerContext, useValue: { setWorker: jest.fn() } },
        ],
      }).compile();

      controller = module.get(JobsRegistryController);
    });

    it('S1 REST: POST :workerId/result/url-discovery delegates with ToolCategory.URL_DISCOVERY', async () => {
      const dto = {
        jobId: 'job-uuid',
        error: false,
        payload: [{ url: 'https://a.example.com' }],
      } as any;

      const result = await controller.updateUrlDiscoveryResult(
        { workerId: 'worker-uuid' },
        dto,
      );

      expect(mockJobsRegistryService.updateResultByCategory).toHaveBeenCalledTimes(
        1,
      );
      const [workerId, passedDto, category] =
        mockJobsRegistryService.updateResultByCategory.mock.calls[0];
      expect(workerId).toBe('worker-uuid');
      expect(passedDto).toBe(dto);
      expect(category).toBe(ToolCategory.URL_DISCOVERY);
      expect(result).toEqual({ jobId: 'bull-job-id', queueId: 'job-result' });
    });

    it('S1 gRPC: ResultUrlDiscovery maps proto urls → dto.payload and returns {success:true}', async () => {
      const urls = [
        { url: 'https://a.example.com' },
        { url: 'https://b.example.com' },
      ];

      const result = await controller.resultUrlDiscovery({
        workerId: 'worker-uuid',
        jobId: 'job-uuid',
        error: false,
        raw: 'raw-out',
        urls,
      });

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

    it('S2 edge: urls undefined → payload [] (no throw)', async () => {
      const result = await controller.resultUrlDiscovery({
        workerId: 'worker-uuid',
        jobId: 'job-uuid',
        error: false,
      });

      const [, passedDto] =
        mockJobsRegistryService.updateResultByCategory.mock.calls[0];
      expect(passedDto.payload).toEqual([]);
      expect(result).toEqual({ success: true });
    });

    it('S3 regression: updatePortsResult still delegates with PORTS_SCANNER', async () => {
      const dto = { jobId: 'job-uuid', error: false, payload: [80, 443] } as any;

      await controller.updatePortsResult({ workerId: 'worker-uuid' }, dto);

      const [, passedDto, category] =
        mockJobsRegistryService.updateResultByCategory.mock.calls[0];
      expect(passedDto).toBe(dto);
      expect(category).toBe(ToolCategory.PORTS_SCANNER);
    });
  });

  // ── vulnerability result: severity case normalization at gRPC boundary ──

  describe('vulnerability result endpoints', () => {
    let controller: JobsRegistryController;
    let mockJobsRegistryService: any;

    beforeEach(async () => {
      mockJobsRegistryService = {
        updateResultByCategory: jest.fn().mockResolvedValue({
          jobId: 'bull-job-id',
          queueId: 'job-result',
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [JobsRegistryController],
        providers: [
          { provide: JobsRegistryService, useValue: mockJobsRegistryService },
          {
            provide: ConnectorRegistryService,
            useValue: { getConnector: jest.fn(), getResourceDefaults: jest.fn() },
          },
          {
            provide: ToolConfigProfilesService,
            useValue: { resolveConfigForJob: jest.fn() },
          },
          { provide: WorkspacesService, useValue: { getWorkspace: jest.fn() } },
          { provide: WorkersService, useValue: { validateWorkerToken: jest.fn() } },
          { provide: GrpcWorkerContext, useValue: { setWorker: jest.fn() } },
        ],
      }).compile();

      controller = module.get(JobsRegistryController);
    });

    it('lowercases proto enum severity names before persisting', async () => {
      const vulnerabilities = {
        values: [
          { name: 'CVE-1', severity: 'HIGH' },
          { name: 'CVE-2', severity: 'Critical' },
          { name: 'CVE-3', severity: 'info' },
        ],
      } as any;

      const result = await controller.resultVulnerabilities({
        workerId: 'worker-uuid',
        jobId: 'job-uuid',
        error: false,
        vulnerabilities,
      });

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

      await controller.resultVulnerabilities({
        workerId: 'worker-uuid',
        jobId: 'job-uuid',
        error: false,
        vulnerabilities,
      });

      const [, passedDto] =
        mockJobsRegistryService.updateResultByCategory.mock.calls[0];
      expect(passedDto.payload[0].severity).toBe('info');
    });
  });
});
