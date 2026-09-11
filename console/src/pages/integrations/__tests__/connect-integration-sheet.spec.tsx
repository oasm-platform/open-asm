import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// Mirrors core-api aws.schema.ts (todo 9): connectionMethod enum + method-scoped
// fields guarded by ui:visibleWhen (scalar AND array equals) + a grouped
// non-boolean field (roleArn) to pin the grouped typed-renderer fix (todo 11).
const awsSchema = {
  $id: 'aws',
  title: 'AWS',
  description: 'Discover public AWS resources',
  properties: {
    app_type: { const: 'aws', title: 'App type' },
    category: { const: 'CLOUD_PROVIDER', title: 'Category' },
    connectionMethod: {
      type: 'string',
      enum: ['accessKey', 'assumeRole', 'crossAccountRole', 'workloadIdentity', 'sso'],
      default: 'accessKey',
      title: 'Connection method',
    },
    region: { type: 'string', default: 'us-east-1', title: 'AWS region' },
    accessKeyId: {
      type: 'string',
      title: 'Access key ID',
      'ui:visibleWhen': {
        field: 'connectionMethod',
        equals: ['accessKey', 'assumeRole', 'crossAccountRole'],
      },
    },
    secretAccessKey: {
      type: 'string',
      format: 'password',
      title: 'Secret access key',
      'ui:visibleWhen': {
        field: 'connectionMethod',
        equals: ['accessKey', 'assumeRole', 'crossAccountRole'],
      },
    },
    roleArn: {
      type: 'string',
      title: 'Role ARN',
      'ui:form:group': 'role',
      'ui:visibleWhen': {
        field: 'connectionMethod',
        equals: ['assumeRole', 'crossAccountRole', 'workloadIdentity'],
      },
    },
    externalId: {
      type: 'string',
      format: 'password',
      title: 'External ID',
      'ui:visibleWhen': {
        field: 'connectionMethod',
        equals: ['assumeRole', 'crossAccountRole'],
      },
    },
    webIdentityToken: {
      type: 'string',
      format: 'password',
      title: 'Web identity token',
      'ui:visibleWhen': { field: 'connectionMethod', equals: 'workloadIdentity' },
    },
    startUrl: {
      type: 'string',
      title: 'Start URL',
      'ui:visibleWhen': { field: 'connectionMethod', equals: 'sso' },
    },
    accountId: {
      type: 'string',
      title: 'Account ID',
      'ui:visibleWhen': { field: 'connectionMethod', equals: 'sso' },
    },
    roleName: {
      type: 'string',
      title: 'Role name',
      'ui:visibleWhen': { field: 'connectionMethod', equals: 'sso' },
    },
  },
  // Every method-scoped field is required at the top level; the sheet must skip
  // the ones hidden by connectionMethod (todo 12), so hidden fields never block.
  required: [
    'app_type',
    'category',
    'connectionMethod',
    'region',
    'accessKeyId',
    'secretAccessKey',
    'roleArn',
    'externalId',
    'webIdentityToken',
    'startUrl',
    'accountId',
    'roleName',
  ],
  isAvailable: true,
};

const fillRequired = async (labelRegex: RegExp, value = 'secret-value') => {
  fireEvent.change(screen.getByLabelText(labelRegex), {
    target: { value },
  });
};

