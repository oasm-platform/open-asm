import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { server } from '@/test/mocks/node';
import { getRootControllerGetMetadataQueryKey } from '@/services/apis/gen/queries';
import { QueryClient } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import Login from '@/pages/login/login';

const {
  mockSignInEmail,
  mockSendVerificationEmail,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockSignInEmail: vi.fn(),
  mockSendVerificationEmail: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

vi.mock('@/utils/authClient', () => ({
  authClient: {
    signIn: {
      email: mockSignInEmail,
    },
    sendVerificationEmail: mockSendVerificationEmail,
  },
}));

vi.mock('@/routes/login', () => ({
  Route: {
    useSearch: () => ({ redirect: undefined }),
  },
}));

vi.mock('@/components/common/layout/auth-layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-layout">{children}</div>,
}));

describe('Login Page', () => {
  beforeEach(() => {
    mockSignInEmail.mockReset();
    mockSendVerificationEmail.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
    mockSignInEmail.mockResolvedValue({});
  });

  it('renders login form with email and password fields', async () => {
    renderWithProviders(<Login />, {
      routePath: '/login',
      initialEntries: ['/login'],
    });

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in/i })
    ).toBeInTheDocument();
  });

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />, {
      routePath: '/login',
      initialEntries: ['/login'],
    });

    await screen.findByLabelText(/email/i);
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'validpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    });
  });

  it('shows validation error for short password', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />, {
      routePath: '/login',
      initialEntries: ['/login'],
    });

    await screen.findByLabelText(/email/i);
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Password must be at least 8 characters')
      ).toBeInTheDocument();
    });
  });

  it('shows error message on invalid credentials', async () => {
    mockSignInEmail.mockResolvedValue({
      error: { status: 401, message: 'Invalid email or password' },
    });

    const user = userEvent.setup();
    renderWithProviders(<Login />, {
      routePath: '/login',
      initialEntries: ['/login'],
    });

    await screen.findByLabelText(/email/i);
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Invalid email or password')
      ).toBeInTheDocument();
    });
  });

  it('shows a toast instead of a field error on server errors', async () => {
    mockSignInEmail.mockResolvedValue({
      error: { status: 502, message: 'Bad Gateway' },
    });

    const user = userEvent.setup();
    renderWithProviders(<Login />, {
      routePath: '/login',
      initialEntries: ['/login'],
    });

    await screen.findByLabelText(/email/i);
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'validpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Bad Gateway', {
        richColors: true,
      });
    });
    expect(screen.queryByText('Bad Gateway')).not.toBeInTheDocument();
  });

  it('shows a toast when the server is unreachable', async () => {
    mockSignInEmail.mockRejectedValue(new TypeError('Failed to fetch'));

    const user = userEvent.setup();
    renderWithProviders(<Login />, {
      routePath: '/login',
      initialEntries: ['/login'],
    });

    await screen.findByLabelText(/email/i);
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'validpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });
    expect(
      screen.getByRole('button', { name: /sign in/i })
    ).not.toBeDisabled();
  });

  it('disables submit button while loading', async () => {
    let resolveSignIn!: (value: unknown) => void;
    mockSignInEmail.mockImplementation(
      () => new Promise((resolve) => (resolveSignIn = resolve))
    );

    const user = userEvent.setup();
    renderWithProviders(<Login />, {
      routePath: '/login',
      initialEntries: ['/login'],
    });

    await screen.findByLabelText(/email/i);
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'validpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    });

    resolveSignIn({ error: { status: 401, message: 'Invalid email or password' } });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /sign in/i })
      ).not.toBeDisabled();
    });
  });

  it('keeps submit button disabled after successful sign-in until redirect', async () => {
    mockSignInEmail.mockResolvedValue({ data: {} });

    const user = userEvent.setup();
    renderWithProviders(<Login />, {
      routePath: '/login',
      initialEntries: ['/login'],
    });

    await screen.findByLabelText(/email/i);
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'validpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSignInEmail).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
  });

  it('links to sign up while an admin allows it', async () => {
    server.use(
      http.get('/api/metadata', () =>
        HttpResponse.json({ name: 'OpenASM Test', allowSignUp: true }),
      ),
    );
    renderWithProviders(<Login />, {
      routePath: '/login',
      initialEntries: ['/login'],
    });

    expect(
      await screen.findByRole('link', { name: /sign up/i }),
    ).toHaveAttribute('href', '/signup');
  });

  it('hides the sign-up link while sign-up is closed', async () => {
    server.use(
      http.get('/api/metadata', () =>
        HttpResponse.json({ name: 'OpenASM Test', allowSignUp: false }),
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderWithProviders(<Login />, {
      routePath: '/login',
      initialEntries: ['/login'],
      queryClient,
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData(getRootControllerGetMetadataQueryKey()),
      ).toBeDefined();
    });
    expect(
      screen.queryByRole('link', { name: /sign up/i }),
    ).not.toBeInTheDocument();
  });

  describe('email verification', () => {
    it('confirms the email after the verification link', async () => {
      renderWithProviders(<Login />, {
        routePath: '/login',
        initialEntries: ['/login?verified=1'],
      });

      expect(await screen.findByText('Email confirmed')).toBeInTheDocument();
    });

    it('says when the verification link did not work', async () => {
      renderWithProviders(<Login />, {
        routePath: '/login',
        initialEntries: ['/login?verified=1&error=TOKEN_EXPIRED'],
      });

      expect(
        await screen.findByText(/verification link didn't work/),
      ).toBeInTheDocument();
      expect(screen.queryByText('Email confirmed')).not.toBeInTheDocument();
    });

    it('offers to send the link again to an unconfirmed account', async () => {
      mockSignInEmail.mockResolvedValue({
        error: {
          status: 403,
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Verify your email address first.',
        },
      });
      mockSendVerificationEmail.mockResolvedValue({ data: {}, error: null });
      const user = userEvent.setup();
      renderWithProviders(<Login />, {
        routePath: '/login',
        initialEntries: ['/login'],
      });

      await user.type(await screen.findByLabelText(/email/i), 'ada@example.com');
      await user.type(screen.getByLabelText(/password/i), 'Password123!');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      await user.click(
        await screen.findByRole('button', {
          name: /send the verification email again/i,
        }),
      );

      expect(mockSendVerificationEmail).toHaveBeenCalledWith({
        email: 'ada@example.com',
        callbackURL: `${window.location.origin}/login?verified=1`,
      });
      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith(
          'Verification email sent',
          expect.anything(),
        );
      });
    });

    it('does not offer the resend for a wrong password', async () => {
      mockSignInEmail.mockResolvedValue({
        error: { status: 401, message: 'Invalid email or password' },
      });
      const user = userEvent.setup();
      renderWithProviders(<Login />, {
        routePath: '/login',
        initialEntries: ['/login'],
      });

      await user.type(await screen.findByLabelText(/email/i), 'ada@example.com');
      await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(
        await screen.findByText('Invalid email or password'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /send the verification email again/i }),
      ).not.toBeInTheDocument();
    });
  });
});
