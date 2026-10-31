import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignUp from './signup';

const { signUpEmail, toastSuccess } = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/utils/authClient', () => ({
  authClient: { signUp: { email: signUpEmail } },
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: vi.fn() },
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useRootControllerGetMetadata: vi.fn(),
}));

async function setup(
  metadata: { data?: { allowSignUp: boolean }; isError?: boolean } = {
    data: { allowSignUp: true },
  },
  url = '/signup',
) {
  const { useRootControllerGetMetadata } = await import(
    '@/services/apis/gen/queries'
  );
  vi.mocked(useRootControllerGetMetadata).mockReturnValue({
    data: metadata.data && { name: 'OASM', isInit: true, ...metadata.data },
    isError: metadata.isError ?? false,
  } as unknown as ReturnType<typeof useRootControllerGetMetadata>);
  return renderWithProviders(<SignUp />, { initialEntries: [url] });
}

async function fillAndSubmit(
  user: Awaited<ReturnType<typeof setup>>['user'],
  confirmPassword = 'Password123!',
) {
  await user.type(await screen.findByLabelText('Name'), 'Ada');
  await user.type(screen.getByLabelText('Email'), 'ada@example.com');
  await user.type(screen.getByLabelText('Password'), 'Password123!');
  await user.type(screen.getByLabelText('Confirm password'), confirmPassword);
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('SignUp', () => {
  beforeEach(() => {
    signUpEmail.mockReset();
    toastSuccess.mockReset();
  });

  describe('while sign-up is open', () => {
    it('links back to sign in', async () => {
      await setup();

      expect(
        await screen.findByRole('link', { name: 'Sign in' }),
      ).toHaveAttribute('href', '/login');
    });

    it('creates the account, then sends them to sign in', async () => {
      signUpEmail.mockResolvedValue({ data: { token: null }, error: null });
      const { user, router } = await setup();

      await fillAndSubmit(user);

      expect(signUpEmail).toHaveBeenCalledWith({
        name: 'Ada',
        email: 'ada@example.com',
        password: 'Password123!',
        // The verification link lands on sign-in
        callbackURL: `${window.location.origin}/login?verified=1`,
      });
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/login');
      });
      expect(toastSuccess).toHaveBeenCalledWith('Account created', {
        description: expect.stringMatching(/confirm your email/),
      });
    });

    it('keeps the redirect target on the way to sign in', async () => {
      signUpEmail.mockResolvedValue({ data: { token: null }, error: null });
      const { user, router } = await setup(undefined, '/signup?redirect=%2Finvite%2Fabc');

      await fillAndSubmit(user);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/login');
      });
      expect(router.state.location.search).toMatchObject({
        redirect: '/invite/abc',
      });
      // ...and through the verification link
      expect(signUpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: `${window.location.origin}/login?verified=1&redirect=%2Finvite%2Fabc`,
        }),
      );
    });

    it('does not submit when the passwords differ', async () => {
      const { user } = await setup();

      await fillAndSubmit(user, 'Different1!');

      expect(
        await screen.findByText('Passwords do not match.'),
      ).toBeInTheDocument();
      expect(signUpEmail).not.toHaveBeenCalled();
    });
  });

  it('says sign-up is turned off instead of showing the form', async () => {
    await setup({ data: { allowSignUp: false } });

    expect(
      await screen.findByRole('heading', { name: 'Sign-up is turned off' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Contact your administrator/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to sign in' }),
    ).toHaveAttribute('href', '/login');
  });

  it('shows neither form nor notice until metadata arrives', async () => {
    await setup({ data: undefined });

    expect(await screen.findByLabelText('Loading')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('says the server is unreachable when metadata fails to load', async () => {
    await setup({ data: undefined, isError: true });

    expect(
      await screen.findByRole('heading', { name: 'Sign-up is unavailable' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });
});
