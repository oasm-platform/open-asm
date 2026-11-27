import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentHttpRequestDetailDto,
  AgentHttpRequestListItemDto,
  AgentHttpRequestListResponseDto,
} from '@/services/apis/gen/queries';
import AgentHttpRequestsPage from './http-requests';

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'ws-1' } }),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, isLoading: false }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  agentHttpRequestsControllerGetHttpRequests: vi.fn(),
  useAgentHttpRequestsControllerGetHttpRequest: vi.fn(),
}));

const now = new Date().toISOString();

const GET_ROW: AgentHttpRequestListItemDto = {
  id: 'r1',
  conversationId: 'c1',
  conversationTitle: 'Recon acme.com',
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
  statusCode: 404,
  outcome: 'allowed',
  error: null,
  requestBytes: 120,
  responseBytes: 2048,
  sentAt: now,
  completedAt: now,
  durationMs: 1500,
  tlsIntercepted: false,
  createdAt: now,
};

const TUNNEL_ROW: AgentHttpRequestListItemDto = {
  ...GET_ROW,
  id: 'r2',
  scheme: 'https',
  method: null,
  host: 'secure.acme.com',
  port: 443,
  path: null,
  statusCode: null,
  outcome: 'denied',
  agentName: 'recon-scout',
  subagentId: 's1',
  durationMs: 40,
  responseBytes: 0,
};

const DETAIL: AgentHttpRequestDetailDto = {
  ...GET_ROW,
  command: 'curl -s http://api.acme.com:8080/v1/users',
  messageId: 'm1',
  payload: {
    requestHeaders: [{ name: 'Authorization', value: '***' }],
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
    requestBody: null,
    responseBody: '{"error":"not found"}',
    requestBodyEncoding: null,
    responseBodyEncoding: 'utf8',
    requestBodyTruncated: false,
    responseBodyTruncated: true,
    contentType: 'application/json',
  },
};

