import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import MembersSettings from '@/pages/settings/components/members-settings';

const { mockGroups, mockInvitations } = vi.hoisted(() => ({
  mockGroups: vi.fn(),
  mockInvitations: vi.fn(),
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

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'ws-1' } }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/services/apis/gen/queries')
  >();
  const emptyQuery = () => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  return {
    ...actual,
    useWorkspacesControllerGetWorkspaceMembers: () => ({
      ...emptyQuery(),
      data: [],
    }),
    useWorkspacesControllerGetPermissionGroups: () => ({
      ...emptyQuery(),
      data: mockGroups(),
    }),
    useWorkspacesControllerListInvitations: () => ({
      ...emptyQuery(),
      data: mockInvitations(),
    }),
    useWorkspacesControllerRemoveMember: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useWorkspacesControllerCancelInvitation: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useWorkspacesControllerCreateInvitations: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useWorkspacesControllerDeletePermissionGroup: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useWorkspacesControllerUpdateMemberPermissions: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
  };
});

beforeEach(() => {
  mockGroups.mockReturnValue([]);
  mockInvitations.mockReturnValue([]);
});

describe('MembersSettings invite dialog', () => {
  it('renders the search input, Invite member and Create group buttons with equal heights', async () => {
    const { user } = renderWithProviders(<MembersSettings />, {
      routePath: '/settings/members',
      initialEntries: ['/settings/members?tab=permissions'],
    });

    const createGroupButton = await screen.findByRole('button', {
      name: 'Create group',
    });
    expect(createGroupButton.className).toMatch(/(^|s)h-9(s|$)/);

    // Switch to the members tab to check the search input + invite button.
    await user.click(screen.getByRole('tab', { name: 'Members' }));
    const searchInput = await screen.findByPlaceholderText('Search members...');
    const inviteButton = screen.getByRole('button', { name: 'Invite member' });

    expect(searchInput.className).toMatch(/(^|s)h-9(s|$)/);
    expect(inviteButton.className).toMatch(/(^|s)h-9(s|$)/);
  });

  it('filters invitations by email in the Invitations tab', async () => {
    mockInvitations.mockReturnValue([
      {
        id: 'i-1',
        email: 'alice@example.com',
        status: 'pending',
        expiresAt: '2026-01-01T00:00:00Z',
        permissionIds: [],
      },
      {
        id: 'i-2',
        email: 'bob@example.com',
        status: 'pending',
        expiresAt: '2026-01-02T00:00:00Z',
        permissionIds: [],
      },
    ]);

    const { user } = renderWithProviders(<MembersSettings />, {
      routePath: '/settings/members',
    });

    await user.click(await screen.findByRole('tab', { name: 'Invitations' }));
    const input = await screen.findByPlaceholderText('Search invitations...');
    await user.type(input, 'alice');

    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.queryByText('bob@example.com')).not.toBeInTheDocument();
  });

  it('filters permission groups by name in the Permissions tab', async () => {
    mockGroups.mockReturnValue([
      {
        id: 'g-1',
        name: 'Viewers',
        permissions: ['target.read'],
        isSystem: false,
      },
      {
        id: 'g-2',
        name: 'Editors',
        permissions: ['target.write'],
        isSystem: false,
      },
    ]);

    const { user } = renderWithProviders(<MembersSettings />, {
      routePath: '/settings/members',
      initialEntries: ['/settings/members?tab=permissions'],
    });

    const input = await screen.findByPlaceholderText(
      'Search permission groups...',
    );
    await user.type(input, 'edit');

    expect(screen.getByText('Editors')).toBeInTheDocument();
    expect(screen.queryByText('Viewers')).not.toBeInTheDocument();
  });

  it('shows a link to the Permissions tab when no permission groups exist', async () => {
    const { user } = renderWithProviders(<MembersSettings />, {
      routePath: '/settings/members',
    });

    await user.click(await screen.findByRole('button', { name: 'Invite member' }));

    expect(
      await screen.findByRole('button', {
        name: 'Create one in the Permissions tab.',
      }),
    ).toBeInTheDocument();
  });

  it('shows the link when only the system Admin group exists (no invitable groups)', async () => {
    mockGroups.mockReturnValue([
      {
        id: 'sys-1',
        name: 'Admin',
        permissions: ['*'],
        isSystem: true,
      },
    ]);

    const { user } = renderWithProviders(<MembersSettings />, {
      routePath: '/settings/members',
    });

    await user.click(await screen.findByRole('button', { name: 'Invite member' }));

    expect(
      await screen.findByRole('button', {
        name: 'Create one in the Permissions tab.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /Admin/ }),
    ).not.toBeInTheDocument();
  });

  it('clicking the link navigates to the permissions tab and closes the dialog', async () => {
    const { user, router } = renderWithProviders(<MembersSettings />, {
      routePath: '/settings/members',
    });

    await user.click(await screen.findByRole('button', { name: 'Invite member' }));
    await user.click(
      await screen.findByRole('button', {
        name: 'Create one in the Permissions tab.',
      }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/settings/members');
      expect(router.state.location.search.tab).toBe('permissions');
    });
    // Dialog closed: Permissions tab content is visible, invite dialog is not.
    expect(await screen.findByRole('button', { name: 'Create group' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send invitations' }),
    ).not.toBeInTheDocument();
  });

  it('lists permission groups as checkboxes when groups exist (no link)', async () => {
    mockGroups.mockReturnValue([
      {
        id: 'g-1',
        name: 'Viewers',
        permissions: ['target.read'],
        isSystem: false,
      },
    ]);

    const { user } = renderWithProviders(<MembersSettings />, {
      routePath: '/settings/members',
    });

    await user.click(await screen.findByRole('button', { name: 'Invite member' }));

    expect(
      await screen.findByRole('checkbox', { name: /Viewers/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('target.read')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Create one in the Permissions tab.',
      }),
    ).not.toBeInTheDocument();
  });
});
