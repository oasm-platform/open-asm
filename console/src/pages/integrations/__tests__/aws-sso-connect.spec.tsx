import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { renderWithProviders } from '@/test/utils';
import { AwsSsoConnect } from '../components/aws-sso-connect';
import { ConnectIntegrationSheet } from '../components/connect-integration-sheet';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  createMutate: vi.fn(),
}));

vi.mock('@/services/apis/axios-client', () => ({
  axiosInstance: { post: mocks.post },
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
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof ResizeObserver;
});

const DEVICE_RESPONSE = {
  clientId: 'client-1',
  clientSecret: 'secret-1',
  deviceCode: 'device-code-1',
  userCode: 'WXYZ-1234',
  verificationUri: 'https://device.sso.us-east-1.amazonaws.com/',
  verificationUriComplete:
    'https://device.sso.us-east-1.amazonaws.com/?user_code=WXYZ-1234',
  interval: 0.05,
  expiresIn: 600,
};

const AUTHORIZED_RESPONSE = {
  status: 'authorized',
  refreshToken: 'refresh-1',
  accounts: [
    { accountId: '111111111111', accountName: 'Production', roles: ['Admin', 'ReadOnly'] },
    { accountId: '222222222222', accountName: 'Sandbox', roles: ['Viewer'] },
  ],
};

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
  required: ['app_type', 'category', 'connectionMethod', 'region'],
  isAvailable: true,
};

const pickOption = async (
  user: ReturnType<typeof userEvent.setup>,
  comboName: string,
  optionName: RegExp | string,
) => {
  await user.click(await screen.findByRole('combobox', { name: comboName }));
  await user.click(await screen.findByRole('option', { name: optionName }));
};

