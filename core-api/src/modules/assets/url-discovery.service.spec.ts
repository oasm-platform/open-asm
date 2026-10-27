import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { JobRunType, TargetType } from '@/common/enums/enum';
import type { EventBridgeService } from '../event-bridge/publishing/event-bridge.service';
import type { Job } from '../jobs-registry/entities/job.entity';
import type { WorkflowRunnerService } from '../jobs-registry/workflow-runner.service';
import type { Target } from '../targets/entities/target.entity';
import type { WorkflowsService } from '../workflows/workflows.service';
import type { DiscoveredUrl } from './entities/discovered-url.entity';
import { UrlDiscoveryService } from './url-discovery.service';

describe('UrlDiscoveryService', () => {
  let service: UrlDiscoveryService;
  let mockTargetRepository: { find: jest.Mock };
  let mockWorkflowRepository: { findOne: jest.Mock };
  let mockWorkflowRunnerService: { startRun: jest.Mock };
  let mockEventBridge: { publishSafely: jest.Mock };
  let qb: Record<string, jest.Mock>;
  const workflow = { id: 'workflow-urls', name: 'Url discovery' };

  beforeEach(() => {
    mockTargetRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 'domain-1', type: TargetType.DOMAIN, value: 'example.com' },
        ]),
    };
    mockWorkflowRepository = { findOne: jest.fn().mockResolvedValue(workflow) };
    mockWorkflowRunnerService = {
      startRun: jest.fn().mockResolvedValue({ jobHistory: {}, dispatched: 3 }),
    };
    mockEventBridge = { publishSafely: jest.fn().mockResolvedValue('1-0') };
    // One chainable builder: `clone()` hands back the same mock, so each
    // getRawMany call is staged in order (per-target counts, then previews).
    qb = {};
    for (const method of [
      'innerJoin',
      'where',
      'andWhere',
      'select',
      'addSelect',
      'groupBy',
      'addGroupBy',
      'orderBy',
      'limit',
      'clone',
    ]) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.getRawMany = jest.fn().mockResolvedValue([]);

    service = new UrlDiscoveryService(
      mockTargetRepository as unknown as Repository<Target>,
      { createQueryBuilder: () => qb } as unknown as Repository<DiscoveredUrl>,
      { workflowRepository: mockWorkflowRepository } as unknown as WorkflowsService,
      mockWorkflowRunnerService as unknown as WorkflowRunnerService,
      mockEventBridge as unknown as EventBridgeService,
    );
  });

  const runEnd = (
    filePath: string,
    scope: Record<string, string[]> | null = { targetIds: ['domain-1'] },
  ) =>
    ({
      jobHistory: { id: 'run-1', scope, workflow: { filePath } },
    }) as unknown as Job;

  describe('handleRunEnd', () => {
    it('publishes the new URLs of each target that gained some', async () => {
      qb.getRawMany
        .mockResolvedValueOnce([
          {
            targetId: 'domain-1',
            targetValue: 'example.com',
            workspaceId: 'ws-1',
            count: '37',
          },
          // Present in the scope but nothing new: no event.
          {
            targetId: 'domain-2',
            targetValue: 'example.org',
            workspaceId: 'ws-1',
            count: '0',
          },
        ])
        .mockResolvedValueOnce([
          { url: 'https://example.com/a' },
          { url: 'https://example.com/b' },
        ]);

      await service.handleRunEnd(runEnd('url_discovery.yaml'));

      // The run's own rows are its new URLs, bounded by the run's targets.
      expect(qb.where).toHaveBeenCalledWith('du.jobHistoryId = :runId', {
        runId: 'run-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('target.id IN (:...targetIds)', {
        targetIds: ['domain-1'],
      });
      expect(mockEventBridge.publishSafely).toHaveBeenCalledTimes(1);
      expect(mockEventBridge.publishSafely).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'asset.url.discovered' }),
        expect.objectContaining({
          workspaceId: 'ws-1',
          resourceId: 'run-1',
          payload: {
            jobHistoryId: 'run-1',
            targetId: 'domain-1',
            targetValue: 'example.com',
            count: 37,
            urls: ['https://example.com/a', 'https://example.com/b'],
          },
        }),
        { subject: 'workspace:ws-1/workflow_run:run-1' },
      );
    });

    it('bounds an asset-group run by its assets', async () => {
      await service.handleRunEnd(
        runEnd('url_discovery.yaml', { assetIds: ['asset-1'] }),
      );

      expect(qb.andWhere).toHaveBeenCalledWith('asset.id IN (:...assetIds)', {
        assetIds: ['asset-1'],
      });
    });

    it('ignores the end of any other workflow', async () => {
      await service.handleRunEnd(runEnd('domain_discovery.yaml'));

      expect(qb.getRawMany).not.toHaveBeenCalled();
      expect(mockEventBridge.publishSafely).not.toHaveBeenCalled();
    });

    it('does nothing for a run without a scope', async () => {
      await service.handleRunEnd(runEnd('url_discovery.yaml', null));

      expect(qb.getRawMany).not.toHaveBeenCalled();
    });

    it('never throws into the event emitter', async () => {
      qb.getRawMany.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.handleRunEnd(runEnd('url_discovery.yaml')),
      ).resolves.toBeUndefined();
      expect(mockEventBridge.publishSafely).not.toHaveBeenCalled();
    });
  });

  it('starts the url_discovery workflow of the workspace on the targets', async () => {
    const result = await service.discover(['domain-1'], 'ws-1');

    expect(mockWorkflowRepository.findOne).toHaveBeenCalledWith({
      where: { workspace: { id: 'ws-1' }, filePath: 'url_discovery.yaml' },
    });
    expect(mockWorkflowRunnerService.startRun).toHaveBeenCalledWith({
      workflow,
      workspaceId: 'ws-1',
      jobName: 'Url discovery - example.com',
      jobRunType: JobRunType.MANUAL,
      targetIds: ['domain-1'],
    });
    expect(result.message).toBe('Discovering URLs on 1 target(s)...');
  });

  it('only sends domain targets to the run', async () => {
    mockTargetRepository.find.mockResolvedValue([
      { id: 'domain-1', type: TargetType.DOMAIN, value: 'example.com' },
      { id: 'domain-2', type: TargetType.DOMAIN, value: 'example.org' },
      { id: 'ip-1', type: TargetType.IP, value: '203.0.113.1' },
      { id: 'cidr-1', type: TargetType.CIDR, value: '203.0.113.0/24' },
    ]);

    await service.discover(['domain-1', 'domain-2', 'ip-1', 'cidr-1'], 'ws-1');

    expect(mockWorkflowRunnerService.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: 'Url discovery - 2 targets',
        targetIds: ['domain-1', 'domain-2'],
      }),
    );
  });

  it('rejects when no target is a domain', async () => {
    mockTargetRepository.find.mockResolvedValue([
      { id: 'ip-1', type: TargetType.IP, value: '203.0.113.1' },
    ]);

    await expect(service.discover(['ip-1'], 'ws-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockWorkflowRunnerService.startRun).not.toHaveBeenCalled();
  });

  it('rejects when none of the targets belong to the workspace', async () => {
    mockTargetRepository.find.mockResolvedValue([]);

    await expect(service.discover(['domain-1'], 'ws-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockWorkflowRunnerService.startRun).not.toHaveBeenCalled();
  });

  it('rejects when the workflow is missing from the workspace', async () => {
    mockWorkflowRepository.findOne.mockResolvedValue(null);

    await expect(service.discover(['domain-1'], 'ws-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockWorkflowRunnerService.startRun).not.toHaveBeenCalled();
  });

  it('says so when the targets have no live HTTP service yet', async () => {
    mockWorkflowRunnerService.startRun.mockResolvedValue({
      jobHistory: {},
      dispatched: 0,
    });

    const result = await service.discover(['domain-1'], 'ws-1');

    expect(result.message).toBe(
      'No live HTTP services found. Run asset discovery first.',
    );
  });

  it('shipped url_discovery template runs gau on demand with an inline config', () => {
    const file = path.join(
      __dirname,
      '../workflows/templates/url_discovery.yaml',
    );
    const template = yaml.load(fs.readFileSync(file, 'utf8')) as {
      on?: unknown;
      jobs: Record<string, { run: string; config?: Record<string, unknown> }>;
    };

    // No trigger: the workflow only runs from the URLs tab.
    expect(template.on).toBeUndefined();
    const jobs = Object.values(template.jobs);
    expect(jobs.map((job) => job.run)).toEqual(['gau']);
    // gau has a configSchema: without a profile, an empty config fails the job.
    expect(Object.keys(jobs[0].config ?? {}).length).toBeGreaterThan(0);
    expect(jobs[0].config?.subs).toBe(false);
  });
});
