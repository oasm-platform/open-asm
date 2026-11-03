import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { CreateProject } from '@/pages/projects/create-project';

const mockHosts = [
  {
    id: 'asset-1',
    host: 'https://example.com',
    targetId: 't-1',
    isEnabled: true,
    assetCount: 3,
  },
  {
    id: 'asset-2',
    host: 'https://api.example.com',
    targetId: 't-2',
    isEnabled: true,
    assetCount: 1,
  },
];

const mockTools = [
  {
    id: 'tool-1',
    name: 'Subdomain scan',
    description: 'Enumerate subdomains',
    categories: [{ name: 'vulnerabilities', targetTypes: [] }],
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'tool-2',
    name: 'Port scan',
    description: 'Scan open ports',
    categories: [{ name: 'vulnerabilities', targetTypes: [] }],
    createdAt: '2026-01-02T00:00:00Z',
  },
];
const installedToolsRef = { current: mockTools };

const mockTemplates = [
  {
    filePath: 'vulnerability_scan_basic.yaml',
    name: 'Vulnerability scan basic',
    jobs: [{ id: 'vuls_scan', run: 'nuclei', needs: [] }],
  },
];

const { createMock, previewMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  previewMock: vi.fn(),
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
  return {
    ...actual,
    useAssetsControllerGetHostAssets: () => ({
      data: { data: mockHosts, total: mockHosts.length, page: 1, limit: 10 },
      isLoading: false,
    }),
    useToolsControllerGetInstalledTools: () => ({
      data: {
        data: installedToolsRef.current,
        total: installedToolsRef.current.length,
      },
      isLoading: false,
    }),
    useProjectsControllerGetWorkflowTemplates: () => ({
      data: mockTemplates,
      isLoading: false,
    }),
    useProjectsControllerPreviewScope: () => ({
      mutate: previewMock,
      data: { total: 12, ruleAssets: 12, perRule: [12] },
      isError: false,
    }),
    useTargetsControllerGetTargetsInWorkspace: () => ({
      data: { data: [{ id: 't-1', value: 'example.com' }] },
      isLoading: false,
    }),
    useProjectsControllerCreate: () => ({
      mutate: createMock,
      isPending: false,
    }),
  };
});

beforeEach(() => {
  installedToolsRef.current = mockTools;
  createMock.mockReset();
  previewMock.mockReset();
  // Resolve the create call with an id so the page navigates to the detail page
  createMock.mockImplementation(
    (
      _vars: unknown,
      opts?: { onSuccess?: (response: { id: string }) => void },
    ) => {
      opts?.onSuccess?.({ id: 'project-1' });
    },
  );
});

describe('CreateProject wizard page', () => {
  it('renders step 1 with name, color and description; Next disabled until name entered', async () => {
    const { user } = renderWithProviders(<CreateProject />, {
      routePath: '/projects/create',
    });

    expect(await screen.findByText(/Info/)).toBeInTheDocument();
    const nameInput = screen.getByLabelText('Name');
    expect(screen.getByLabelText('Select #78716C color')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.type(nameInput, 'My Project');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('guides users to install a tool when none are installed', async () => {
    installedToolsRef.current = [];
    const { user, router } = renderWithProviders(<CreateProject />, {
      routePath: '/projects/create',
    });

    await user.type(await screen.findByLabelText('Name'), 'My Project');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('tab', { name: 'Pick tools' }));

    expect(
      await screen.findByRole('heading', { name: 'No tools installed yet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    const toolsLink = screen.getByRole('link', {
      name: /browse and install tools/i,
    });
    await user.click(toolsLink);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tools');
    });
  });

  it('navigates to /projects when Cancel is clicked', async () => {
    const { user, router } = renderWithProviders(<CreateProject />, {
      routePath: '/projects/create',
    });

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/projects');
    });
  });

  it('walks all steps with a rule, hand-picked hosts, tools and triggers', async () => {
    const { user, router } = renderWithProviders(<CreateProject />, {
      routePath: '/projects/create',
    });

    await user.type(await screen.findByLabelText('Name'), 'My Project');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Scope: a hostname rule, previewed live, plus one host picked by hand.
    await user.click(await screen.findByRole('button', { name: 'Add rule' }));
    await user.type(screen.getByLabelText('Hostname'), '*.example.com');
    expect(await screen.findByText('12')).toBeInTheDocument();
    await waitFor(() =>
      expect(previewMock).toHaveBeenLastCalledWith({
        data: {
          rules: [{ mode: 'include', type: 'hostname', value: '*.example.com' }],
        },
      }),
    );
    await user.click(screen.getByRole('tab', { name: /Pick by hand/ }));
    await user.click(await screen.findByText('https://example.com'));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Pipeline: own tools.
    await user.click(await screen.findByRole('tab', { name: 'Pick tools' }));
    await user.click(
      await screen.findByRole('button', { name: 'Add Subdomain scan to pipeline' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Add to pipeline' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Triggers: schedule, new assets and run now are on by default.
    expect(await screen.findByRole('button', { name: 'Create' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const dto = createMock.mock.calls[0][0].data;
    expect(dto).toMatchObject({
      name: 'My Project',
      hostIds: ['asset-1'],
      scopeRules: [{ mode: 'include', type: 'hostname', value: '*.example.com' }],
      autoAddAssets: true,
      tools: [{ toolId: 'tool-1' }],
      onAssetsAdded: { windowMinutes: 10 },
      runNow: true,
    });
    expect(dto.template).toBeUndefined();
    expect(dto.schedule).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/projects/project-1/overview');
    });
  });

  it('creates from a template without a schedule', async () => {
    const { user } = renderWithProviders(<CreateProject />, {
      routePath: '/projects/create',
    });

    await user.type(await screen.findByLabelText('Name'), 'My Project');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(
      await screen.findByRole('button', { name: /Vulnerability scan basic/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(await screen.findByRole('checkbox', { name: 'On a schedule' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const dto = createMock.mock.calls[0][0].data;
    expect(dto).toMatchObject({ template: 'vulnerability_scan_basic.yaml' });
    expect(dto.tools).toBeUndefined();
    expect(dto.schedule).toBeUndefined();
  });

  it('goes back to the previous step with Back and keeps entered values', async () => {
    const { user } = renderWithProviders(<CreateProject />, {
      routePath: '/projects/create',
    });

    await user.type(await screen.findByLabelText('Name'), 'My Project');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('button', { name: 'Add rule' });

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toHaveValue('My Project');
    });
  });
});
