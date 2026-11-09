import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { within } from '@testing-library/react';
import ProjectDetail from '@/pages/projects/project-detail';

const ROUTE = '/projects/$id/$tab';
const at = (tab: string, query = '') => ({
  routePath: ROUTE,
  initialEntries: [`/projects/project-1/${tab}${query}`],
});

const binding = {
  id: 'b-1',
  projectId: 'project-1',
  workflowId: 'w-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  workflow: {
    id: 'w-1',
    name: 'Recon and vuln scan',
    filePath: 'project-project-1-abc.yaml',
    content: {
      name: 'Recon and vuln scan',
      jobs: { subfinder: { run: 'subfinder' }, nuclei: { run: 'nuclei', needs: ['subfinder'] } },
    },
  },
  triggers: [
    {
      id: 't-1',
      projectWorkflowId: 'b-1',
      type: 'cron',
      cron: '0 2 * * 1',
      enabled: true,
      config: {},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  lastRun: null,
};

const tools = ['subfinder', 'nuclei'].map((name) => ({
  id: `tool-${name}`,
  name,
  description: name,
  categories: [{ name: 'vulnerabilities', targetTypes: [] }],
  createdAt: '2026-01-01T00:00:00Z',
}));

const {
  projectRef,
  workflowsRef,
  vulnsMock,
  statsMock,
  removeAssetsMock,
  deleteMock,
  updateWorkflowMock,
} = vi.hoisted(
  () => ({
    projectRef: { value: {} as Record<string, unknown> },
    workflowsRef: { value: [] as unknown[] },
    vulnsMock: vi.fn(),
    statsMock: vi.fn(),
    removeAssetsMock: vi.fn(),
    deleteMock: vi.fn(),
    updateWorkflowMock: vi.fn(),
  }),
);

const baseProject = () => ({
  id: 'project-1',
  name: 'Web Servers',
  hexColor: '#3b82f6',
  description: 'Public hosts of example.com',
  autoAddAssets: true,
  archivedAt: null,
  totalAssets: 2,
  projectWorkflows: [binding],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const overview = {
  totalAssets: 2,
  newAssets: 1,
  workflows: 1,
  openVulnerabilities: { critical: 1, high: 2, medium: 0, low: 0, info: 0 },
  newVulnerabilities: 1,
  newVulnerabilityRuns: [],
  lastRun: null,
  weekly: Array.from({ length: 8 }, (_, i) => ({
    week: `2026-01-${String(i * 7 + 1).padStart(2, '0')}`,
    critical: i === 7 ? 1 : 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  })),
  activity: [
    {
      kind: 'audit',
      at: '2026-01-05T00:00:00Z',
      ref: 'project.updated',
      change: 'assets.discovered',
      added: 12,
    },
    {
      kind: 'audit',
      at: '2026-01-04T00:00:00Z',
      ref: 'project.updated',
      change: 'workflow.added',
      workflowName: 'Web scan',
      actorName: 'Admin',
    },
    {
      kind: 'audit',
      at: '2026-01-03T00:00:00Z',
      ref: 'project.updated',
      change: 'assets.removed',
      removed: 3,
      actorName: 'Admin',
    },
    {
      kind: 'audit',
      at: '2026-01-03T00:00:00Z',
      ref: 'project.updated',
      change: 'scope',
      added: 5,
      removed: 1,
      actorName: 'Admin',
    },
    {
      kind: 'dismissed',
      at: '2026-01-02T00:00:00Z',
      ref: 'dismissed',
      count: 2,
      reason: 'false_positive',
      actorName: 'Admin',
    },
    {
      kind: 'audit',
      at: '2026-01-01T00:00:00Z',
      ref: 'project.created',
      added: 2,
      actorName: 'Admin',
    },
  ],
};

const vulnerabilities = {
  data: [
    {
      id: 'v-1',
      name: 'SQL injection',
      severity: 'critical',
      assetId: 'a-1',
      assetValue: 'api.example.com',
      toolName: 'nuclei',
      status: 'open',
      provenance: 'recurring',
      timesSeen: 3,
      firstSeen: { runId: 'run-1', at: '2026-01-01T00:00:00Z' },
      lastSeen: { runId: 'run-3', at: '2026-01-03T00:00:00Z' },
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  pageCount: 1,
  hasNextPage: false,
  provenanceCounts: { all: 3, new: 1, recurring: 1, notSeen: 1 },
  severityCounts: { critical: 1, high: 2, medium: 0, low: 0, info: 0 },
};

/** The workspace list filtered by the project: rows carry their sighting. */
const workspaceVulnerabilities = {
  data: [
    {
      id: 'v-1',
      name: 'SQL injection',
      severity: 'critical',
      detectionStatus: 'active',
      reviewStatus: 'approved',
      timesDetected: 3,
      asset: { id: 'a-1', value: 'api.example.com' },
      sources: [],
      dismissal: null,
      openIssue: null,
      projectSighting: {
        provenance: 'recurring',
        timesSeen: 3,
        firstSeen: { runId: 'run-1', at: '2026-01-01T00:00:00Z' },
        lastSeen: { runId: 'run-3', at: '2026-01-03T00:00:00Z' },
      },
    },
  ],
  total: 1,
  page: 1,
  limit: 10,
  pageCount: 1,
  hasNextPage: false,
};

const projectStats = {
  data: [{ severity: 'critical', count: 1 }],
  byDetectionStatus: { new: 0, active: 1, resurfaced: 0, fixed: 0 },
  newLast7Days: 0,
  resurfacedLast30Days: 0,
  fixedLast30Days: 0,
  overdue: 0,
  pendingReview: 0,
  mttr: [],
  provenanceCounts: { new: 1, recurring: 1, notSeen: 1 },
};

const assets = {
  data: [
    {
      id: 'a-1',
      value: 'api.example.com',
      targetId: 't-1',
      targetValue: 'example.com',
      targetType: 'DOMAIN',
      source: 'rule',
      rule: { id: 'r-1', type: 'hostname', value: '*.example.com', label: '*.example.com' },
      addedAt: '2026-01-01T00:00:00Z',
      vulnerabilities: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
      lastScan: null,
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  pageCount: 1,
  hasNextPage: false,
};

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceSelector: () => ({
    workspaces: [{ id: 'ws-1', name: 'Test Workspace' }],
    selectedWorkspace: 'ws-1',
    isLoading: false,
  }),
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'ws-1' } }),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    permissions: ['*'],
    isOwner: true,
    hasPermission: () => true,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/services/apis/gen/queries')
  >();
  const idle = () => ({ mutate: vi.fn(), isPending: false });
  return {
    ...actual,
    useProjectsControllerGetById: () => ({ data: projectRef.value, isLoading: false }),
    useProjectsControllerGetOverview: () => ({ data: overview, isLoading: false }),
    useProjectsControllerGetVulnerabilities: () => ({ data: vulnerabilities, isLoading: false }),
    useVulnerabilitiesControllerGetVulnerabilities: (params: unknown) => {
      vulnsMock(params);
      return { data: workspaceVulnerabilities, isLoading: false };
    },
    useVulnerabilitiesControllerGetVulnerabilitiesStatistics: (params: unknown) => {
      statsMock(params);
      return { data: projectStats, isLoading: false };
    },
    useVulnerabilitiesControllerGetSettings: () => ({ data: { slaDays: { high: 30 } } }),
    useProjectsControllerGetVulnerabilityTimeline: () => ({ data: undefined, isLoading: false }),
    useProjectsControllerGetAssets: () => ({ data: assets, isLoading: false }),
    useProjectsControllerGetScopeRules: () => ({
      data: {
        rules: [
          {
            id: 'r-1',
            mode: 'include',
            type: 'hostname',
            value: '*.example.com',
            label: '*.example.com',
            matched: 1,
          },
        ],
        autoAddAssets: true,
        ruleAssets: 1,
        manualAssets: 1,
      },
    }),
    useProjectsControllerGetTriggers: () => ({
      data: (
        projectRef.value.projectWorkflows as Array<{ triggers: unknown[] }>
      ).flatMap((workflow) => workflow.triggers),
      isLoading: false,
    }),
    // Mounted (closed) by the Workflows tab's editor sheet.
    useToolsControllerGetInstalledTools: () => ({ data: { data: tools }, isLoading: false }),
    useProjectsControllerGetWorkflowTemplates: () => ({ data: [], isLoading: false }),
    useProjectsControllerGetMany: () => ({ data: { data: [] }, isLoading: false }),
    useProjectsControllerGetWorkflows: (id: string) => ({
      data: id === 'project-1' ? workflowsRef.value : [],
      isLoading: false,
    }),
    useProjectsControllerGetAssetCandidates: () => ({ data: undefined, isLoading: false }),
    useProjectsControllerCreateWorkflow: idle,
    useProjectsControllerUpdateWorkflow: () => ({ mutate: updateWorkflowMock, isPending: false }),
    useProjectsControllerUpdate: idle,
    useProjectsControllerAddAssets: idle,
    useProjectsControllerRemoveAssets: () => ({ mutate: removeAssetsMock, isPending: false }),
    useProjectsControllerDelete: () => ({ mutate: deleteMock, isPending: false }),
    useProjectsControllerArchive: idle,
    useProjectsControllerUnarchive: idle,
    useProjectsControllerRunWorkflow: idle,
    useProjectsControllerReplaceScopeRules: idle,
    useProjectsControllerPreviewScope: idle,
    useProjectsControllerRemoveWorkflow: idle,
  };
});

beforeEach(() => {
  projectRef.value = baseProject();
  workflowsRef.value = [];
  vulnsMock.mockReset();
  statsMock.mockReset();
  removeAssetsMock.mockReset();
  deleteMock.mockReset();
  updateWorkflowMock.mockReset();
});

describe('Project detail page', () => {
  it('shows the project header, tabs with counts and the overview', async () => {
    renderWithProviders(<ProjectDetail />, at('overview'));

    expect(await screen.findByRole('heading', { name: 'Web Servers' })).toBeInTheDocument();
    expect(screen.queryByText('Public hosts of example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Assets\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Vulnerabilities\s*3/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Workflows\s*1/ })).toBeInTheDocument();
    expect(screen.getByText('Open vulnerabilities')).toBeInTheDocument();
    expect(screen.getByText('New vulnerabilities per week')).toBeInTheDocument();
  });

  it('opens an agent chat locked to the project', async () => {
    renderWithProviders(<ProjectDetail />, at('overview'));

    const link = await screen.findByRole('link', { name: 'Chat with agent' });
    expect(link.getAttribute('href')).toMatch(
      /^\/aistudio\/?\?projectId=project-1&mode=agent$/,
    );
  });

  it('says what changed in the recent activity', async () => {
    renderWithProviders(<ProjectDetail />, at('overview'));

    const card = (await screen.findByText('Recent activity')).closest('[data-slot="card"]');
    const text = (card as HTMLElement).textContent ?? '';
    expect(text).toContain('+12 assets discovered, matching the scope rules');
    expect(text).toContain('Workflow Web scan added by Admin');
    expect(text).toContain('−3 assets removed by Admin');
    expect(text).toContain('+5 / −1 assets with a scope rule change by Admin');
    expect(text).toContain('2 vulnerabilities dismissed · false positive by Admin');
    expect(text).toContain('Project created with 2 assets by Admin');
  });

  it('opens a vulnerability to fix in the same sheet as the Vulnerabilities tab', async () => {
    const { user, router } = renderWithProviders(<ProjectDetail />, at('overview'));

    await user.click(await screen.findByRole('button', { name: /SQL injection/ }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => {
      expect((router.state.location.search as { vulnerability?: string }).vulnerability).toBe(
        'v-1',
      );
    });
    expect(router.state.location.pathname).toBe('/projects/project-1/overview');
  });

  it('keeps the tab in the URL', async () => {
    const { user, router } = renderWithProviders(<ProjectDetail />, at('overview'));

    await user.click(await screen.findByRole('tab', { name: /Runs/ }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/projects/project-1/runs');
    });
  });

  it('lists the project vulnerabilities like the workspace list, with provenance', async () => {
    renderWithProviders(<ProjectDetail />, at('vulnerabilities'));

    expect(await screen.findByText('SQL injection')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Provenance' })).toBeInTheDocument();
    expect(screen.getByText('Recurring ×3')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Provenance' })).toBeInTheDocument();
    // The lifecycle cards of the Vulnerabilities page, scoped to the project
    expect(screen.getByText('MTTR high')).toBeInTheDocument();
    expect(statsMock).toHaveBeenLastCalledWith({ projectId: 'project-1' });
    expect(vulnsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectId: 'project-1', provenance: undefined }),
    );
  });

  it('keeps the provenance and run filters of a run link', async () => {
    renderWithProviders(
      <ProjectDetail />,
      at('vulnerabilities', '?provenance=new&run=run-3abcdef'),
    );

    expect(await screen.findByRole('button', { name: 'Clear the run filter' })).toHaveTextContent(
      'Run #run-3a',
    );
    await waitFor(() => {
      expect(vulnsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          provenance: 'new',
          jobHistoryId: 'run-3abcdef',
        }),
      );
    });
  });

  it('shows the scope rules and removes a rule-added asset after confirming', async () => {
    const { user } = renderWithProviders(<ProjectDetail />, at('assets'));

    expect(await screen.findByText('api.example.com')).toBeInTheDocument();
    expect(screen.getByText('+ 1 picked by hand')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove api.example.com' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/adds an exclude rule/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /confirm/i }));

    expect(removeAssetsMock).toHaveBeenCalledWith(
      { id: 'project-1', data: { assetIds: ['a-1'] } },
      expect.anything(),
    );
  });

  it('shows the pipeline steps and triggers of each workflow', async () => {
    renderWithProviders(<ProjectDetail />, at('workflows'));

    expect(await screen.findByText('Recon and vuln scan', { selector: '[data-slot="card-title"]' })).toBeInTheDocument();
    expect(screen.getByLabelText('Pipeline')).toHaveTextContent('subfindernuclei');
    expect(screen.getByRole('button', { name: /Add workflow/ })).toBeEnabled();
  });

  it('shows a workflow as its file', async () => {
    const { user } = renderWithProviders(<ProjectDetail />, at('workflows'));

    await user.click(await screen.findByRole('button', { name: 'View workflow' }));

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Workflow definition')).toBeInTheDocument();
    expect(sheet).toHaveTextContent('name: Recon and vuln scan');
    expect(sheet).toHaveTextContent('run: nuclei');
    expect(sheet).toHaveTextContent('- subfinder');
  });

  it('sets when a workflow runs while editing it', async () => {
    const { user } = renderWithProviders(<ProjectDetail />, at('workflows'));

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const sheet = await screen.findByRole('dialog');
    const active = within(sheet).getByRole('switch', { name: 'Schedule 1 active' });
    expect(active).toBeChecked();
    await user.click(active);
    await user.click(within(sheet).getByRole('button', { name: 'Add schedule' }));
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));

    expect(updateWorkflowMock).toHaveBeenCalledWith(
      {
        id: 'project-1',
        bindingId: 'b-1',
        data: {
          name: 'Recon and vuln scan',
          tools: [{ toolId: 'tool-subfinder' }, { toolId: 'tool-nuclei', stage: 2 }],
          on: {
            schedule: [
              { cron: '0 2 * * 1', enabled: false },
              { cron: expect.stringMatching(/^\S+ \S+ \S+ \S+ \S+$/), enabled: true },
            ],
            events: [],
          },
        },
      },
      expect.anything(),
    );
  });

  it('does not save two schedules at the same time', async () => {
    const { user } = renderWithProviders(<ProjectDetail />, at('workflows'));

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const sheet = await screen.findByRole('dialog');
    // A new schedule starts at the same default time as the one before.
    await user.click(within(sheet).getByRole('button', { name: 'Add schedule' }));
    await user.click(within(sheet).getByRole('button', { name: 'Add schedule' }));

    expect(await within(sheet).findByText(/Same time as Schedule 2/)).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.click(within(sheet).getByRole('button', { name: 'Remove schedule 3' }));
    expect(within(sheet).queryByText(/Same time as/)).not.toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('runs a workflow after another of the project', async () => {
    const crawl = {
      ...binding,
      id: 'b-2',
      workflow: { ...binding.workflow, id: 'w-2', name: 'Crawl' },
      triggers: [],
    };
    workflowsRef.value = [binding, crawl];
    const { user } = renderWithProviders(<ProjectDetail />, at('workflows'));

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(
      within(sheet).getByRole('checkbox', { name: 'After another workflow of this project' }),
    );
    // The workflow being edited is not one it can follow.
    expect(within(sheet).queryByRole('checkbox', { name: 'Recon and vuln scan' })).toBeNull();
    await user.click(within(sheet).getByRole('checkbox', { name: 'Crawl' }));
    await user.click(within(sheet).getByRole('checkbox', { name: 'Failed' }));
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));

    expect(updateWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          on: expect.objectContaining({
            events: [
              {
                event: 'project.run.completed',
                enabled: true,
                windowMinutes: 10,
                maxAssets: 200,
                targetTypes: [],
                workflows: ['Crawl'],
                status: ['success', 'failure'],
              },
            ],
          }),
        }),
      }),
      expect.anything(),
    );
  });

  it('cannot follow another workflow when the project has none', async () => {
    const { user } = renderWithProviders(<ProjectDetail />, at('workflows'));

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const sheet = await screen.findByRole('dialog');
    expect(
      within(sheet).getByRole('checkbox', { name: 'After another workflow of this project' }),
    ).toBeDisabled();
    expect(within(sheet).getByText(/Add another workflow to the project/)).toBeInTheDocument();
  });

  it('describes event triggers on the Schedule tab', async () => {
    projectRef.value = {
      ...baseProject(),
      projectWorkflows: [
        {
          ...binding,
          triggers: [
            {
              id: 't-2',
              projectWorkflowId: 'b-1',
              type: 'event',
              cron: null,
              event: 'vulnerability.detected',
              enabled: true,
              config: { windowMinutes: 0, maxAssets: 50, severity: ['critical'] },
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
        },
      ],
    };
    renderWithProviders(<ProjectDetail />, at('schedule'));

    const row = await screen.findByRole('row', { name: /Vulnerability found/ });
    expect(row).toHaveTextContent('On critical findings');
    expect(row).toHaveTextContent('starts right away · up to 50 assets/run');
  });

  it('shows when workflows run on the Schedule tab, without editing there', async () => {
    renderWithProviders(<ProjectDetail />, at('schedule'));

    expect(await screen.findByText('Next 7 days')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Recon and vuln scan/ });
    expect(row).toHaveTextContent('0 2 * * 1 · UTC');
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(within(row).queryByRole('switch')).not.toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add trigger/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Workflows' })).toHaveAttribute(
      'href',
      '/projects/project-1/workflows',
    );
  });

  it('makes an archived project read-only', async () => {
    projectRef.value = { ...baseProject(), archivedAt: '2026-01-05T00:00:00Z' };
    renderWithProviders(<ProjectDetail />, at('overview'));

    expect(await screen.findByText('Archived')).toBeInTheDocument();
    expect(screen.getByText(/This project is archived/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Run/ })).toBeDisabled();
  });

  it('deletes the project after typing the confirmation', async () => {
    deleteMock.mockImplementation((_vars, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    const { user, router, queryClient } = renderWithProviders(
      <ProjectDetail />,
      at('settings'),
    );
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'delete');
    await user.click(within(dialog).getByRole('button', { name: /confirm|delete/i }));

    expect(deleteMock).toHaveBeenCalledWith({ id: 'project-1' }, expect.anything());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/projects');
    });
    // The list refreshes; the deleted project's own queries don't refetch.
    const { predicate } = invalidateSpy.mock.calls[0][0] as {
      predicate: (query: { queryKey: unknown[] }) => boolean;
    };
    expect(predicate({ queryKey: ['/api/projects', {}] })).toBe(true);
    expect(predicate({ queryKey: ['/api/projects/project-2'] })).toBe(true);
    expect(predicate({ queryKey: ['/api/projects/project-1/overview'] })).toBe(false);
  });
});
