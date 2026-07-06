import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import Login from '@/pages/login/login';

const { mockSignInEmail } = vi.hoisted(() => ({
  mockSignInEmail: vi.fn(),
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
      error: { message: 'Invalid email or password' },
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

    resolveSignIn({});

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /sign in/i })
      ).not.toBeDisabled();
    });
  });
});
