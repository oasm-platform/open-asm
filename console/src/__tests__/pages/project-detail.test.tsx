import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { within } from '@testing-library/react';
import ProjectDetail from '@/pages/projects/project-detail';

const ROUTE = '/projects/$id/$tab';
const at = (tab: string) => ({ routePath: ROUTE, initialEntries: [`/projects/project-1/${tab}`] });

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

const { projectRef, vulnsMock, removeAssetsMock, deleteMock } = vi.hoisted(() => ({
  projectRef: { value: {} as Record<string, unknown> },
  vulnsMock: vi.fn(),
  removeAssetsMock: vi.fn(),
  deleteMock: vi.fn(),
}));

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
  activity: [],
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
    useProjectsControllerGetVulnerabilities: (_id: string, params: unknown) => {
      vulnsMock(params);
      return { data: vulnerabilities, isLoading: false };
    },
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
    useProjectsControllerGetTriggers: () => ({ data: binding.triggers, isLoading: false }),
    // Mounted (closed) by the Workflows tab's editor sheet.
    useToolsControllerGetInstalledTools: () => ({ data: { data: [] }, isLoading: false }),
    useProjectsControllerGetWorkflowTemplates: () => ({ data: [], isLoading: false }),
    useProjectsControllerGetMany: () => ({ data: { data: [] }, isLoading: false }),
    useProjectsControllerGetWorkflows: () => ({ data: [], isLoading: false }),
    useProjectsControllerGetAssetCandidates: () => ({ data: undefined, isLoading: false }),
    useProjectsControllerCreateWorkflow: idle,
    useProjectsControllerUpdateWorkflow: idle,
    useProjectsControllerUpdate: idle,
    useProjectsControllerAddAssets: idle,
    useProjectsControllerRemoveAssets: () => ({ mutate: removeAssetsMock, isPending: false }),
    useProjectsControllerDelete: () => ({ mutate: deleteMock, isPending: false }),
    useProjectsControllerArchive: idle,
    useProjectsControllerUnarchive: idle,
    useProjectsControllerRunWorkflow: idle,
    useProjectsControllerReplaceScopeRules: idle,
    useProjectsControllerPreviewScope: idle,
    useProjectsControllerUpdateTrigger: idle,
    useProjectsControllerRemoveTrigger: idle,
    useProjectsControllerCreateTrigger: idle,
    useProjectsControllerRemoveWorkflow: idle,
  };
});

beforeEach(() => {
  projectRef.value = baseProject();
  vulnsMock.mockReset();
  removeAssetsMock.mockReset();
  deleteMock.mockReset();
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

  it('keeps the tab in the URL', async () => {
    const { user, router } = renderWithProviders(<ProjectDetail />, at('overview'));

    await user.click(await screen.findByRole('tab', { name: /Runs/ }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/projects/project-1/runs');
    });
  });

  it('lists vulnerabilities with provenance and filters by it', async () => {
    const { user } = renderWithProviders(<ProjectDetail />, at('vulnerabilities'));

    expect(await screen.findByText('SQL injection')).toBeInTheDocument();
    expect(screen.getByText('Recurring ×3')).toBeInTheDocument();
    const group = screen.getByRole('tablist', { name: 'Provenance' });
    await user.click(within(group).getByRole('tab', { name: /^New/ }));

    await waitFor(() => {
      expect(vulnsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ provenance: 'new', status: 'open' }),
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

  it('makes an archived project read-only', async () => {
    projectRef.value = { ...baseProject(), archivedAt: '2026-01-05T00:00:00Z' };
    renderWithProviders(<ProjectDetail />, at('overview'));

    expect(await screen.findByText('Archived')).toBeInTheDocument();
    expect(screen.getByText(/This project is archived/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Run/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Edit/ })).toBeDisabled();
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
