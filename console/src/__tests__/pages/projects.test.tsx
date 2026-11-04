import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { Projects } from '@/pages/projects/projects';

const { listRef, getManyMock } = vi.hoisted(() => ({
  listRef: { value: { data: [] as unknown[], total: 0 } },
  getManyMock: vi.fn(),
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
    useProjectsControllerGetMany: (params: unknown) => {
      getManyMock(params);
      return { data: listRef.value, isLoading: false };
    },
  };
});

const project = (overrides: Record<string, unknown> = {}) => ({
  id: 'project-1',
  name: 'Web Servers',
  hexColor: '#3b82f6',
  description: null,
  archivedAt: null,
  totalAssets: 3,
  workflowCount: 1,
  lastRunAt: null,
  openVulnerabilities: { critical: 2, high: 0, medium: 1, low: 0, info: 0 },
  newVulnerabilities: 0,
  triggers: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  getManyMock.mockReset();
  listRef.value = { data: [], total: 0 };
});

describe('Projects list page', () => {
  it('renders each project as a card with counts, runs and how it runs', async () => {
    listRef.value = {
      data: [
        project(),
        project({
          id: 'project-2',
          name: 'APIs',
          totalAssets: 1,
          lastRunAt: '2026-01-02T00:00:00Z',
          newVulnerabilities: 4,
          triggers: [
            {
              id: 't-1',
              projectWorkflowId: 'b-1',
              type: 'assets_added',
              cron: null,
              enabled: true,
            },
          ],
        }),
      ],
      total: 2,
    };
    renderWithProviders(<Projects />, { routePath: '/projects' });

    expect(
      await screen.findByRole('button', { name: 'Web Servers' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
    expect(screen.getByText('Manual only')).toBeInTheDocument();
    expect(screen.getByText('+4 new')).toBeInTheDocument();
    expect(screen.getByText('Assets added')).toBeInTheDocument();
    expect(
      screen.getAllByRole('img', { name: /2 critical, 0 high, 1 medium/ }),
    ).toHaveLength(2);
    // One page of results: no pagination
    expect(screen.queryByText(/^Page \d+ of/)).toBeNull();
  });

  it('marks archived projects', async () => {
    listRef.value = {
      data: [project({ archivedAt: '2026-01-05T00:00:00Z' })],
      total: 1,
    };
    renderWithProviders(<Projects />, { routePath: '/projects' });

    expect(await screen.findByText('Archived')).toBeInTheDocument();
    expect(screen.getByText('Triggers off')).toBeInTheDocument();
  });

  it('opens the project overview when a card is clicked', async () => {
    listRef.value = { data: [project()], total: 1 };
    const { user, router } = renderWithProviders(<Projects />, {
      routePath: '/projects',
    });

    await user.click(await screen.findByRole('button', { name: 'Web Servers' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/projects/project-1/overview');
    });
  });

  it('shows the empty state when there are no projects', async () => {
    renderWithProviders(<Projects />, { routePath: '/projects' });

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
  });

  it('paginates when the results span several pages', async () => {
    listRef.value = { data: [project()], total: 30 };
    renderWithProviders(<Projects />, { routePath: '/projects' });

    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('sorts by risk and lists active projects by default', async () => {
    renderWithProviders(<Projects />, { routePath: '/projects' });

    await waitFor(() => {
      expect(getManyMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'risk', sortOrder: 'DESC', status: 'active' }),
      );
    });
  });

  it('requests the chosen sort order and status', async () => {
    listRef.value = { data: [project()], total: 1 };
    const { user } = renderWithProviders(<Projects />, {
      routePath: '/projects',
    });

    await user.click(await screen.findByRole('combobox', { name: 'Sort projects' }));
    await user.click(await screen.findByRole('option', { name: 'Name' }));
    await user.click(screen.getByRole('combobox', { name: 'Project status' }));
    await user.click(await screen.findByRole('option', { name: 'Archived' }));

    await waitFor(() => {
      expect(getManyMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sortBy: 'name',
          sortOrder: 'ASC',
          status: 'archived',
          page: 1,
        }),
      );
    });
  });
});