const selectConnectionMethod = async (
  user: ReturnType<typeof userEvent.setup>,
  optionLabel: string,
) => {
  await user.click(
    await screen.findByRole('combobox', { name: 'Connection method' }),
  );
  await user.click(await screen.findByRole('option', { name: optionLabel }));
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

  it('renders the connectionMethod enum as a combobox defaulting to Access Key (U11)', async () => {
    renderWithProviders(
      <ConnectIntegrationSheet schema={awsSchema} open onOpenChange={vi.fn()} />,
    );

    const combo = await screen.findByRole('combobox', {
      name: 'Connection method',
    });
    expect(combo).toHaveTextContent('Access Key');
    // The default method is accessKey, so its two fields are shown…
    expect(screen.getByLabelText(/access key id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/secret access key/i)).toBeInTheDocument();
    // …and the assumeRole-only fields are hidden.
    expect(screen.queryByLabelText(/role arn/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/external id/i)).not.toBeInTheDocument();
  });

  it('shows base credentials for accessKey but hides roleArn/webIdentityToken/sso fields', async () => {
    renderWithProviders(
      <ConnectIntegrationSheet schema={awsSchema} open onOpenChange={vi.fn()} />,
    );
    await screen.findByRole('combobox', { name: 'Connection method' });

    expect(screen.getByLabelText(/access key id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/secret access key/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/role arn/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/web identity token/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/start url/i)).not.toBeInTheDocument();
  });

  it('reveals roleArn + base credentials and externalId when assumeRole is selected', async () => {
    const { user } = renderWithProviders(
      <ConnectIntegrationSheet schema={awsSchema} open onOpenChange={vi.fn()} />,
    );
    await selectConnectionMethod(user, 'Assume Role');

    expect(screen.getByLabelText(/access key id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/secret access key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/role arn/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/external id/i)).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/web identity token/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/start url/i)).not.toBeInTheDocument();
  });

  it('keeps roleArn visible under multiple methods via the array equals condition', async () => {
    const { user } = renderWithProviders(
      <ConnectIntegrationSheet schema={awsSchema} open onOpenChange={vi.fn()} />,
    );
    await screen.findByRole('combobox', { name: 'Connection method' });

    // roleArn's visibleWhen.equals is an ARRAY: assumeRole, crossAccountRole, workloadIdentity.
    await selectConnectionMethod(user, 'Assume Role');
    expect(screen.getByLabelText(/role arn/i)).toBeInTheDocument();

    await selectConnectionMethod(user, 'Workload Identity');
    expect(screen.getByLabelText(/role arn/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/web identity token/i),
    ).toBeInTheDocument();
    // base creds + externalId are not in workloadIdentity's visible set.
    expect(screen.queryByLabelText(/access key id/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/external id/i)).not.toBeInTheDocument();
  });

  it('renders the grouped roleArn as a typed text input, not a Switch (U11)', async () => {
    const { user } = renderWithProviders(
      <ConnectIntegrationSheet schema={awsSchema} open onOpenChange={vi.fn()} />,
    );
    await selectConnectionMethod(user, 'Assume Role');

    const roleArn = screen.getByLabelText(/role arn/i);
    expect(roleArn.tagName).toBe('INPUT');
    expect(roleArn).toHaveAttribute('type', 'text');
    // Grouped fields must NOT collapse to a boolean Switch.
    expect(
      screen.queryByRole('switch', { name: /role arn/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the aws sso device-code wizard instead of raw sso fields', async () => {
    const { user } = renderWithProviders(
      <ConnectIntegrationSheet schema={awsSchema} open onOpenChange={vi.fn()} />,
    );
    await selectConnectionMethod(user, 'Sso');

    // The SSO wizard owns the region/startUrl/accountId/roleName fields.
    expect(
      await screen.findByRole('button', { name: /start authorization/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/account id/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/role name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/access key id/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/role arn/i)).not.toBeInTheDocument();
  });

  it('submits only the visible config values and skips hidden required fields (U12)', async () => {
    const { user } = renderWithProviders(
      <ConnectIntegrationSheet schema={awsSchema} open onOpenChange={vi.fn()} />,
    );
    await screen.findByRole('button', { name: /connect/i });
    await user.clear(screen.getByLabelText(/integration name/i));
    await user.type(screen.getByLabelText(/integration name/i), 'My AWS');

    // Only accessKeyId is filled; every other required key is hidden or ignored.
    await user.type(screen.getByLabelText(/access key id/i), 'AKIA123');
    await user.type(screen.getByLabelText(/secret access key/i), 'shh');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(mocks.createMutate).toHaveBeenCalled();
    });
    expect(mocks.createMutate).toHaveBeenCalledWith({
      data: {
        name: 'My AWS',
        appType: 'aws',
        category: 'CLOUD_PROVIDER',
        syncSchedule: 'disabled',
        config: {
          connectionMethod: 'accessKey',
          region: 'us-east-1',
          accessKeyId: 'AKIA123',
          secretAccessKey: 'shh',
        },
      },
    });
  });

  it('does not block submit on hidden required fields (no missing-fields toast)', async () => {
    const { user } = renderWithProviders(
      <ConnectIntegrationSheet schema={awsSchema} open onOpenChange={vi.fn()} />,
    );
    await screen.findByRole('button', { name: /connect/i });

    await user.type(screen.getByLabelText(/access key id/i), 'AKIA123');
    await user.type(screen.getByLabelText(/secret access key/i), 'shh');
    await user.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(mocks.createMutate).toHaveBeenCalled();
    });
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.stringContaining('required fields'),
    );
  });
});
