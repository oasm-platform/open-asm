import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { Queue } from 'bullmq';
import type { Repository } from 'typeorm';
import type { AgentsCompletionsService } from '../agents/agents.completions';
import type { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { ToolsService } from '../tools/tools.service';
import type { WorkflowsService } from '../workflows/workflows.service';
import type { VulnerabilityDismissal } from './entities/vulnerability-dismissal.entity';
import type { Vulnerability } from './entities/vulnerability.entity';
import { VulnerabilitiesService } from './vulnerabilities.service';

describe('VulnerabilitiesService', () => {
  let service: VulnerabilitiesService;
  let mockJobRegistryService: { createNewJob: jest.Mock };
  let mockWorkflowRepository: { findOne: jest.Mock };
  let mockToolsService: { getToolByNames: jest.Mock };

  beforeEach(() => {
    mockJobRegistryService = { createNewJob: jest.fn() };
    mockToolsService = { getToolByNames: jest.fn() };
    mockWorkflowRepository = { findOne: jest.fn() };

    service = new VulnerabilitiesService(
      {} as Repository<Vulnerability>,
      {} as Repository<VulnerabilityDismissal>,
      {} as Queue,
      mockJobRegistryService as unknown as JobsRegistryService,
      mockToolsService as unknown as ToolsService,
      { workflowRepository: mockWorkflowRepository } as unknown as WorkflowsService,
      {} as AgentsCompletionsService,
      {} as NotificationsService,
    );
  });

  it('scan forwards inline config from the workflow first job to createNewJob', async () => {
    const config = { severity: ['critical', 'high'] };
    mockToolsService.getToolByNames.mockResolvedValue([
      { name: 'nuclei', priority: 4, category: 'vulnerability' },
    ]);
    mockWorkflowRepository.findOne.mockResolvedValue({
      id: 'workflow-1',
      content: {
        jobs: [{ name: 'Vuls Scan', run: 'nuclei', config }],
      },
    });

    await service.scan('target-1', 'ws-1');

    expect(mockJobRegistryService.createNewJob).toHaveBeenCalledTimes(1);
    expect(mockJobRegistryService.createNewJob).toHaveBeenCalledWith(
      expect.objectContaining({
        config,
        targetIds: ['target-1'],
        workspaceId: 'ws-1',
      }),
    );
  });

  it('scan forwards undefined config when the workflow first job has none', async () => {
    mockToolsService.getToolByNames.mockResolvedValue([
      { name: 'nuclei', priority: 4, category: 'vulnerability' },
    ]);
    mockWorkflowRepository.findOne.mockResolvedValue({
      id: 'workflow-1',
      content: {
        jobs: [{ name: 'Vuls Scan', run: 'nuclei' }],
      },
    });

    await service.scan('target-1', 'ws-1');

    expect(mockJobRegistryService.createNewJob).toHaveBeenCalledWith(
      expect.objectContaining({
        config: undefined,
        configProfileId: undefined,
      }),
    );
  });

  it('shipped vulnerability_scan_basic template scans ALL severities', () => {
    const templatePath = path.join(
      __dirname,
      '..',
      'workflows',
      'templates',
      'vulnerability_scan_basic.yaml',
    );
    const doc = yaml.load(fs.readFileSync(templatePath, 'utf8')) as {
      jobs: { run: string; config?: { severity?: string[] } }[];
    };

    const job = doc.jobs.find((j) => j.run === 'nuclei');
    expect(job).toBeDefined();
    // Full-coverage scan: nuclei must not skip any severity band.
    expect(new Set(job!.config?.severity)).toEqual(
      new Set(['info', 'low', 'medium', 'high', 'critical']),
    );
  });
});
