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

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

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
    useAssetGroupControllerCreate: () => ({
      mutate: createMock,
      isPending: false,
    }),
  };
});

beforeEach(() => {
  installedToolsRef.current = mockTools;
  createMock.mockReset();
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
  it('renders step 1 with name input and color palette; Next disabled until name entered', async () => {
    const { user } = renderWithProviders(<CreateProject />, {
      routePath: '/projects/create',
    });

    // Step indicator + form fields
    expect(await screen.findByText(/Info/)).toBeInTheDocument();
    const nameInput = screen.getByLabelText('Name');
    expect(nameInput).toBeInTheDocument();
    expect(screen.getByLabelText('Select #78716C color')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.type(nameInput, 'My Project');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('guides users to install and select a tool when none are installed', async () => {
    installedToolsRef.current = [];
    const { user, router } = renderWithProviders(<CreateProject />, {
      routePath: '/projects/create',
    });

    await user.type(await screen.findByLabelText('Name'), 'My Project');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      await screen.findByRole('heading', { name: 'No tools installed yet' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Install a compatible scanner and choose its configuration before adding it to this project.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Return here and add the tool to the project pipeline.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    const toolsLink = screen.getByRole('link', {
      name: /browse and install tools/i,
    });
    expect(toolsLink).toHaveAttribute('href', '/tools');

    await user.click(toolsLink);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tools');
    });
  });

  it('navigates to /projects when Cancel is clicked', async () => {
    const { user, router } = renderWithProviders(<CreateProject />, {
      routePath: '/projects/create',
    });

    await user.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/projects');
    });
  });

  it('walks all steps, selects hosts and tools, and saves a merged DTO', async () => {
    const { user, router } = renderWithProviders(<CreateProject />, {
      routePath: '/projects/create',
    });

    // Step 1 -> 2
    await user.type(await screen.findByLabelText('Name'), 'My Project');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2: hosts table with row selection
    await user.click(await screen.findByText('https://example.com'));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 3: pipeline builder (logo grid) — open a tool and add it
    expect(await screen.findByText('Port scan')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Add Subdomain scan to pipeline' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Add to pipeline' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 4: schedule builder; Next becomes Save
    expect(await screen.findByRole('button', { name: 'Save' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const dto = createMock.mock.calls[0][0].data;
    expect(dto).toMatchObject({
      name: 'My Project',
      hostIds: ['asset-1'],
      tools: [{ toolId: 'tool-1' }],
    });
    expect(dto.schedule).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/projects/project-1');
    });
  });

  it('goes back to the previous step with Back and keeps entered values', async () => {
    const { user } = renderWithProviders(<CreateProject />, {
      routePath: '/projects/create',
    });

    await user.type(await screen.findByLabelText('Name'), 'My Project');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('https://example.com');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toHaveValue('My Project');
    });
  });
});
