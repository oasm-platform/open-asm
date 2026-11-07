import {
  IssueLinkResourceType,
  IssuePriority,
  Severity,
  VulnerabilityDiscoveredBy,
} from '@/common/enums/enum';
import { getVulnerabilitiesSchema, listIssuesSchema } from '@/mcp/mcp.schema';
import { VulnerabilityStatus } from '@/modules/vulnerabilities/vulnerability-status';

import type { ToolCallOptions } from './types';
import { getVulnerabilitiesTool, listIssuesTool } from './workspace.tools';

const W = 'w1';
const V1 = '11111111-1111-4111-8111-111111111111';
const call = { toolCallId: 't1' } as ToolCallOptions;
const page = <T>(data: T[]) => ({
  data,
  total: data.length,
  page: 1,
  limit: 100,
  pageCount: 1,
  hasNextPage: false,
});

type Executable = {
  execute: (params: unknown, options: ToolCallOptions) => Promise<unknown>;
};

describe('discover_vulnerabilities', () => {
  const vulnerability = {
    id: V1,
    name: 'SQL injection',
    severity: Severity.HIGH,
    description: 'long text the list leaves out',
    asset: { id: 'a1', value: 'app.example.com' },
    detectionStatus: 'resurfaced',
    reviewStatus: 'approved',
    discoveredBy: VulnerabilityDiscoveredBy.AI_TOOL,
    dueAt: new Date('2026-11-01'),
    timesDetected: 3,
    firstDetectedDate: new Date('2026-10-01'),
    lastSeenDate: new Date('2026-11-05'),
    cveId: ['CVE-2026-1'],
    cvssScore: 8.1,
    dismissal: null,
    openIssue: { id: 'i1', no: 4, status: 'open' },
  };

  function setup() {
    const deps = {
      vulnerabilitiesService: {
        getVulnerabilities: jest.fn().mockResolvedValue(page([vulnerability])),
      },
      projectResultsService: {
        vulnerabilities: jest.fn().mockResolvedValue(page([])),
      },
    };
    const tool = getVulnerabilitiesTool(
      deps as never,
      W,
    ) as unknown as Executable;
    return { deps, tool };
  }

  it('accepts every lifecycle status', () => {
    for (const status of Object.values(VulnerabilityStatus)) {
      expect(getVulnerabilitiesSchema.safeParse({ status }).success).toBe(true);
    }
    expect(
      getVulnerabilitiesSchema.safeParse({ status: 'closed' }).success,
    ).toBe(false);
  });

  it('passes the lifecycle filters to the list, most severe first', async () => {
    const { deps, tool } = setup();

    await tool.execute(
      {
        q: 'sql',
        status: VulnerabilityStatus.RESURFACED,
        severity: [Severity.HIGH],
        overdue: true,
        discoveredBy: [VulnerabilityDiscoveredBy.AI],
        tags: ['sqli'],
        createdFrom: '2026-10-01',
      },
      call,
    );

    expect(deps.vulnerabilitiesService.getVulnerabilities).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: 'severity',
        q: 'sql',
        status: VulnerabilityStatus.RESURFACED,
        severity: [Severity.HIGH],
        overdue: true,
        discoveredBy: [VulnerabilityDiscoveredBy.AI],
        tags: ['sqli'],
        createdFrom: '2026-10-01',
      }),
      W,
    );
  });

  it('returns the lifecycle fields of each finding, not the full record', async () => {
    const { tool } = setup();

    const result = (await tool.execute({}, call)) as {
      data: Record<string, unknown>[];
    };

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: V1,
        asset: 'app.example.com',
        detectionStatus: 'resurfaced',
        discoveredBy: VulnerabilityDiscoveredBy.AI_TOOL,
        timesDetected: 3,
        dismissal: null,
        openIssue: { id: 'i1', no: 4, status: 'open' },
      }),
    );
    expect(result.data[0]).not.toHaveProperty('description');
  });
});

describe('enumerate_open_issues', () => {
  function setup(userId?: string) {
    const deps = {
      issuesService: { getMany: jest.fn().mockResolvedValue(page([])) },
    };
    const tool = listIssuesTool(deps as never, W, {
      userId,
    }) as unknown as Executable;
    return { deps, tool };
  }

  it('passes priority, assignee, overdue and link filters with the user', async () => {
    const { deps, tool } = setup('u1');
    const params = listIssuesSchema.parse({
      priority: [IssuePriority.P1],
      mine: true,
      overdue: true,
      resourceType: IssueLinkResourceType.VULNERABILITY,
      resourceId: V1,
    });

    await tool.execute(params, call);

    expect(deps.issuesService.getMany).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: [IssuePriority.P1],
        mine: true,
        overdue: true,
        resourceType: IssueLinkResourceType.VULNERABILITY,
        resourceId: V1,
      }),
      W,
      'u1',
    );
  });

  it('answers "mine" without a user instead of failing the call', async () => {
    const { deps, tool } = setup();

    const result = await tool.execute({ mine: true }, call);

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(deps.issuesService.getMany).not.toHaveBeenCalled();
  });
});
