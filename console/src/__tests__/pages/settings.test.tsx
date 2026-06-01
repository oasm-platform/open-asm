import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import Settings from '@/pages/settings/settings';
import { useParams } from 'react-router-dom';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: vi.fn(() => ({ tab: 'general' })),
  };
});

vi.mock('@/utils/authClient', () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: 'user-1', role: 'admin' } },
  })),
}));

vi.mock('@/pages/settings/components/workspace-settings', () => ({
  default: () => <div data-testid="workspace-settings">WorkspaceSettings</div>,
}));

vi.mock('@/pages/settings/components/api-keys-settings', () => ({
  default: () => <div data-testid="api-keys-settings">ApiKeysSettings</div>,
}));

vi.mock('@/pages/settings/components/preferences', () => ({
  default: () => <div data-testid="preferences">Preferences</div>,
}));

vi.mock('@/pages/settings/components/security-settings', () => ({
  default: () => <div data-testid="security-settings">SecuritySettings</div>,
}));

vi.mock('@/pages/settings/components/brand-name-and-logo', () => ({
  default: () => <div data-testid="brand-settings">BrandNameAndLogoSettings</div>,
}));

vi.mock('@/pages/settings/components/get-about-project', () => ({
  default: () => <div data-testid="about-settings">GetAboutProject</div>,
}));

describe('Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders settings page', async () => {
    renderWithProviders(<Settings />, {
      initialEntries: ['/settings/general'],
    });

    await waitFor(() => {
      expect(screen.getByText('Workspace settings')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-settings')).toBeInTheDocument();
    });
  });

  it('switches between tabs', async () => {
    vi.mocked(useParams).mockReturnValue({ tab: 'apikeys' });

    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('API Keys')).toBeInTheDocument();
      expect(screen.getByTestId('api-keys-settings')).toBeInTheDocument();
    });
  });

  it('shows preferences tab content', async () => {
    vi.mocked(useParams).mockReturnValue({ tab: 'preferences' });

    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument();
      expect(screen.getByTestId('preferences')).toBeInTheDocument();
    });
  });

  it('filters tabs based on user role', async () => {
    vi.mocked(useParams).mockReturnValue({ tab: 'general' });
    const { useSession } = await import('@/utils/authClient');
    vi.mocked(useSession).mockReturnValue({
      data: { user: { id: 'user-1', role: 'user' } },
    } as ReturnType<typeof useSession>);

    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Workspace settings')).toBeInTheDocument();
    });
  });
});
