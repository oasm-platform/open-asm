import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { formatCronLabel, getLocalTimezone } from '@/lib/cron-schedule';
import { renderWithProviders } from '@/test/utils';
import type { GetIntegrationDto } from '@/services/apis/gen/queries';
import { IntegrationDetailSheet } from '../components/integration-detail-sheet';

const mocks = vi.hoisted(() => ({
  syncMutate: vi.fn(),
  syncOnSuccess: undefined as undefined | ((data: unknown) => void),
  testMutate: vi.fn(),
  updateMutate: vi.fn(),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/apis/gen/queries')>();
  return {
    ...actual,
    useIntegrationsControllerTestIntegration: () => ({
      mutate: mocks.testMutate,
      isPending: false,
    }),
    useIntegrationsControllerUpdateIntegration: () => ({
      mutate: mocks.updateMutate,
      isPending: false,
    }),
    useIntegrationsControllerSyncIntegration: (opts?: {
      mutation?: { onSuccess?: (data: unknown) => void };
    }) => {
      mocks.syncOnSuccess = opts?.mutation?.onSuccess;
      return { mutate: mocks.syncMutate, isPending: false };
    },
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const cloudSchema = {
  $id: 'cloudflare',
  title: 'Cloudflare',
  description: 'Sync DNS records and assets',
  properties: {
    app_type: { const: 'cloudflare', title: 'App type' },
    category: { const: 'CLOUD_PROVIDER', title: 'Category' },
    apiToken: {
      type: 'string',
      format: 'password',
      title: 'API Token',
    },
  },
  required: ['app_type', 'category', 'apiToken'],
  isAvailable: true,
};

const slackSchema = {
  $id: 'slack',
  title: 'Slack',
  properties: {
    app_type: { const: 'slack', title: 'App type' },
    category: { const: 'NOTIFICATION', title: 'Category' },
    webhookUrl: { type: 'string', format: 'uri', title: 'Webhook URL' },
  },
  required: ['app_type', 'category', 'webhookUrl'],
  isAvailable: true,
};

const baseIntegration = {
  id: 'int-1',
  name: 'Cloudflare',
  description: '',
  appType: 'cloudflare',
  category: 'CLOUD_PROVIDER',
  config: { apiToken: 'tok' },
  workspaceId: 'ws-1',
  createdById: 'u-1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
} as unknown as GetIntegrationDto;

const cloudIntegration: GetIntegrationDto = {
  ...baseIntegration,
  syncSchedule: '0 17 * * *',
  lastRunAt: '2026-08-09T10:00:00.000Z',
};

describe('IntegrationDetailSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncOnSuccess = undefined;
  });

  it('renders the human-readable sync schedule and formatted lastRunAt', async () => {
    renderWithProviders(
      <IntegrationDetailSheet
        integration={cloudIntegration}
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Sync schedule')).toBeInTheDocument();
    });

    const tz = getLocalTimezone();
    const expectedLabel = formatCronLabel('0 17 * * *', tz);
    expect(expectedLabel).not.toBeNull();
    expect(screen.getByText(expectedLabel!)).toBeInTheDocument();

    expect(
      screen.getByText(
        dayjs('2026-08-09T10:00:00.000Z').format('MMM D, YYYY h:mm A'),
      ),
    ).toBeInTheDocument();
  });

  it('renders an em dash for lastRunAt when it is null', async () => {
    const withoutRun: GetIntegrationDto = {
      ...cloudIntegration,
      lastRunAt: null,
    };

    renderWithProviders(
      <IntegrationDetailSheet
        integration={withoutRun}
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Sync schedule')).toBeInTheDocument();
    });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the raw cron string when it cannot be formatted (disabled)', async () => {
    const disabled: GetIntegrationDto = {
      ...cloudIntegration,
      syncSchedule: 'disabled',
      lastRunAt: null,
    };

    renderWithProviders(
      <IntegrationDetailSheet
        integration={disabled}
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('disabled')).toBeInTheDocument();
    });
  });

  it('calls the sync mutation on "Sync now" and invalidates the list on success', async () => {
    const { queryClient } = renderWithProviders(
      <IntegrationDetailSheet
        integration={cloudIntegration}
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const syncButton = await screen.findByRole('button', {
      name: /sync now/i,
    });
    fireEvent.click(syncButton);
    expect(mocks.syncMutate).toHaveBeenCalledWith({ id: 'int-1' });

    mocks.syncOnSuccess?.({
      success: true,
      message: 'Sync completed',
      counts: { zones: 2, records: 5, wildcardZones: 1, targetsCreated: 3, assetsUpserted: 4 },
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalled();
    });
  });

  it('does not render the sync section for non-cloud integrations', async () => {
    const slackIntegration: GetIntegrationDto = {
      ...baseIntegration,
      name: 'Slack',
      appType: 'slack',
      category: 'NOTIFICATION',
      config: { webhookUrl: 'https://hooks.slack.com/x' },
    };

    renderWithProviders(
      <IntegrationDetailSheet
        integration={slackIntegration}
        schema={slackSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Slack')).toBeInTheDocument();
    });
    expect(screen.queryByText('Sync schedule')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /sync now/i }),
    ).not.toBeInTheDocument();
  });
});
