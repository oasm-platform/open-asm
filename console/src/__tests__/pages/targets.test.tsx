import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/node';
import Targets from '@/pages/targets/targets';

const mockWorkspaces = [{ id: 'ws-1', name: 'Test Workspace' }];

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceSelector: () => ({
    workspaces: mockWorkspaces,
    selectedWorkspace: 'ws-1',
    isLoading: false,
  }),
  useWorkspaceState: () => ({
    state: { selectedWorkspaceId: 'ws-1' },
  }),
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

describe('Targets Page', () => {
  it('renders targets table with data', async () => {
    renderWithProviders(<Targets />, {
      routePath: '/_authed/targets/',
      initialEntries: ['/_authed/targets/'],
    });

    await waitFor(() => {
      expect(screen.getByText('example.com')).toBeInTheDocument();
      expect(screen.getByText('192.168.1.1')).toBeInTheDocument();
    });

    expect(screen.getByText('Target')).toBeInTheDocument();
    expect(screen.getByText('Surface')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Open vulnerabilities' })).toBeInTheDocument();
    // Type is a badge column; Source is an icon next to the target, not a column
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Domain')).toBeInTheDocument();
    expect(screen.queryByText('Source')).not.toBeInTheDocument();
  });

  it('shows empty state when no targets', async () => {
    server.use(
      http.get('/api/targets', () => {
        return HttpResponse.json({
          data: [],
          total: 0,
          page: 1,
          totalPages: 0,
        });
      }),
    );

    renderWithProviders(<Targets />, {
      routePath: '/_authed/targets/',
      initialEntries: ['/_authed/targets/'],
    });

    await waitFor(() => {
      expect(screen.getByText('No data')).toBeInTheDocument();
    });
  });

  it('handles search/filter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Targets />, {
      routePath: '/_authed/targets/',
      initialEntries: ['/_authed/targets/'],
    });

    await waitFor(() => {
      expect(screen.getByText('example.com')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search');
    await user.type(searchInput, 'example');

    await waitFor(() => {
      expect(searchInput).toHaveValue('example');
    });
  });

  it('shows the workspace summary above the list', async () => {
    renderWithProviders(<Targets />, {
      routePath: '/_authed/targets/',
      initialEntries: ['/_authed/targets/'],
    });

    const critical = await screen.findByRole('button', { name: /With critical/ });
    expect(critical).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Targets/ })).toHaveAttribute('aria-pressed', 'true');
    // Open vulnerabilities are counted on the Vulnerabilities page, not here.
    expect(screen.queryByText('Open vulns')).not.toBeInTheDocument();
  });
});
