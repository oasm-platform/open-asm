import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
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

beforeAll(() => {
  // The U15 <form> wrapper makes Radix Switch render its hidden form input,
  // which measures itself via useSize -> ResizeObserver (absent in jsdom).
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof ResizeObserver;
});

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

const fillRequired = async (labelRegex: RegExp, value = 'secret-value') => {
  fireEvent.change(screen.getByLabelText(labelRegex), {
    target: { value },
  });
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
    await fillRequired(/api token/i);
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
        config: { apiToken: 'secret-value' },
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
    await fillRequired(/api token/i);
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

  it('blocks submit and lists missing required fields without calling the mutation (U4)', async () => {
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
      expect(toast.error).toHaveBeenCalledWith(
        'Please fill in required fields: apiToken',
      );
    });
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('omits syncSchedule from the payload for non-cloud integrations (U11)', async () => {
    renderWithProviders(
      <ConnectIntegrationSheet
        schema={slackSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /connect/i }),
      ).toBeInTheDocument();
    });
    await fillRequired(/webhook url/i, 'https://hooks.slack.com/x');
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(mocks.createMutate).toHaveBeenCalled();
    });
    const payload = mocks.createMutate.mock.calls[0][0].data;
    expect(payload).not.toHaveProperty('syncSchedule');
  });

  it('preserves the authored cron when the schedule toggle is turned off and on (U13)', async () => {
    const { user } = renderWithProviders(
      <ConnectIntegrationSheet
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    const toggle = await screen.findByRole('switch', {
      name: /sync schedule/i,
    });
    await user.click(toggle);

    // Author a weekly cron in the builder.
    await user.click(await screen.findByRole('button', { name: 'Weekly' }));
    await screen.findByRole('button', { name: 'Mon' });

    // Toggle off: the builder unmounts.
    await user.click(screen.getByRole('switch', { name: /sync schedule/i }));
    expect(
      screen.queryByRole('button', { name: 'Weekly' }),
    ).not.toBeInTheDocument();

    // Toggle on: the builder must remount with the previously entered cron.
    await user.click(screen.getByRole('switch', { name: /sync schedule/i }));
    const weekly = await screen.findByRole('button', { name: 'Weekly' });
    expect(weekly).toHaveAttribute('aria-pressed', 'true');
  });

  it('submits when Enter is pressed in a text field (U15)', async () => {
    const { user } = renderWithProviders(
      <ConnectIntegrationSheet
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: /connect/i });
    await user.type(screen.getByLabelText(/api token/i), 'tok-123{Enter}');

    await waitFor(() => {
      expect(mocks.createMutate).toHaveBeenCalled();
    });
  });
});