describe('AwsSsoConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs start → poll(authorized) → account/role select → complete', async () => {
    const onConnected = vi.fn();
    let polls = 0;
    mocks.post.mockImplementation((url: string) => {
      if (url.endsWith('/aws/sso/device')) return Promise.resolve(DEVICE_RESPONSE);
      if (url.endsWith('/aws/sso/poll')) {
        polls += 1;
        return Promise.resolve(
          polls === 1 ? { status: 'pending' } : AUTHORIZED_RESPONSE,
        );
      }
      if (url.endsWith('/aws/sso/complete')) return Promise.resolve({ id: 'int-1' });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const { user } = renderWithProviders(
      <AwsSsoConnect
        name="My AWS"
        syncSchedule="disabled"
        onConnected={onConnected}
      />,
    );

    await user.type(
      await screen.findByLabelText(/start url/i),
      'https://my-sso.awsapps.com/start',
    );
    await user.click(
      screen.getByRole('button', { name: /start authorization/i }),
    );

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith('/api/integrations/aws/sso/device', {
        region: 'us-east-1',
        startUrl: 'https://my-sso.awsapps.com/start',
      });
    });
    expect(await screen.findByText('WXYZ-1234')).toBeInTheDocument();

    expect(await screen.findByText('Authorization complete')).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith('/api/integrations/aws/sso/poll', {
      region: 'us-east-1',
      clientId: 'client-1',
      clientSecret: 'secret-1',
      deviceCode: 'device-code-1',
    });

    await pickOption(user, 'Account ID', /Production/);
    await pickOption(user, 'Role name', 'Admin');
    await user.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith(
        '/api/integrations/aws/sso/complete',
        {
          name: 'My AWS',
          region: 'us-east-1',
          startUrl: 'https://my-sso.awsapps.com/start',
          accountId: '111111111111',
          roleName: 'Admin',
          clientId: 'client-1',
          clientSecret: 'secret-1',
          refreshToken: 'refresh-1',
          syncSchedule: 'disabled',
        },
      );
    });
    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledTimes(1);
    });
  });

  it(
    'keeps polling through slow_down until authorized',
    async () => {
      let polls = 0;
      mocks.post.mockImplementation((url: string) => {
        if (url.endsWith('/aws/sso/device')) return Promise.resolve(DEVICE_RESPONSE);
        if (url.endsWith('/aws/sso/poll')) {
          polls += 1;
          if (polls === 1) return Promise.resolve({ status: 'pending' });
          if (polls === 2) return Promise.resolve({ status: 'slow_down' });
          return Promise.resolve(AUTHORIZED_RESPONSE);
        }
        return Promise.reject(new Error(`unexpected url ${url}`));
      });

      const { user } = renderWithProviders(
        <AwsSsoConnect name="My AWS" syncSchedule="disabled" />,
      );

      await user.type(
        await screen.findByLabelText(/start url/i),
        'https://my-sso.awsapps.com/start',
      );
      await user.click(
        screen.getByRole('button', { name: /start authorization/i }),
      );

      expect(
        await screen.findByText('Authorization complete', {}, { timeout: 8000 }),
      ).toBeInTheDocument();
      expect(polls).toBeGreaterThanOrEqual(3);
      expect(toast.error).not.toHaveBeenCalled();
    },
    15000,
  );

  it('shows an error toast and a restart affordance when the code expires', async () => {
    mocks.post.mockImplementation((url: string) => {
      if (url.endsWith('/aws/sso/device')) return Promise.resolve(DEVICE_RESPONSE);
      if (url.endsWith('/aws/sso/poll')) {
        return Promise.reject(new Error('device authorization expired'));
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const { user } = renderWithProviders(
      <AwsSsoConnect name="My AWS" syncSchedule="disabled" />,
    );

    await user.type(
      await screen.findByLabelText(/start url/i),
      'https://my-sso.awsapps.com/start',
    );
    await user.click(
      screen.getByRole('button', { name: /start authorization/i }),
    );

    expect(
      await screen.findByRole('button', { name: /restart authorization/i }),
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('device authorization expired');

    // Restarting re-runs the device step.
    mocks.post.mockImplementation((url: string) => {
      if (url.endsWith('/aws/sso/device')) return Promise.resolve(DEVICE_RESPONSE);
      if (url.endsWith('/aws/sso/poll')) return Promise.resolve({ status: 'pending' });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    await user.click(
      screen.getByRole('button', { name: /restart authorization/i }),
    );
    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith(
        '/api/integrations/aws/sso/device',
        {
          region: 'us-east-1',
          startUrl: 'https://my-sso.awsapps.com/start',
        },
      );
    });
  });

  it('never writes clientSecret/refreshToken to storage or the URL', async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    const initialHref = window.location.href;

    let polls = 0;
    mocks.post.mockImplementation((url: string) => {
      if (url.endsWith('/aws/sso/device')) return Promise.resolve(DEVICE_RESPONSE);
      if (url.endsWith('/aws/sso/poll')) {
        polls += 1;
        return Promise.resolve(
          polls === 1 ? { status: 'pending' } : AUTHORIZED_RESPONSE,
        );
      }
      if (url.endsWith('/aws/sso/complete')) return Promise.resolve({ id: 'int-1' });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const { user } = renderWithProviders(
      <AwsSsoConnect name="My AWS" syncSchedule="disabled" />,
    );

    await user.type(
      await screen.findByLabelText(/start url/i),
      'https://my-sso.awsapps.com/start',
    );
    await user.click(
      screen.getByRole('button', { name: /start authorization/i }),
    );
    await screen.findByText('Authorization complete');

    await pickOption(user, 'Account ID', /Production/);
    await pickOption(user, 'Role name', 'Admin');
    await user.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith(
        '/api/integrations/aws/sso/complete',
        expect.objectContaining({
          clientSecret: 'secret-1',
          refreshToken: 'refresh-1',
        }),
      );
    });

    const secrets = ['secret-1', 'refresh-1'];
    const dump = (storage: Storage) =>
      Object.keys(storage)
        .map((k) => `${k}=${storage.getItem(k) ?? ''}`)
        .join('&');
    for (const secret of secrets) {
      expect(dump(window.localStorage)).not.toContain(secret);
      expect(dump(window.sessionStorage)).not.toContain(secret);
      expect(window.location.href).not.toContain(secret);
      expect(window.location.search).not.toContain(secret);
    }
    expect(window.location.href).toBe(initialHref);
  });

  it('renders the device-code wizard for aws + sso in the connect sheet', async () => {
    mocks.post.mockResolvedValue(DEVICE_RESPONSE);
    const { user } = renderWithProviders(
      <ConnectIntegrationSheet schema={awsSchema} open onOpenChange={vi.fn()} />,
    );

    await pickOption(user, 'Connection method', 'Sso');

    expect(
      await screen.findByRole('button', { name: /start authorization/i }),
    ).toBeInTheDocument();
    // The raw schema fields are replaced by the wizard (no submit button).
    expect(
      screen.queryByRole('button', { name: /^connect$/i }),
    ).not.toBeInTheDocument();
  });
});
