import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { Projects } from '@/pages/projects/projects';

const { listRef, getAllMock } = vi.hoisted(() => ({
  listRef: { value: { data: [] as unknown[], total: 0 } },
  getAllMock: vi.fn(),
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
    useAssetGroupControllerGetAll: (params: unknown) => {
      getAllMock(params);
      return { data: listRef.value, isLoading: false };
    },
  };
});

const project = (overrides: Record<string, unknown> = {}) => ({
  id: 'project-1',
  name: 'Web Servers',
  hexColor: '#3b82f6',
  totalAssets: 3,
  lastRunAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  getAllMock.mockReset();
  listRef.value = { data: [], total: 0 };
});

describe('Projects list page', () => {
  it('renders each project as a card with its hosts and last run', async () => {
    listRef.value = {
      data: [
        project(),
        project({
          id: 'project-2',
          name: 'APIs',
          totalAssets: 1,
          lastRunAt: '2026-01-02T00:00:00Z',
        }),
      ],
      total: 2,
    };
    renderWithProviders(<Projects />, { routePath: '/projects' });

    expect(
      await screen.findByRole('button', { name: 'Web Servers' }),
    ).toBeInTheDocument();
    expect(screen.getByText('3 hosts')).toBeInTheDocument();
    expect(screen.getByText('Never run')).toBeInTheDocument();
    expect(screen.getByText('1 host')).toBeInTheDocument();
    expect(screen.getByText(/^Last run /)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    // One page of results: no pagination
    expect(screen.queryByText(/^Page \d+ of/)).toBeNull();
  });

  it('opens the project detail when a card is clicked', async () => {
    listRef.value = { data: [project()], total: 1 };
    const { user, router } = renderWithProviders(<Projects />, {
      routePath: '/projects',
    });

    await user.click(await screen.findByRole('button', { name: 'Web Servers' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/projects/project-1');
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

  it('requests the chosen sort order', async () => {
    listRef.value = { data: [project()], total: 1 };
    const { user } = renderWithProviders(<Projects />, {
      routePath: '/projects',
    });

    await user.click(await screen.findByRole('combobox', { name: 'Sort projects' }));
    await user.click(await screen.findByRole('option', { name: 'Name' }));

    await waitFor(() => {
      expect(getAllMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'name', sortOrder: 'ASC', page: 1 }),
      );
    });
  });
});
