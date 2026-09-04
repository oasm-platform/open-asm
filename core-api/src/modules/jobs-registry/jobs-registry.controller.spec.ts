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
      };
      mockToolConfigProfilesService = {
        resolveConfigForDispatch: jest.fn(),
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

    it('should return connector response with all 4 new fields for connector job', async () => {
      const mockJob = {
        id: 'job-1',
        category: 'VULNERABILITIES',
        createdAt: new Date(),
        updatedAt: new Date(),
        priority: 4,
        command: undefined,
        asset: { id: 'a1', value: 'example.com' },
        tool: { id: 'tool-1', name: 'my-connector' },
        workspaceId: 'ws-1',
        configProfileId: 'profile-1',
      };
      mockJobsRegistryService.getNextJob.mockResolvedValue(mockJob);
      mockConnectorRegistry.getConnector.mockReturnValue({
        name: 'my-connector',
        image: 'my-connector:latest',
      });
      mockToolConfigProfilesService.resolveConfigForDispatch.mockResolvedValue({
        apiKey: 'decrypted-key',
      });

      const result = await controller.next({ id: 'worker-1' });

      expect(result).toHaveProperty('tool', 'my-connector');
      expect(result).toHaveProperty('image', 'my-connector:latest');
      // protobufjs Struct shape: plain keys are dropped by Struct.fromObject,
      // so inputs/config must be { fields: { key: { <kind>Value: value } } }
      expect(result).toHaveProperty('inputs', {
        fields: { target: { stringValue: 'example.com' } },
      });
      expect(result).toHaveProperty('config', {
        fields: { apiKey: { stringValue: 'decrypted-key' } },
      });
      expect(result).toHaveProperty('id', 'job-1');
      expect(result).toHaveProperty('category', 'VULNERABILITIES');
      // Must NOT include command in connector response
      expect(result).not.toHaveProperty('command');
    });

    it('should pack mixed-type config values into Struct fields by kind', async () => {
      const mockJob = {
        id: 'job-1b',
        category: 'VULNERABILITIES',
        asset: { id: 'a1', value: 'example.com' },
        tool: { id: 'tool-1', name: 'my-connector' },
        workspaceId: 'ws-1',
        configProfileId: 'profile-1',
      };
      mockJobsRegistryService.getNextJob.mockResolvedValue(mockJob);
      mockConnectorRegistry.getConnector.mockReturnValue({
        name: 'my-connector',
        image: 'my-connector:latest',
      });
      mockToolConfigProfilesService.resolveConfigForDispatch.mockResolvedValue({
        apiKey: 'decrypted-key',
        timeout: 30,
        verbose: true,
        rateLimit: null,
        tags: ['web', 'cve'],
        proxy: { host: 'proxy:8080' },
      });

      const result = await controller.next({ id: 'worker-1' });

      expect(result.config).toEqual({
        fields: {
          apiKey: { stringValue: 'decrypted-key' },
          timeout: { numberValue: 30 },
          verbose: { boolValue: true },
          rateLimit: { nullValue: 0 },
          tags: {
            listValue: {
              values: [{ stringValue: 'web' }, { stringValue: 'cve' }],
            },
          },
          proxy: {
            structValue: {
              fields: { host: { stringValue: 'proxy:8080' } },
            },
          },
        },
      });
    });

    it('should use explicit configProfileId over default', async () => {
      const mockJob = {
        id: 'job-2',
        category: 'VULNERABILITIES',
        asset: { id: 'a1', value: 'example.com' },
        tool: { id: 'tool-1', name: 'my-connector' },
        workspaceId: 'ws-1',
        configProfileId: 'explicit-profile',
      };
      mockJobsRegistryService.getNextJob.mockResolvedValue(mockJob);
      mockConnectorRegistry.getConnector.mockReturnValue({
        name: 'my-connector',
        image: 'my-connector:latest',
      });
      mockToolConfigProfilesService.resolveConfigForDispatch.mockResolvedValue({
        apiKey: 'explicit-key',
      });

      await controller.next({ id: 'worker-1' });

      expect(mockToolConfigProfilesService.resolveConfigForDispatch).toHaveBeenCalledWith(
        'ws-1',
        'tool-1',
        'explicit-profile',
      );
    });

    it('should fall back to default profile when no configProfileId', async () => {
      const mockJob = {
        id: 'job-3',
        category: 'VULNERABILITIES',
        asset: { id: 'a1', value: 'example.com' },
        tool: { id: 'tool-1', name: 'my-connector' },
        workspaceId: 'ws-1',
        configProfileId: undefined,
      };
      mockJobsRegistryService.getNextJob.mockResolvedValue(mockJob);
      mockConnectorRegistry.getConnector.mockReturnValue({
        name: 'my-connector',
        image: 'my-connector:latest',
      });
      mockToolConfigProfilesService.resolveConfigForDispatch.mockResolvedValue({
        apiKey: 'default-key',
      });

      await controller.next({ id: 'worker-1' });

      // profileId is undefined → resolveConfigForDispatch called with undefined
      expect(mockToolConfigProfilesService.resolveConfigForDispatch).toHaveBeenCalledWith(
        'ws-1',
        'tool-1',
        undefined,
      );
    });

    it('should omit config when no profiles exist', async () => {
      const mockJob = {
        id: 'job-4',
        category: 'VULNERABILITIES',
        asset: { id: 'a1', value: 'example.com' },
        tool: { id: 'tool-1', name: 'my-connector' },
        workspaceId: 'ws-1',
        configProfileId: undefined,
      };
      mockJobsRegistryService.getNextJob.mockResolvedValue(mockJob);
      mockConnectorRegistry.getConnector.mockReturnValue({
        name: 'my-connector',
        image: 'my-connector:latest',
      });
      mockToolConfigProfilesService.resolveConfigForDispatch.mockResolvedValue(undefined);

      const result = await controller.next({ id: 'worker-1' });

      expect(result).not.toHaveProperty('config');
    });

    it('should omit config and log warning on decrypt failure', async () => {
      const mockJob = {
        id: 'job-5',
        category: 'VULNERABILITIES',
        asset: { id: 'a1', value: 'example.com' },
        tool: { id: 'tool-1', name: 'my-connector' },
        workspaceId: 'ws-1',
        configProfileId: 'profile-1',
      };
      mockJobsRegistryService.getNextJob.mockResolvedValue(mockJob);
      mockConnectorRegistry.getConnector.mockReturnValue({
        name: 'my-connector',
        image: 'my-connector:latest',
      });
      mockToolConfigProfilesService.resolveConfigForDispatch.mockRejectedValue(
        new Error('decrypt failed'),
      );

      const result = await controller.next({ id: 'worker-1' });

      // Config omitted on failure
      expect(result).not.toHaveProperty('config');
      // Still returns all connector fields
      expect(result).toHaveProperty('tool', 'my-connector');
      expect(result).toHaveProperty('image', 'my-connector:latest');
      expect(result).toHaveProperty('inputs');
    });

    it('should never log decrypted values on decrypt failure', async () => {
      const mockJob = {
        id: 'job-6',
        category: 'VULNERABILITIES',
        asset: { id: 'a1', value: 'secret-host' },
        tool: { id: 'tool-1', name: 'my-connector' },
        workspaceId: 'ws-1',
        configProfileId: 'profile-1',
      };
      mockJobsRegistryService.getNextJob.mockResolvedValue(mockJob);
      mockConnectorRegistry.getConnector.mockReturnValue({
        name: 'my-connector',
        image: 'my-connector:latest',
      });
      mockToolConfigProfilesService.resolveConfigForDispatch.mockRejectedValue(
        new Error('bad-dek'),
      );

      const loggerSpy = jest.spyOn((controller as any).logger, 'warn');

      const result = await controller.next({ id: 'worker-1' });

      expect(result).not.toHaveProperty('config');
      // Verify the logger was called with generic message only
      expect(loggerSpy).toHaveBeenCalledWith('profile decrypt failed');
      // Ensure no secret value appears in ANY warn call
      for (const call of loggerSpy.mock.calls) {
        expect(String(call)).not.toContain('secret-host');
        expect(String(call)).not.toContain('bad-dek');
        expect(String(call)).not.toContain('profile-1');
      }
      loggerSpy.mockRestore();
    });

    it('should return legacy response for non-connector (built-in) job', async () => {
      const mockJob = {
        id: 'job-7',
        category: 'SUBDOMAINS',
        asset: { id: 'a1', value: 'example.com' },
        command: 'subfinder -d example.com',
        // No tool, workspaceId, configProfileId — built-in path
      };
      mockJobsRegistryService.getNextJob.mockResolvedValue(mockJob);
      // No connector entry for built-in tools
      mockConnectorRegistry.getConnector.mockReturnValue(null);

      const result = await controller.next({ id: 'worker-1' });

      expect(result).toEqual({
        id: 'job-7',
        asset: { id: 'a1', value: 'example.com' },
        command: 'subfinder -d example.com',
        category: 'SUBDOMAINS',
      });
    });

    it('should return legacy response when connector has no image', async () => {
      const mockJob = {
        id: 'job-8',
        category: 'SUBDOMAINS',
        asset: { id: 'a1', value: 'example.com' },
        command: 'subfinder -d example.com',
        tool: { id: 'tool-bi', name: 'subfinder' },
      };
      mockJobsRegistryService.getNextJob.mockResolvedValue(mockJob);
      // Connector entry exists but no image → treated as legacy
      mockConnectorRegistry.getConnector.mockReturnValue({
        name: 'subfinder',
        image: null,
      });

      const result = await controller.next({ id: 'worker-1' });

      expect(result).toEqual({
        id: 'job-8',
        asset: { id: 'a1', value: 'example.com' },
        command: 'subfinder -d example.com',
        category: 'SUBDOMAINS',
      });
    });
  });
});
