import { DefaultWorkflow } from '@/common/enums/enum';
import type { RedisService } from '@/services/redis/redis.service';
import type { DataSource } from 'typeorm';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import type { EventBridgeService } from '../event-bridge/publishing/event-bridge.service';
import type { Job } from '../jobs-registry/entities/job.entity';
import type { WorkspacesService } from '../workspaces/workspaces.service';
import { StatisticSnapshotService } from './statistic-snapshot.service';
import type { StatisticService } from './statistic.service';

describe('StatisticSnapshotService', () => {
  let service: StatisticSnapshotService;

  const mockDataSource = {
    getRepository: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
  };

  const mockWorkspacesService = {
    getMemberOfWorkspaceByJobId: jest.fn(),
  };

  const mockEventBridge = {
    publishSafely: jest.fn(),
  };

  beforeEach(() => {
    service = new StatisticSnapshotService(
      mockDataSource as unknown as DataSource,
      mockRedisService as unknown as RedisService,
      mockWorkspacesService as unknown as WorkspacesService,
      mockEventBridge as unknown as EventBridgeService,
      {} as StatisticService,
    );
  });

  describe('handleWorkflowEnd', () => {
    interface SnapshotLike {
      hosts: number;
      ports: number;
      services: number;
      techs: number;
    }

    const targetJob = (steps: Record<string, unknown>): Job =>
      ({
        id: 'job-1',
        asset: { target: { id: 'target-1', value: 'cline.bot' } },
        jobHistory: {
          workflow: { filePath: DefaultWorkflow.DOMAIN_DISCOVERY },
          steps,
        },
      }) as unknown as Job;

    const snapshotSpy = () =>
      jest.spyOn(
        service as unknown as {
          takeSnapshotStatisticTarget: (id: string) => Promise<SnapshotLike>;
        },
        'takeSnapshotStatisticTarget',
      );

    beforeEach(() => {
      jest.clearAllMocks();
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.del.mockResolvedValue(undefined);
      mockWorkspacesService.getMemberOfWorkspaceByJobId.mockResolvedValue([
        { user: { id: 'user-1' }, workspace: { id: 'workspace-1' } },
      ]);
    });

    /** The single `workflow.run.completed` publish the service made. */
    const publishedPayload = () =>
      mockEventBridge.publishSafely.mock.calls.at(-1)?.[1] as
        | {
            workspaceId: string;
            outcome: string;
            payload: Record<string, unknown>;
          }
        | undefined;

    it('publishes the run outcome instead of deciding who is notified', async () => {
      snapshotSpy().mockResolvedValue({
        hosts: 1,
        ports: 0,
        services: 3,
        techs: 0,
      });

      await service.handleWorkflowEnd(
        targetJob({
          scan_subdomain: { status: 'done' },
          port_scan: { status: 'failed' },
          http_probe: { status: 'skipped', reason: 'blocked-by-failure' },
        }),
      );

      expect(mockEventBridge.publishSafely).toHaveBeenCalledTimes(1);
      expect(mockEventBridge.publishSafely.mock.calls[0][0]).toBe(
        EVENT_CATALOG.workflow.run.completed,
      );
      const data = publishedPayload();
      expect(data.workspaceId).toBe('workspace-1');
      expect(data.payload).toMatchObject({
        targetValue: 'cline.bot',
        services: 3,
        hosts: 1,
      });
    });

    it('names the hosts the run found first', async () => {
      snapshotSpy().mockResolvedValue({
        hosts: 2,
        ports: 0,
        services: 2,
        techs: 0,
      });
      const newHosts = jest
        .spyOn(service, 'newHostsOfRun')
        .mockResolvedValue({ total: 12, sample: ['a.cline.bot', 'b.cline.bot'] });
      const job = targetJob({ port_scan: { status: 'done' } });
      (job.jobHistory as { id?: string }).id = 'run-1';

      await service.handleWorkflowEnd(job);

      expect(newHosts).toHaveBeenCalledWith('run-1', 'target-1');
      expect(publishedPayload()?.payload).toMatchObject({
        newHosts: ['a.cline.bot', 'b.cline.bot'],
        newHostsTotal: 12,
      });
    });

    it('reports no new hosts for a run without an id', async () => {
      await expect(service.newHostsOfRun(undefined, 'target-1')).resolves.toEqual(
        { total: 0, sample: [] },
      );
    });

    it('marks a partial run as a failure outcome', async () => {
      // The run did not finish its graph, so the envelope says so — that is how
      // the `notifications` lane knows to send the "scan stopped halfway"
      // message without having to re-derive the step states.
      snapshotSpy().mockResolvedValue({
        hosts: 0,
        ports: 0,
        services: 0,
        techs: 0,
      });

      await service.handleWorkflowEnd(
        targetJob({ port_scan: { status: 'failed' } }),
      );

      const data = publishedPayload();
      expect(data.outcome).toBe('failure');
      expect(data.payload.failedSteps).toEqual(['port_scan']);
    });

    it('names what never ran, so the notice is actionable', async () => {
      snapshotSpy().mockResolvedValue({
        hosts: 0,
        ports: 0,
        services: 0,
        techs: 0,
      });

      await service.handleWorkflowEnd(
        targetJob({
          scan_subdomain: { status: 'done' },
          port_scan: { status: 'failed' },
          http_probe: { status: 'skipped', reason: 'blocked-by-failure' },
        }),
      );

      // Raw step ids, not a sentence: the wording is the consumers' job.
      expect(publishedPayload()?.payload).toMatchObject({
        failedSteps: ['port_scan'],
        blockedSteps: ['http_probe'],
        cancelledSteps: [],
      });
    });

    it('reports empty step lists for a clean run', async () => {
      snapshotSpy().mockResolvedValue({
        hosts: 2,
        ports: 4,
        services: 4,
        techs: 1,
      });

      await service.handleWorkflowEnd(
        targetJob({
          scan_subdomain: { status: 'done' },
          port_scan: { status: 'done' },
          http_probe: { status: 'done' },
          take_screenshot: { status: 'done' },
        }),
      );

      const data = publishedPayload();
      expect(data.outcome).toBe('success');
      expect(data.payload).toMatchObject({
        failedSteps: [],
        blockedSteps: [],
        cancelledSteps: [],
      });
    });

    it('publishes nothing when the workspace cannot be resolved', async () => {
      // The event bus requires a workspace on every event; an unresolvable run
      // is skipped rather than published with a sentinel workspace.
      mockWorkspacesService.getMemberOfWorkspaceByJobId.mockResolvedValue([]);
      snapshotSpy().mockResolvedValue({ hosts: 1, ports: 0, services: 0, techs: 0 });

      await service.handleWorkflowEnd(targetJob({ port_scan: { status: 'done' } }));

      expect(mockEventBridge.publishSafely).not.toHaveBeenCalled();
    });
  });
});
