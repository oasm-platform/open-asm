import { renderWithProviders, screen } from '@/test/utils';
import { within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentHttpRequestDetailDto,
  AgentHttpRequestListItemDto,
} from '@/services/apis/gen/queries';
import { NetworkPanel, type NetworkData } from './network-panel';

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'ws-1' } }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useAgentHttpRequestsControllerGetHttpRequest: vi.fn(),
}));

const t0 = Date.parse('2026-11-27T10:00:00.000Z');
const at = (ms: number) => new Date(t0 + ms).toISOString();

const OK_ROW: AgentHttpRequestListItemDto = {
  id: 'r1',
  conversationId: 'c1',
  conversationTitle: 'Recon',
  toolCallId: 'tc1',
  runId: 'run1',
  subagentId: null,
  agentName: 'main',
  workerId: 'w1',
  scheme: 'http',
  method: 'GET',
  host: 'api.acme.com',
  port: 8080,
  path: '/v1/users?id=***',
  statusCode: 200,
  outcome: 'allowed',
  error: null,
  requestBytes: 120,
  responseBytes: 2048,
  sentAt: at(0),
  completedAt: at(1500),
  durationMs: 1500,
  tlsIntercepted: false,
  createdAt: at(1500),
};

const NOT_FOUND_ROW: AgentHttpRequestListItemDto = {
  ...OK_ROW,
  id: 'r2',
  toolCallId: 'tc2',
  path: '/status/404',
  statusCode: 404,
  responseBytes: 0,
  sentAt: at(2000),
  durationMs: 300,
};

const TUNNEL_ROW: AgentHttpRequestListItemDto = {
  ...OK_ROW,
  id: 'r3',
  toolCallId: 'tc2',
  scheme: 'https',
  method: null,
  host: 'secure.acme.com',
  port: 443,
  path: null,
  statusCode: null,
  sentAt: at(2500),
  durationMs: 40,
};

const BLOCKED_ROW: AgentHttpRequestListItemDto = {
  ...OK_ROW,
  id: 'r4',
  toolCallId: 'tc2',
  host: '10.0.0.1',
  port: 80,
  path: '/admin',
  statusCode: null,
  outcome: 'denied',
  error: 'private address',
  responseBytes: 0,
  sentAt: at(3000),
  durationMs: 1,
};

const ROWS = [OK_ROW, NOT_FOUND_ROW, TUNNEL_ROW, BLOCKED_ROW];

const DETAIL: AgentHttpRequestDetailDto = {
  ...OK_ROW,
  command: 'curl -s http://api.acme.com:8080/v1/users',
  messageId: 'm1',
  payload: {
    requestHeaders: [{ name: 'Authorization', value: '***' }],
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
    requestBody: null,
    responseBody: '{"users":[]}',
    requestBodyEncoding: null,
    responseBodyEncoding: 'utf8',
    requestBodyTruncated: false,
    responseBodyTruncated: true,
    contentType: 'application/json',
  },
};

function network(overrides: Partial<NetworkData> = {}): NetworkData {
  return {
    requests: ROWS,
    data: { pages: [{ data: [...ROWS].reverse(), nextCursor: null }], pageParams: [] },
    isLoading: false,
    isError: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  } as NetworkData;
}

