import { renderWithProviders, screen } from '@/test/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuthenticationSettings from './authentication-settings';

const mutate = vi.fn();

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useSystemConfigsControllerGetSettings: vi.fn(),
  useSystemConfigsControllerUpdateSettings: () => ({
    mutate,
    isPending: false,
  }),
}));

async function setup(allowSignUp: boolean, mailServerOn = true) {
  const { useSystemConfigsControllerGetSettings } = await import(
    '@/services/apis/gen/queries'
  );
  vi.mocked(useSystemConfigsControllerGetSettings).mockReturnValue({
    data: {
      auth: { allowSignUp },
      mailServer: { enabled: mailServerOn },
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useSystemConfigsControllerGetSettings>);
  return renderWithProviders(<AuthenticationSettings />);
}

describe('AuthenticationSettings', () => {
  beforeEach(() => {
    mutate.mockClear();
  });

  it('shows the saved sign-up setting', async () => {
    await setup(false);

    expect(
      await screen.findByRole('switch', { name: /Allow public sign-up/ }),
    ).not.toBeChecked();
  });

  it('opens sign-up when switched on', async () => {
    const { user } = await setup(false);

    await user.click(
      await screen.findByRole('switch', { name: /Allow public sign-up/ }),
    );

    expect(mutate).toHaveBeenCalledWith(
      { data: { auth: { allowSignUp: true } } },
      expect.anything(),
    );
  });

  it('closes sign-up when switched off', async () => {
    const { user } = await setup(true);

    await user.click(
      await screen.findByRole('switch', { name: /Allow public sign-up/ }),
    );

    expect(mutate).toHaveBeenCalledWith(
      { data: { auth: { allowSignUp: false } } },
      expect.anything(),
    );
  });

  it('points to the mail server while it is off', async () => {
    await setup(true, false);

    expect(
      await screen.findByRole('link', { name: 'mail server' }),
    ).toHaveAttribute('href', '/admin/mail-server');
  });

  it('says nothing about the mail server once it is on', async () => {
    await setup(true, true);

    await screen.findByRole('switch', { name: /Allow public sign-up/ });
    expect(
      screen.queryByRole('link', { name: 'mail server' }),
    ).not.toBeInTheDocument();
  });
});
