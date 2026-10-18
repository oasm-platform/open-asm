import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Repository } from 'typeorm';
import { TargetType } from '@/common/enums/enum';
import type { AgentsCompletionsService } from '../agents/agents.completions';
import type { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import type { WorkflowRunnerService } from '../jobs-registry/workflow-runner.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { Target } from '../targets/entities/target.entity';
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
  let mockTargetRepository: { find: jest.Mock };
  let mockWorkflowRunnerService: { startRun: jest.Mock };

  beforeEach(() => {
    mockJobRegistryService = { createNewJob: jest.fn() };
    mockToolsService = { getToolByNames: jest.fn() };
    mockWorkflowRepository = { findOne: jest.fn() };
    mockTargetRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 'target-1', type: TargetType.DOMAIN, value: 'example.com' },
        ]),
    };
    mockWorkflowRunnerService = { startRun: jest.fn() };

    service = new VulnerabilitiesService(
      {} as Repository<Vulnerability>,
      {} as Repository<VulnerabilityDismissal>,
      {} as Queue,
      mockJobRegistryService as unknown as JobsRegistryService,
      mockToolsService as unknown as ToolsService,
      { workflowRepository: mockWorkflowRepository } as unknown as WorkflowsService,
      {} as AgentsCompletionsService,
      {} as NotificationsService,
      mockTargetRepository as unknown as Repository<Target>,
      mockWorkflowRunnerService as unknown as WorkflowRunnerService,
    );
  });

  it('scan forwards inline config from the workflow first job to createNewJob', async () => {
    const config = { severity: ['critical', 'high'] };
    mockToolsService.getToolByNames.mockResolvedValue([
      { name: 'nuclei', priority: 4 },
    ]);
    mockWorkflowRepository.findOne.mockResolvedValue({
      id: 'workflow-1',
      content: {
        jobs: { vuls_scan: { name: 'Vuls Scan', run: 'nuclei', config } },
      },
    });

    await service.scan(['target-1'], 'ws-1');

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
      { name: 'nuclei', priority: 4 },
    ]);
    mockWorkflowRepository.findOne.mockResolvedValue({
      id: 'workflow-1',
      content: {
        jobs: { vuls_scan: { name: 'Vuls Scan', run: 'nuclei' } },
      },
    });

    await service.scan(['target-1'], 'ws-1');

    expect(mockJobRegistryService.createNewJob).toHaveBeenCalledWith(
      expect.objectContaining({
        config: undefined,
        configProfileId: undefined,
      }),
    );
  });

  it('scan forwards the first job category', async () => {
    mockToolsService.getToolByNames.mockResolvedValue([{ name: 'nuclei', priority: 4 }]);
    mockWorkflowRepository.findOne.mockResolvedValue({
      id: 'workflow-1',
      content: {
        jobs: { vuls_scan: { run: 'nuclei', category: 'vulnerabilities' } },
      },
    });

    await service.scan(['target-1'], 'ws-1');

    expect(mockJobRegistryService.createNewJob).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'vulnerabilities' }),
    );
  });

  it('scan sends host targets to nuclei and Git orgs to the repository_scan workflow', async () => {
    mockTargetRepository.find.mockResolvedValue([
      { id: 'domain-1', type: TargetType.DOMAIN, value: 'example.com' },
      { id: 'cidr-1', type: TargetType.CIDR, value: '10.0.0.0/24' },
      { id: 'ip-1', type: TargetType.IP, value: '10.0.0.1' },
      { id: 'org-1', type: TargetType.GIT_ORG, value: 'github.com/acme' },
    ]);
    mockToolsService.getToolByNames.mockResolvedValue([{ name: 'nuclei', priority: 4 }]);
    const hostWorkflow = {
      id: 'workflow-host',
      content: { jobs: { vuls_scan: { run: 'nuclei' } } },
    };
    const repositoryWorkflow = {
      id: 'workflow-repo',
      name: 'repository_scan',
      content: { jobs: { secret_scan: { run: 'gitleaks' } } },
    };
    mockWorkflowRepository.findOne.mockImplementation(
      ({ where }: { where: { filePath: string } }) =>
        where.filePath === 'repository_scan.yaml'
          ? repositoryWorkflow
          : hostWorkflow,
    );

    await service.scan(['domain-1', 'cidr-1', 'ip-1', 'org-1'], 'ws-1');

    expect(mockJobRegistryService.createNewJob).toHaveBeenCalledTimes(1);
    expect(mockJobRegistryService.createNewJob).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: hostWorkflow,
        targetIds: ['domain-1', 'cidr-1', 'ip-1'],
      }),
    );
    expect(mockWorkflowRunnerService.startRun).toHaveBeenCalledTimes(1);
    expect(mockWorkflowRunnerService.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: repositoryWorkflow,
        workspaceId: 'ws-1',
        jobName: 'repository_scan - github.com/acme',
        targetIds: ['org-1'],
      }),
    );
  });

  it('scan of only Git orgs never starts nuclei', async () => {
    mockTargetRepository.find.mockResolvedValue([
      { id: 'org-1', type: TargetType.GIT_ORG, value: 'github.com/acme' },
    ]);
    mockWorkflowRepository.findOne.mockResolvedValue({
      id: 'workflow-repo',
      name: 'repository_scan',
      content: { jobs: {} },
    });

    await service.scan(['org-1'], 'ws-1');

    expect(mockWorkflowRepository.findOne).toHaveBeenCalledTimes(1);
    expect(mockWorkflowRepository.findOne).toHaveBeenCalledWith({
      where: { workspace: { id: 'ws-1' }, filePath: 'repository_scan.yaml' },
    });
    expect(mockToolsService.getToolByNames).not.toHaveBeenCalled();
    expect(mockJobRegistryService.createNewJob).not.toHaveBeenCalled();
  });

  it('scan dispatches nothing when a required workflow is missing', async () => {
    mockTargetRepository.find.mockResolvedValue([
      { id: 'domain-1', type: TargetType.DOMAIN, value: 'example.com' },
      { id: 'org-1', type: TargetType.GIT_ORG, value: 'github.com/acme' },
    ]);
    mockWorkflowRepository.findOne.mockImplementation(
      ({ where }: { where: { filePath: string } }) =>
        where.filePath === 'repository_scan.yaml'
          ? null
          : { id: 'workflow-host', content: { jobs: {} } },
    );

    await expect(service.scan(['domain-1', 'org-1'], 'ws-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockJobRegistryService.createNewJob).not.toHaveBeenCalled();
    expect(mockWorkflowRunnerService.startRun).not.toHaveBeenCalled();
  });

  it('scan rejects when none of the targets belong to the workspace', async () => {
    mockTargetRepository.find.mockResolvedValue([]);

    await expect(service.scan(['other-ws-target'], 'ws-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockWorkflowRepository.findOne).not.toHaveBeenCalled();
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
      jobs: Record<string, { run: string; config?: { severity?: string[] } }>;
    };

    const job = Object.values(doc.jobs).find((j) => j.run === 'nuclei');
    expect(job).toBeDefined();
    // Full-coverage scan: nuclei must not skip any severity band.
    expect(new Set(job!.config?.severity)).toEqual(
      new Set(['info', 'low', 'medium', 'high', 'critical']),
    );
  });

  it('shipped vulnerability_scan_basic template matches the connector defaults (interactsh on, no redirects)', () => {
    const templatePath = path.join(
      __dirname,
      '..',
      'workflows',
      'templates',
      'vulnerability_scan_basic.yaml',
    );
    const doc = yaml.load(fs.readFileSync(templatePath, 'utf8')) as {
      jobs: Record<
        string,
        {
          run: string;
          config?: { interactsh?: boolean; followRedirects?: boolean };
        }
      >;
    };

    const job = Object.values(doc.jobs).find((j) => j.run === 'nuclei');
    expect(job).toBeDefined();
    // OOB/blind detection stays on; redirects stay off (following them floods
    // honeypot/echo targets with false positives).
    expect(job!.config?.interactsh).toBe(true);
    expect(job!.config?.followRedirects).toBe(false);
  });
});
