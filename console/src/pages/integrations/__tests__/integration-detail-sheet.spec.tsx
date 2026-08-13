import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import {
  formatCronLabel,
  formatNextRun,
  getLocalTimezone,
} from '@/lib/cron-schedule';
import { renderWithProviders } from '@/test/utils';
import type { GetIntegrationDto } from '@/services/apis/gen/queries';
import { IntegrationDetailSheet } from '../components/integration-detail-sheet';

const mocks = vi.hoisted(() => ({
  syncMutate: vi.fn(),
  syncOnSuccess: undefined as undefined | ((data: unknown) => void),
  syncOnError: undefined as undefined | ((error: unknown) => void),
  syncIsPending: false,
  testMutate: vi.fn(),
  testIsPending: false,
  updateMutate: vi.fn(),
  updateIsPending: false,
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/apis/gen/queries')>();
  return {
    ...actual,
    useIntegrationsControllerTestIntegration: () => ({
      mutate: mocks.testMutate,
      isPending: mocks.testIsPending,
    }),
    useIntegrationsControllerUpdateIntegration: () => ({
      mutate: mocks.updateMutate,
      isPending: mocks.updateIsPending,
    }),
    useIntegrationsControllerSyncIntegration: (opts?: {
      mutation?: {
        onSuccess?: (data: unknown) => void;
        onError?: (error: unknown) => void;
      };
    }) => {
      mocks.syncOnSuccess = opts?.mutation?.onSuccess;
      mocks.syncOnError = opts?.mutation?.onError;
      return { mutate: mocks.syncMutate, isPending: mocks.syncIsPending };
    },
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
    mocks.syncOnError = undefined;
    mocks.syncIsPending = false;
    mocks.testIsPending = false;
    mocks.updateIsPending = false;
  });

  it('renders the human-readable sync schedule and timezone-annotated lastRunAt (U8)', async () => {
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

    // U8: the Last sync timestamp is rendered via formatNextRun so it carries
    // the local timezone annotation instead of a bare wall-clock time.
    expect(
      screen.getByText(
        formatNextRun(new Date('2026-08-09T10:00:00.000Z'), tz),
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

  it('shows the disabled-schedule copy instead of the raw "disabled" string (U3)', async () => {
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
      expect(
        screen.getByText('No schedule — automatic syncs are off'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('disabled')).not.toBeInTheDocument();
  });

  it('masks password-format config in view mode (U6)', async () => {
    const withToken: GetIntegrationDto = {
      ...cloudIntegration,
      syncSchedule: 'disabled',
      lastRunAt: null,
      config: { apiToken: 'tok-12345678' },
    };

    renderWithProviders(
      <IntegrationDetailSheet
        integration={withToken}
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('API Token')).toBeInTheDocument();
    });
    // Masked value: '****' + last 4 chars, never the raw secret.
    expect(screen.getByText('****5678')).toBeInTheDocument();
    expect(screen.queryByText('tok-12345678')).not.toBeInTheDocument();
  });

  it('calls the sync mutation on "Sync now", invalidates the list and shows the queued toast on success (U5)', async () => {
    const { queryClient } = renderWithProviders(
      <IntegrationDetailSheet
        integration={cloudIntegration}
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const toast = (await import('sonner')).toast;

    const syncButton = await screen.findByRole('button', {
      name: /sync now/i,
    });
    fireEvent.click(syncButton);
    expect(mocks.syncMutate).toHaveBeenCalledWith({ id: 'int-1' });

    // The backend enqueues a job and responds immediately — no counts.
    mocks.syncOnSuccess?.({ success: true, message: 'Sync queued' });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalled();
    });
    expect(toast.success).toHaveBeenCalledWith(
      'Sync started — it may take a few minutes',
    );
  });

  it('shows an error toast when the sync mutation rejects (U5)', async () => {
    renderWithProviders(
      <IntegrationDetailSheet
        integration={cloudIntegration}
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );
    const toast = (await import('sonner')).toast;

    const syncButton = await screen.findByRole('button', {
      name: /sync now/i,
    });
    fireEvent.click(syncButton);

    mocks.syncOnError?.(new Error('boom'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to sync integration');
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

  it('shows a schedule editor in edit mode for cloud integrations', async () => {
    renderWithProviders(
      <IntegrationDetailSheet
        integration={cloudIntegration}
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));

    // The sync-schedule toggle and the cron builder appear only in edit mode.
    const toggle = await screen.findByRole('switch', {
      name: /sync schedule/i,
    });
    expect(toggle).toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
  });

  it('saving with a changed schedule sends syncSchedule in the update payload', async () => {
    renderWithProviders(
      <IntegrationDetailSheet
        integration={cloudIntegration}
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await screen.findByRole('switch', { name: /sync schedule/i });
    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }));

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mocks.updateMutate).toHaveBeenCalled();
    });
    expect(mocks.updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'int-1',
        data: expect.objectContaining({
          name: 'Cloudflare',
          // Weekly cron: "m h * * dow" — the original daily "0 17 * * *"
          // would not match (dow must be an explicit weekday).
          syncSchedule: expect.stringMatching(
            /^\d{1,2} \d{1,2} \* \* \d(,\d)*$/,
          ),
        }),
      }),
    );
  });

  it('saving with the schedule disabled sends syncSchedule: "disabled"', async () => {
    renderWithProviders(
      <IntegrationDetailSheet
        integration={cloudIntegration}
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    const toggle = await screen.findByRole('switch', {
      name: /sync schedule/i,
    });

    // Turn the schedule off, then save.
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mocks.updateMutate).toHaveBeenCalled();
    });
    expect(mocks.updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'int-1',
        data: expect.objectContaining({
          syncSchedule: 'disabled',
        }),
      }),
    );
  });

  it('edit mode for a non-cloud integration shows no schedule editor', async () => {
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

    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await screen.findByLabelText(/integration name/i);

    expect(screen.queryByText('Sync schedule')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('pressing Enter in a text field saves the edit (U15)', async () => {
    const { user } = renderWithProviders(
      <IntegrationDetailSheet
        integration={cloudIntegration}
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    const nameInput = await screen.findByLabelText(/integration name/i);

    await user.type(nameInput, '{Enter}');

    await waitFor(() => {
      expect(mocks.updateMutate).toHaveBeenCalled();
    });
  });

  it('disables Edit/Test/Sync while a sync is running (U16)', async () => {
    mocks.syncIsPending = true;
    renderWithProviders(
      <IntegrationDetailSheet
        integration={cloudIntegration}
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /syncing/i }),
      ).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: /edit/i })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /test integration/i }),
    ).toBeDisabled();
  });

  it('disables the Sync button while a test is running (U16)', async () => {
    mocks.testIsPending = true;
    renderWithProviders(
      <IntegrationDetailSheet
        integration={cloudIntegration}
        schema={cloudSchema}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /sync now/i }),
      ).toBeDisabled();
    });
  });
});
