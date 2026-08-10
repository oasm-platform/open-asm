import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { ConnectIntegrationSheet } from '../components/connect-integration-sheet';

const mocks = vi.hoisted(() => ({
  createMutate: vi.fn(),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/apis/gen/queries')>();
  return {
    ...actual,
    useIntegrationsControllerCreateIntegration: () => ({
      mutate: mocks.createMutate,
      isPending: false,
    }),
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
  description: 'Send notifications to Slack',
  properties: {
    app_type: { const: 'slack', title: 'App type' },
    category: { const: 'NOTIFICATION', title: 'Category' },
    webhookUrl: { type: 'string', format: 'uri', title: 'Webhook URL' },
  },
  required: ['app_type', 'category', 'webhookUrl'],
  isAvailable: true,
};

describe('ConnectIntegrationSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the schedule selector for CLOUD_PROVIDER schemas', async () => {
    renderWithProviders(
      <ConnectIntegrationSheet
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Connect Cloudflare')).toBeInTheDocument();
    });
    expect(screen.getByText('Sync schedule')).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: /sync schedule/i }),
    ).toBeInTheDocument();
  });

  it('does not render the schedule selector for non-cloud schemas', async () => {
    renderWithProviders(
      <ConnectIntegrationSheet
        schema={slackSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Connect Slack')).toBeInTheDocument();
    });
    expect(screen.queryByText('Sync schedule')).not.toBeInTheDocument();
  });

  it('submits syncSchedule "disabled" by default for cloud providers', async () => {
    renderWithProviders(
      <ConnectIntegrationSheet
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /connect/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(mocks.createMutate).toHaveBeenCalled();
    });
    expect(mocks.createMutate).toHaveBeenCalledWith({
      data: {
        name: 'Cloudflare',
        appType: 'cloudflare',
        category: 'CLOUD_PROVIDER',
        syncSchedule: 'disabled',
        config: {},
      },
    });
  });

  it('submits a 5-field cron when the schedule is enabled', async () => {
    renderWithProviders(
      <ConnectIntegrationSheet
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: /sync schedule/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('switch', { name: /sync schedule/i }));

    // The cron builder mounts and emits its default schedule via onChange.
    await screen.findByText(/next run/i);

    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(mocks.createMutate).toHaveBeenCalled();
    });
    expect(mocks.createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          syncSchedule: expect.stringMatching(
            /^\d{1,2} \d{1,2} \S+ \S+ \S+$/,
          ),
        }),
      }),
    );
  });
});
