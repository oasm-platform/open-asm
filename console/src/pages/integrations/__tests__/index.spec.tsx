import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetIntegrationDto } from '@/services/apis/gen/queries';
import Integrations from '../index';

const searchState = vi.hoisted(() => ({
  current: { tab: 'connected' } as Record<string, string>,
}));
const navigateMock = vi.hoisted(() => vi.fn());

const queryState = vi.hoisted(() => ({
  connected: { data: [] as GetIntegrationDto[], total: 0 },
  schemas: { schema: { oneOf: [] as Record<string, unknown>[] } },
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useSearch: () => searchState.current,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/apis/gen/queries')>();
  return {
    ...actual,
    useIntegrationsControllerGetManyIntegrations: () => ({
      data: queryState.connected,
      isPending: false,
    }),
    useIntegrationsControllerGetSchemas: () => ({
      data: queryState.schemas,
      isPending: false,
    }),
    useIntegrationsControllerDeleteIntegration: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useIntegrationsControllerSyncIntegration: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useIntegrationsControllerTestIntegration: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useIntegrationsControllerUpdateIntegration: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useWorkspacesControllerGetCurrentPermission: () => ({
      data: { currentPermission: ['*'] },
      isLoading: false,
    }),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Stub tab-content and connect-sheet: not under test here.
vi.mock('../components/apps-tab-content', () => ({
  AppsTabContent: () => null,
}));
vi.mock('../components/connect-integration-sheet', () => ({
  ConnectIntegrationSheet: () => null,
}));
vi.mock('../components/connected-tab-content', () => ({
  ConnectedTabContent: ({
    connectedIntegrations,
    onCardClick,
  }: {
    connectedIntegrations: GetIntegrationDto[];
    onCardClick: (integration: GetIntegrationDto) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        const first = connectedIntegrations[0];
        if (first) onCardClick(first);
      }}
    >
      open-detail
    </button>
  ),
}));

// The detail sheet is reduced to a probe of the integration prop it receives,
// so this spec tests index.tsx's prop derivation, not the sheet internals.
vi.mock('../components/integration-detail-sheet', () => ({
  IntegrationDetailSheet: ({
    integration,
  }: {
    integration: GetIntegrationDto;
  }) => (
    <div data-testid="detail-sheet">
      lastRunAt: {integration.lastRunAt ?? 'null'}
    </div>
  ),
}));

const cloudSchema = {
  $id: 'cloudflare',
  title: 'Cloudflare',
  properties: {
    app_type: { const: 'cloudflare', title: 'App type' },
    category: { const: 'CLOUD_PROVIDER', title: 'Category' },
  },
  required: ['app_type', 'category'],
  isAvailable: true,
};

const integrationT1: GetIntegrationDto = {
  id: 'int-1',
  name: 'Cloudflare',
  description: '',
  appType: 'cloudflare',
  category: 'CLOUD_PROVIDER',
  config: {},
  workspaceId: 'ws-1',
  createdById: 'u-1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  syncSchedule: 'disabled',
  lastRunAt: '2026-08-09T10:00:00.000Z',
};

const integrationT2: GetIntegrationDto = {
  ...integrationT1,
  lastRunAt: '2026-08-10T10:00:00.000Z',
};

function renderIndex(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return {
    ...render(ui, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    }),
    queryClient,
  };
}

describe('Integrations index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryState.connected = { data: [], total: 0 };
    queryState.schemas = { schema: { oneOf: [cloudSchema] } };
    searchState.current = { tab: 'connected' };
  });

  it('re-derives the detail sheet integration after the list refetches (U1)', async () => {
    queryState.connected = { data: [integrationT1], total: 1 };
    const { rerender } = renderIndex(<Integrations />);

    // Open the detail sheet from a connected card (snapshot at T1).
    fireEvent.click(await screen.findByRole('button', { name: 'open-detail' }));
    await waitFor(() => {
      expect(screen.getByTestId('detail-sheet')).toHaveTextContent(
        '2026-08-09T10:00:00.000Z',
      );
    });

    // The list query refetches after a sync: the sheet must follow to T2.
    queryState.connected = { data: [integrationT2], total: 1 };
    rerender(<Integrations />);

    await waitFor(() => {
      expect(screen.getByTestId('detail-sheet')).toHaveTextContent(
        '2026-08-10T10:00:00.000Z',
      );
    });
    expect(screen.getByTestId('detail-sheet')).not.toHaveTextContent(
      '2026-08-09T10:00:00.000Z',
    );
  });
});