async function setup(
  props: Partial<Parameters<typeof NetworkPanel>[0]> = {},
  detail: AgentHttpRequestDetailDto = DETAIL,
) {
  const queries = await import('@/services/apis/gen/queries');
  vi.mocked(queries.useAgentHttpRequestsControllerGetHttpRequest).mockReturnValue({
    data: detail,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<
    typeof queries.useAgentHttpRequestsControllerGetHttpRequest
  >);
  const view = renderWithProviders(
    <NetworkPanel network={network()} {...props} />,
  );
  await screen.findByRole('searchbox', { name: 'Filter requests' });
  return view;
}

const row = (name: RegExp) => screen.getByRole('button', { name });

describe('NetworkPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the requests oldest first, DevTools style', async () => {
    await setup();

    const list = await screen.findByRole('list', { name: 'HTTP requests' });
    const names = within(list)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names[0]).toMatch(/^users\?id=\*\*\*/);
    expect(names[3]).toMatch(/^admin/);

    const ok = row(/users\?id/);
    expect(ok).toHaveTextContent('api.acme.com');
    expect(ok).toHaveTextContent('200');
    expect(ok).toHaveTextContent('2.0 KiB');
    expect(ok).toHaveTextContent('1.5 s');
    expect(ok).toHaveAttribute('title', 'http://api.acme.com:8080/v1/users?id=***');

    // A tunnel is named by host:port and has no status to show
    const tunnel = row(/secure\.acme\.com:443/);
    expect(tunnel).toHaveTextContent('—');
    expect(tunnel).toHaveTextContent('HTTPS tunnel: no status visible');
    expect(screen.getByText('Requests: 4 · 4.0 KiB transferred')).toBeInTheDocument();
    expect(screen.getByText('Errors: 2')).toBeInTheDocument();
  });

  it('tints failed, blocked and >= 400 requests red', async () => {
    await setup();

    expect(row(/^404/)).toHaveClass('text-red-600');
    expect(row(/^admin/)).toHaveClass('text-red-600');
    expect(row(/^admin/)).toHaveTextContent('(blocked)');
    expect(row(/users\?id/)).not.toHaveClass('text-red-600');
  });

  it('filters by text and by errors', async () => {
    const { user } = await setup();

    await user.type(screen.getByRole('searchbox', { name: 'Filter requests' }), 'secure');
    expect(screen.getAllByRole('button', { name: /acme|10\.0/ })).toHaveLength(1);
    expect(screen.getByText('Requests: 1 / 4 · 2.0 KiB transferred')).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Filter requests' }));
    await user.click(screen.getByRole('button', { name: 'Errors' }));
    expect(screen.getByRole('button', { name: 'Errors' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const list = screen.getByRole('list', { name: 'HTTP requests' });
    expect(within(list).getAllByRole('button')).toHaveLength(2);

    await user.type(screen.getByRole('searchbox', { name: 'Filter requests' }), 'nothing');
    expect(screen.getByText('No requests match this filter.')).toBeInTheDocument();
  });

  it("shows one command's requests behind a removable chip", async () => {
    const onClear = vi.fn();
    const { user } = await setup({
      toolCallFilter: { toolCallId: 'tc2', command: 'curl -s https://secure.acme.com' },
      onClearToolCallFilter: onClear,
    });

    const list = screen.getByRole('list', { name: 'HTTP requests' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);
    expect(within(list).queryByRole('button', { name: /users\?id/ })).toBeNull();
    expect(
      screen.getByText('Command: curl -s https://secure.acme.com'),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Show requests of every command' }),
    );
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('opens a request in the panel and comes back to its row', async () => {
    const onShowInChat = vi.fn();
    const { user } = await setup({ onShowInChat });

    await user.click(row(/users\?id/));

    const back = screen.getByRole('button', { name: 'Back to requests' });
    expect(back).toHaveFocus();
    expect(screen.queryByRole('list', { name: 'HTTP requests' })).toBeNull();
    expect(
      screen.getByText('http://api.acme.com:8080/v1/users?id=***'),
    ).toBeInTheDocument();
    expect(screen.getByText('api.acme.com:8080')).toBeInTheDocument();
    expect(screen.getByText('Content-Type')).toBeInTheDocument();
    expect(screen.getByText('Authorization')).toBeInTheDocument();
    expect(
      screen.getByText('curl -s http://api.acme.com:8080/v1/users'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show in chat' }));
    expect(onShowInChat).toHaveBeenCalledWith('tc1');

    await user.click(screen.getByRole('tab', { name: 'Payload' }));
    expect(screen.getByText('This request has no payload.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Response' }));
    expect(screen.getByText('{"users":[]}')).toBeInTheDocument();
    expect(screen.getByText('Truncated at 64 KiB')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Timing' }));
    expect(screen.getByText('Duration')).toBeInTheDocument();

    await user.click(back);
    expect(row(/users\?id/)).toHaveFocus();
    expect(row(/users\?id/)).toHaveAttribute('aria-current', 'true');
  });

  it('moves between rows with the arrow keys', async () => {
    const { user } = await setup();

    row(/users\?id/).focus();
    await user.keyboard('{ArrowDown}');
    expect(row(/^404/)).toHaveFocus();
    await user.keyboard('{End}');
    expect(row(/^admin/)).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Back to requests' })).toHaveFocus();
  });

  it('shows a binary body by its size until base64 is asked for', async () => {
    const { user } = await setup({}, {
      ...DETAIL,
      payload: {
        ...DETAIL.payload!,
        responseBody: 'AAEC',
        responseBodyEncoding: 'base64',
        responseBodyTruncated: false,
      },
    });

    await user.click(row(/users\?id/));
    await user.click(screen.getByRole('tab', { name: 'Response' }));
    expect(screen.getByText('Binary (3 B)')).toBeInTheDocument();
    expect(screen.queryByText('AAEC')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Show base64' }));
    expect(screen.getByText('AAEC')).toBeInTheDocument();
  });

  it('says a tunnel has only its connection metadata', async () => {
    const { user } = await setup({}, {
      ...TUNNEL_ROW,
      command: 'curl https://secure.acme.com',
      messageId: null,
      payload: null,
    });

    await user.click(row(/secure\.acme\.com:443/));
    expect(
      screen.getByText(/only the connection metadata is recorded/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Response headers')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Payload' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Response' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Timing' })).toBeInTheDocument();
  });

  it('keeps the rows when a refresh fails', async () => {
    await setup({ network: network({ isError: true }) });

    expect(
      screen.getByText('Could not load HTTP requests. Try again later.'),
    ).toBeInTheDocument();
    expect(row(/users\?id/)).toBeInTheDocument();
  });

  it('explains what is captured when nothing is logged', async () => {
    await setup({ network: network({ requests: [], data: undefined }) });

    expect(screen.getByText('No HTTP requests yet')).toBeInTheDocument();
    expect(
      screen.getByText(/HTTPS requests show connection metadata only/),
    ).toBeInTheDocument();
  });

  it('loads older requests, and reloads when opened and on refresh', async () => {
    const fetchNextPage = vi.fn();
    const refetch = vi.fn();
    const { user } = await setup({
      network: network({ hasNextPage: true, fetchNextPage, refetch }),
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Load older requests' }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refetch).toHaveBeenCalledTimes(2);
  });
});
