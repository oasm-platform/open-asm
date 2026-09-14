import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
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
});
