import type { Repository } from 'typeorm';
import type { Workflow } from './entities/workflow.entity';
import type { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkflowTemplateService } from './workflow-template.service';

/**
 * `workflow.content` is jsonb and Postgres does not preserve object key order —
 * it re-sorts keys by length, then bytes. These tests pin the boot-time
 * "default workflow changed?" comparison against that: without an
 * order-insensitive comparison every API start rewrites every default workflow
 * of every workspace, which is a write per template per boot for no reason.
 */
describe('WorkflowTemplateService', () => {
  const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
  const TEMPLATE = 'domain_discovery.yaml';

  let service: WorkflowTemplateService;
  let workflowRepository: {
    findOne: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
  };

  /** Rebuilds an object with the key order Postgres gives back from a jsonb round trip. */
  function asStoredJsonb<T>(value: T): T {
    if (Array.isArray(value)) {
      const list: unknown[] = value;
      return list.map((entry) => asStoredJsonb(entry)) as unknown as T;
    }
    if (value === null || typeof value !== 'object') {
      return value;
    }
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.length - b.length || a.localeCompare(b),
    );
    return Object.fromEntries(
      entries.map(([key, entry]) => [key, asStoredJsonb(entry)]),
    ) as T;
  }

  /** The content the loader would store, taken from the first (insert) pass. */
  function storedContent(): Record<string, unknown> {
    expect(workflowRepository.insert).toHaveBeenCalledTimes(1);
    const call = workflowRepository.insert.mock.calls[0] as [
      { content: Record<string, unknown> },
    ];
    return call[0].content;
  }

  beforeEach(() => {
    workflowRepository = {
      findOne: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };
    service = new WorkflowTemplateService(
      workflowRepository as unknown as Repository<Workflow>,
      { find: jest.fn() } as unknown as Repository<Workspace>,
    );
    // Only the recon chain is exercised: it is the shipped template with more
    // than one job, which is the only shape where jsonb can reorder anything.
    jest.spyOn(service, 'listTemplates').mockResolvedValue([TEMPLATE]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores the jobs map in dependency order', async () => {
    workflowRepository.findOne.mockResolvedValue(null);

    await service.createDefaultWorkflows(WORKSPACE_ID);

    const content = storedContent();
    expect(Object.keys(content.jobs as Record<string, unknown>)).toEqual([
      'scan_subdomain',
      'port_scan',
      'http_probe',
      'take_screenshot',
    ]);
  });

  it('does not rewrite a stored workflow whose jsonb key order differs', async () => {
    workflowRepository.findOne.mockResolvedValue(null);
    await service.createDefaultWorkflows(WORKSPACE_ID);
    const content = storedContent();

    workflowRepository.findOne.mockResolvedValue({
      id: 'workflow-1',
      name: 'Domain discovery',
      content: asStoredJsonb(content),
    });
    workflowRepository.insert.mockClear();
    workflowRepository.update.mockClear();

    await service.createDefaultWorkflows(WORKSPACE_ID);

    expect(workflowRepository.update).not.toHaveBeenCalled();
  });

  it('rewrites a stored workflow whose content really changed', async () => {
    workflowRepository.findOne.mockResolvedValue(null);
    await service.createDefaultWorkflows(WORKSPACE_ID);
    const content = storedContent();

    const edited = asStoredJsonb(content) as {
      jobs: Record<string, { needs?: string[] }>;
    };
    // The chain is broken: port_scan no longer waits for the subdomain scan.
    delete edited.jobs.port_scan.needs;

    workflowRepository.findOne.mockResolvedValue({
      id: 'workflow-1',
      name: 'Domain discovery',
      content: edited,
    });
    workflowRepository.update.mockClear();

    await service.createDefaultWorkflows(WORKSPACE_ID);

    expect(workflowRepository.update).toHaveBeenCalledWith(
      { id: 'workflow-1' },
      expect.objectContaining({ content }),
    );
  });

  it('renames a stored workflow whose display name drifted', async () => {
    workflowRepository.findOne.mockResolvedValue(null);
    await service.createDefaultWorkflows(WORKSPACE_ID);
    const content = storedContent();

    workflowRepository.findOne.mockResolvedValue({
      id: 'workflow-1',
      name: 'domain_discovery',
      content: asStoredJsonb(content),
    });
    workflowRepository.update.mockClear();

    await service.createDefaultWorkflows(WORKSPACE_ID);

    expect(workflowRepository.update).toHaveBeenCalledWith(
      { id: 'workflow-1' },
      // The content is rewritten along with the name; only the name drifted.
      expect.objectContaining({ name: 'Domain discovery' }),
    );
  });
});
