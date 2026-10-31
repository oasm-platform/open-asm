import type { AdminUserDto } from '@/services/apis/gen/queries';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserEdit } from './user-edit';

const { unbanUser } = vi.hoisted(() => ({ unbanUser: vi.fn() }));

vi.mock('@/utils/authClient', () => ({
  authClient: { admin: { unbanUser } },
  useSession: () => ({ data: { user: { id: 'admin-1' } } }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useSystemConfigsControllerGetSettings: vi.fn(),
}));

async function withMailServer(enabled: boolean) {
  const { useSystemConfigsControllerGetSettings } = await import(
    '@/services/apis/gen/queries'
  );
  vi.mocked(useSystemConfigsControllerGetSettings).mockReturnValue({
    data: { mailServer: { enabled } },
  } as unknown as ReturnType<typeof useSystemConfigsControllerGetSettings>);
}

const user = (overrides: Partial<AdminUserDto> = {}): AdminUserDto =>
  ({
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: false,
    role: 'user',
    banned: false,
    banReason: null,
    banExpires: null,
    pendingApproval: false,
    createdAt: '2026-10-30T00:00:00Z',
    updatedAt: '2026-10-30T00:00:00Z',
    lastActiveAt: null,
    ...overrides,
  }) as AdminUserDto;

describe('UserEdit', () => {
  beforeEach(async () => {
    unbanUser.mockReset();
    await withMailServer(false);
  });

  it('offers approval instead of unban for a sign-up waiting for approval', async () => {
    renderWithProviders(
      <UserEdit
        user={user({
          banned: true,
          banReason: 'Pending approval',
          pendingApproval: true,
        })}
      />,
    );

    expect(
      await screen.findByText('Waiting for approval'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: /Unban user/ }),
    ).not.toBeInTheDocument();
  });

  it('approves by unbanning the account', async () => {
    unbanUser.mockResolvedValue({ error: null });
    const { user: actor } = renderWithProviders(
      <UserEdit
        user={user({
          banned: true,
          banReason: 'Pending approval',
          pendingApproval: true,
        })}
      />,
    );

    await actor.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(unbanUser).toHaveBeenCalledWith({ userId: 'user-1' });
    });
  });

  it('waits for the email to be confirmed while the mail server is on', async () => {
    await withMailServer(true);
    renderWithProviders(
      <UserEdit
        user={user({
          banned: true,
          banReason: 'Pending approval',
          pendingApproval: true,
          emailVerified: false,
        })}
      />,
    );

    expect(
      await screen.findByRole('button', { name: 'Approve' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/haven't confirmed their email yet/),
    ).toBeInTheDocument();
  });

  it('approves a confirmed email while the mail server is on', async () => {
    await withMailServer(true);
    renderWithProviders(
      <UserEdit
        user={user({
          banned: true,
          banReason: 'Pending approval',
          pendingApproval: true,
          emailVerified: true,
        })}
      />,
    );

    expect(
      await screen.findByRole('button', { name: 'Approve' }),
    ).toBeEnabled();
  });

  it('keeps the ban controls for an active account', async () => {
    renderWithProviders(<UserEdit user={user()} />);

    expect(
      await screen.findByRole('button', { name: /Ban user/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Waiting for approval')).not.toBeInTheDocument();
  });
});
