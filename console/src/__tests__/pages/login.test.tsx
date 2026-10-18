import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import Login from '@/pages/login/login';

const { mockSignInEmail, mockToastError } = vi.hoisted(() => ({
  mockSignInEmail: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: mockToastError },
}));

vi.mock('@/utils/authClient', () => ({
  authClient: {
    signIn: {
      email: mockSignInEmail,
    },
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
    mockToastError.mockReset();
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
});
