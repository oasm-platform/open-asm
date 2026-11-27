import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NETWORK_POLL_MS,
  useConversationHttpRequests,
} from './use-conversation-http-requests';

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'ws-1' } }),
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  agentHttpRequestsControllerGetHttpRequests: vi.fn(),
}));

const row = (id: string) => ({ id, sentAt: '2026-11-27T10:00:00.000Z' });

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function fetcher() {
  const queries = await import('@/services/apis/gen/queries');
  const fn = vi.mocked(queries.agentHttpRequestsControllerGetHttpRequests);
  fn.mockResolvedValue({
    data: [row('new'), row('old')],
    nextCursor: null,
  } as never);
  return fn;
}

describe('useConversationHttpRequests', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("asks for the conversation's requests and lists them oldest first", async () => {
    const fn = await fetcher();
    const { result } = renderHook(
      () => useConversationHttpRequests('c1', { running: false }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.requests.map((r) => r.id)).toEqual(['old', 'new']),
    );
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'c1', limit: 100 }),
      undefined,
      expect.anything(),
    );
  });

  it('polls while a run is active and watched', async () => {
    const fn = await fetcher();
    renderHook(() => useConversationHttpRequests('c1', { running: true }), {
      wrapper,
    });
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));

    await act(() => vi.advanceTimersByTimeAsync(NETWORK_POLL_MS * 2 + 100));
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('does not poll when idle or unwatched, but reloads once a run ends', async () => {
    const fn = await fetcher();
    const { rerender } = renderHook(
      ({ running, watching }) =>
        useConversationHttpRequests('c1', { running, watching }),
      { wrapper, initialProps: { running: true, watching: false } },
    );
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));

    await act(() => vi.advanceTimersByTimeAsync(NETWORK_POLL_MS * 3));
    expect(fn).toHaveBeenCalledTimes(1);

    rerender({ running: false, watching: false });
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    await act(() => vi.advanceTimersByTimeAsync(NETWORK_POLL_MS * 3));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('waits for a conversation id', async () => {
    const fn = await fetcher();
    renderHook(() => useConversationHttpRequests(undefined, { running: true }), {
      wrapper,
    });
    await act(() => vi.advanceTimersByTimeAsync(NETWORK_POLL_MS * 2));
    expect(fn).not.toHaveBeenCalled();
  });
});
