import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LLMConfigWithProviderDto } from '@/services/apis/gen/queries';
import { OrcaRouterConnectForm } from './orcarouter-connect-form';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  complete: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('@/services/apis/gen/queries', () => ({
  LLMConfigWithProviderDtoProviderId: {
    custom: 'custom',
    openai: 'openai',
    orcarouter: 'orcarouter',
  },
  useAgentsControllerStartOrcaRouterConnect: () => ({
    mutateAsync: mocks.start,
  }),
  useAgentsControllerCompleteOrcaRouterConnect: () => ({
    mutateAsync: mocks.complete,
  }),
  useAgentsControllerCancelOrcaRouterConnect: () => ({ mutate: mocks.cancel }),
}));

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

const provider = {
  providerId: 'orcarouter',
  providerName: 'OrcaRouter Cyber Inference',
  isConnected: false,
  isAcceptCustomApiUrl: false,
} as LLMConfigWithProviderDto;

const attempt = (id: string) => ({
  attemptId: id,
  authorizeUrl: `https://www.orcarouter.ai/auth?state=${id}`,
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
});
const url = (id: string) => attempt(id).authorizeUrl;

function renderForm() {
  const onConnected = vi.fn();
  const view = render(
    <OrcaRouterConnectForm
      provider={provider}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
      isSubmitting={false}
      onConnected={onConnected}
    />,
  );
  return { ...view, onConnected };
}

const connectButton = () =>
  screen.getByRole('button', { name: 'Connect with OrcaRouter' });

const startPkce = async () => {
  await userEvent.click(screen.getByRole('tab', { name: 'Connect with OrcaRouter' }));
  await userEvent.click(connectButton());
};

const typeCode = (code: string) =>
  userEvent.type(screen.getByLabelText('Authorization code'), code);

const finish = () =>
  userEvent.click(screen.getByRole('button', { name: 'Finish connection' }));

beforeEach(() => {
  vi.clearAllMocks();
  window.open = vi.fn();
});

describe('OrcaRouterConnectForm credential choices', () => {
  it('offers API key and OAuth 2.0 + PKCE as explicit, separate choices', () => {
    renderForm();

    expect(screen.getByRole('tab', { name: 'API Key' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('tab', { name: 'Connect with OrcaRouter' }),
    ).toHaveAttribute('aria-selected', 'false');
    // The API key path is the existing form, unchanged.
    expect(screen.getByPlaceholderText('e.g. My Work Key')).toBeInTheDocument();
  });

  it('starts the browser authorization and shows the returned code form', async () => {
    mocks.start.mockResolvedValue(attempt('a1'));
    renderForm();
    await startPkce();

    expect(screen.getByText(url('a1'))).toBeInTheDocument();
    expect(window.open).toHaveBeenCalledWith(url('a1'), '_blank', 'noopener,noreferrer');
    expect(screen.getByLabelText('Authorization code')).toBeInTheDocument();
  });
});

describe('OrcaRouterConnectForm attempt lifecycle', () => {
  it('frees the login lock on pagehide so a second login starts without a remount', async () => {
    mocks.start
      .mockResolvedValueOnce(attempt('first'))
      .mockResolvedValueOnce(attempt('second'));
    renderForm();
    await startPkce();
    expect(screen.getByText(url('first'))).toBeInTheDocument();

    window.dispatchEvent(new Event('pagehide'));

    // Same mounted tree: the hint is gone and the action is available again.
    await waitFor(() => expect(connectButton()).toBeEnabled());
    expect(screen.queryByLabelText('Authorization code')).not.toBeInTheDocument();
    expect(mocks.cancel).toHaveBeenCalledWith({ attemptId: 'first' });

    await userEvent.click(connectButton());

    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(screen.getByText(url('second'))).toBeInTheDocument();
  });

  it('discards and releases an attempt that arrives after pagehide', async () => {
    let resolveStart!: (value: ReturnType<typeof attempt>) => void;
    mocks.start.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    renderForm();
    await startPkce();
    window.dispatchEvent(new Event('pagehide'));
    resolveStart(attempt('late'));

    await waitFor(() =>
      expect(mocks.cancel).toHaveBeenCalledWith({ attemptId: 'late' }),
    );
    expect(screen.queryByText(url('late'))).toBeNull();
    expect(connectButton()).toBeEnabled();
  });

  it('releases the attempt when the user switches back to the API key choice', async () => {
    mocks.start.mockResolvedValue(attempt('switch'));
    renderForm();
    await startPkce();

    await userEvent.click(screen.getByRole('tab', { name: 'API Key' }));

    expect(mocks.cancel).toHaveBeenCalledWith({ attemptId: 'switch' });
    expect(screen.getByPlaceholderText('e.g. My Work Key')).toBeInTheDocument();
  });

  it('releases the attempt when the dialog unmounts', async () => {
    mocks.start.mockResolvedValue(attempt('closed'));
    const { unmount } = renderForm();
    await startPkce();

    unmount();

    expect(mocks.cancel).toHaveBeenCalledWith({ attemptId: 'closed' });
  });
});

describe('OrcaRouterConnectForm completion', () => {
  it('finishes the connection once the code is exchanged', async () => {
    mocks.start.mockResolvedValue(attempt('done'));
    mocks.complete.mockResolvedValue({ id: 'cfg-1' });
    const { onConnected } = renderForm();
    await startPkce();

    await typeCode('CODE-1');
    await finish();

    expect(mocks.complete).toHaveBeenCalledWith({
      data: { attemptId: 'done', code: 'CODE-1' },
    });
    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
  });

  it('keeps the attempt usable when the exchange is rejected', async () => {
    mocks.start.mockResolvedValue(attempt('retry'));
    mocks.complete.mockRejectedValue({
      response: { data: { message: 'The code is unknown or expired.' } },
    });
    const { onConnected } = renderForm();
    await startPkce();

    await typeCode('BAD');
    await finish();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The code is unknown or expired.',
    );
    expect(onConnected).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Finish connection' })).toBeEnabled();
  });
});