async function setup(
  pages: AgentHttpRequestListResponseDto[],
  props: Partial<Parameters<typeof AgentHttpRequestsPage>[0]> = {},
  detail: AgentHttpRequestDetailDto = DETAIL,
) {
  const queries = await import('@/services/apis/gen/queries');
  const fetcher = vi.mocked(queries.agentHttpRequestsControllerGetHttpRequests);
  for (const page of pages) fetcher.mockResolvedValueOnce(page);
  vi.mocked(queries.useAgentHttpRequestsControllerGetHttpRequest).mockReturnValue({
    data: detail,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<
    typeof queries.useAgentHttpRequestsControllerGetHttpRequest
  >);
  const onSearchChange = vi.fn();
  return {
    fetcher,
    onSearchChange,
    ...renderWithProviders(
      <AgentHttpRequestsPage
        search={{}}
        onSearchChange={onSearchChange}
        {...props}
      />,
    ),
  };
}

describe('AgentHttpRequestsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists requests, CONNECT tunnels and their conversation', async () => {
    await setup([{ data: [GET_ROW, TUNNEL_ROW], nextCursor: null }]);

    expect(
      await screen.findByRole('button', {
        name: 'http://api.acme.com:8080/v1/users?id=***',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('1.5 s')).toBeInTheDocument();
    expect(screen.getByText('2.0 KiB')).toBeInTheDocument();

    const tunnel = screen
      .getByRole('button', { name: 'https://secure.acme.com' })
      .closest('tr')!;
    expect(within(tunnel).getByText('CONNECT')).toBeInTheDocument();
    expect(within(tunnel).getByText('Denied')).toBeInTheDocument();
    expect(within(tunnel).getByText('recon-scout')).toBeInTheDocument();

    expect(
      screen.getAllByRole('link', { name: 'Recon acme.com' })[0],
    ).toHaveAttribute('href', '/aistudio/conversations/c1');
  });

  it('explains what is captured when nothing is logged', async () => {
    await setup([{ data: [], nextCursor: null }]);

    expect(
      await screen.findByText('No HTTP requests logged yet.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/HTTPS requests show connection metadata only/),
    ).toBeInTheDocument();
  });

  it('opens the request details', async () => {
    const { user } = await setup([{ data: [GET_ROW], nextCursor: null }]);

    await user.click(
      await screen.findByRole('button', {
        name: 'http://api.acme.com:8080/v1/users?id=***',
      }),
    );

    const sheet = await screen.findByRole('dialog');
    expect(
      within(sheet).getByText('curl -s http://api.acme.com:8080/v1/users'),
    ).toBeInTheDocument();
    expect(within(sheet).getByText('Authorization')).toBeInTheDocument();
    expect(within(sheet).getByText('{"error":"not found"}')).toBeInTheDocument();
    expect(within(sheet).getByText('Truncated at 64 KiB')).toBeInTheDocument();
    expect(
      within(sheet).getByRole('link', { name: 'Open conversation' }),
    ).toHaveAttribute('href', '/aistudio/conversations/c1');
  });

  it('shows binary bodies by size until base64 is asked for', async () => {
    const { user } = await setup([{ data: [GET_ROW], nextCursor: null }], {}, {
      ...DETAIL,
      payload: {
        ...DETAIL.payload!,
        responseBody: 'AAEC',
        responseBodyEncoding: 'base64',
        responseBodyTruncated: false,
      },
    });

    await user.click(
      await screen.findByRole('button', {
        name: 'http://api.acme.com:8080/v1/users?id=***',
      }),
    );
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Binary (3 B)')).toBeInTheDocument();
    expect(within(sheet).queryByText('AAEC')).not.toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Show base64' }));
    expect(within(sheet).getByText('AAEC')).toBeInTheDocument();
  });

  it('notes that a tunnel has no headers or bodies', async () => {
    const { user } = await setup([{ data: [TUNNEL_ROW], nextCursor: null }], {}, {
      ...TUNNEL_ROW,
      command: 'curl https://secure.acme.com',
      messageId: null,
      payload: null,
    });

    await user.click(
      await screen.findByRole('button', { name: 'https://secure.acme.com' }),
    );

    const sheet = await screen.findByRole('dialog');
    expect(
      within(sheet).getByText(/only the connection metadata is recorded/),
    ).toBeInTheDocument();
    expect(within(sheet).queryByText('Request headers')).not.toBeInTheDocument();
  });

  it('loads the next page with the cursor', async () => {
    const { fetcher, user } = await setup([
      { data: [GET_ROW], nextCursor: 'cur-1' },
      { data: [TUNNEL_ROW], nextCursor: null },
    ]);

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(
      await screen.findByRole('button', { name: 'https://secure.acme.com' }),
    ).toBeInTheDocument();
    expect(fetcher).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cur-1', limit: 50 }),
      undefined,
      expect.anything(),
    );
    expect(
      screen.queryByRole('button', { name: 'Load more' }),
    ).not.toBeInTheDocument();
  });

  it('filters by conversation and errors, and clears the conversation', async () => {
    const { fetcher, onSearchChange, user } = await setup(
      [{ data: [GET_ROW], nextCursor: null }],
      { search: { conversationId: 'c1', errorsOnly: true } },
    );

    await screen.findByRole('button', {
      name: 'http://api.acme.com:8080/v1/users?id=***',
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'c1', errorsOnly: true }),
      undefined,
      expect.anything(),
    );

    await user.click(
      screen.getByRole('button', { name: 'Clear conversation filter' }),
    );
    expect(onSearchChange).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: undefined }),
    );

    await user.click(screen.getByRole('switch', { name: 'Errors only' }));
    expect(onSearchChange).toHaveBeenCalledWith(
      expect.objectContaining({ errorsOnly: undefined }),
    );
  });

  it('applies the host filter after typing stops', async () => {
    const { onSearchChange, user } = await setup([
      { data: [], nextCursor: null },
    ]);

    await user.type(
      await screen.findByRole('textbox', { name: 'Filter by host' }),
      'api.acme',
    );

    await waitFor(() =>
      expect(onSearchChange).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'api.acme' }),
      ),
    );
  });
});
