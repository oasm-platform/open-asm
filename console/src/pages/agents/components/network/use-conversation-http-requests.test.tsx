import {
  QueryClient,
  QueryClientProvider,
  type InfiniteData,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveEvent } from '@/hooks/use-live-events';
import type { AgentHttpRequestListResponseDto } from '@/services/apis/gen/queries';
import {
  conversationHttpRequestsKey,
  mergeHttpRequestsIntoCache,
  HTTP_REQUESTS_RECORDED,
  useConversationHttpRequests,
} from './use-conversation-http-requests';

const workspace = vi.hoisted(() => ({ id: 'ws-1' as string | null }));

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: workspace.id } }),
}));

const liveEvents = vi.hoisted(() => ({
  patterns: undefined as unknown,
  handler: undefined as ((event: LiveEvent) => void) | undefined,
  emit(event: LiveEvent) {
    this.handler?.(event);
  },
}));

vi.mock('@/hooks/use-live-events', () => ({
  useLiveEvents: (patterns: unknown, handler: (event: LiveEvent) => void) => {
    liveEvents.patterns = patterns;
    liveEvents.handler = handler;
  },
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
    workspace.id = 'ws-1';
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

  it('never polls; reloads once when a run ends', async () => {
    const fn = await fetcher();
    const { rerender } = renderHook(
      ({ running }) => useConversationHttpRequests('c1', { running }),
      { wrapper, initialProps: { running: true } },
    );
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fn).toHaveBeenCalledTimes(1);

    rerender({ running: false });
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  describe('live events', () => {
    const recorded = (resourceId: string, type = HTTP_REQUESTS_RECORDED) =>
      ({ id: `e-${resourceId}`, type, resourceType: 'conversation', resourceId });

    async function mounted(running = false) {
      const fn = await fetcher();
      const view = renderHook(
        ({ running }) => useConversationHttpRequests('c1', { running }),
        { wrapper, initialProps: { running } },
      );
      await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
      return { fn, ...view };
    }

    it('listens for the recorded event only', async () => {
      await mounted();
      expect(liveEvents.patterns).toEqual(HTTP_REQUESTS_RECORDED);
    });

    it('reloads on an event for this conversation, at most once a second', async () => {
      const { fn } = await mounted();

      act(() => liveEvents.emit(recorded('c1')));
      await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));

      act(() => {
        liveEvents.emit(recorded('c1'));
        liveEvents.emit(recorded('c1'));
      });
      await act(() => vi.advanceTimersByTimeAsync(500));
      expect(fn).toHaveBeenCalledTimes(2);

      // The burst inside the window still lands once, at its end.
      await act(() => vi.advanceTimersByTimeAsync(600));
      await waitFor(() => expect(fn).toHaveBeenCalledTimes(3));
      await act(() => vi.advanceTimersByTimeAsync(2_000));
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('drops a pending throttled reload on unmount', async () => {
      const { fn, unmount } = await mounted();
      act(() => liveEvents.emit(recorded('c1')));
      await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));

      const schedule = vi.spyOn(globalThis, 'setTimeout');
      const clear = vi.spyOn(globalThis, 'clearTimeout');
      act(() => liveEvents.emit(recorded('c1')));
      const timer = schedule.mock.results.at(-1)?.value as unknown;
      expect(timer).toBeDefined();

      unmount();

      expect(clear).toHaveBeenCalledWith(timer);
    });

    it('ignores other conversations and other event types', async () => {
      const { fn } = await mounted();
      act(() => {
        liveEvents.emit(recorded('c2'));
        liveEvents.emit(recorded('c1', 'worker.joined'));
      });
      await act(() => vi.advanceTimersByTimeAsync(2_000));
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('leaves it to the chat stream pushes while a run is active', async () => {
      const { fn } = await mounted(true);
      act(() => liveEvents.emit(recorded('c1')));
      await act(() => vi.advanceTimersByTimeAsync(2_000));
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  it('waits for a conversation id', async () => {
    const fn = await fetcher();
    renderHook(() => useConversationHttpRequests(undefined, { running: true }), {
      wrapper,
    });
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(fn).not.toHaveBeenCalled();
  });

  it('does not reload at the end of a run without a workspace', async () => {
    workspace.id = null;
    const fn = await fetcher();
    const { rerender } = renderHook(
      ({ running }) => useConversationHttpRequests('c1', { running }),
      { wrapper, initialProps: { running: true } },
    );
    rerender({ running: false });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('mergeHttpRequestsIntoCache', () => {
  type Data = InfiniteData<AgentHttpRequestListResponseDto, string | undefined>;
  const at = (id: string, second: number) =>
    ({
      id,
      sentAt: `2026-11-27T10:00:${String(second).padStart(2, '0')}.000Z`,
    }) as AgentHttpRequestListResponseDto['data'][number];
  const key = conversationHttpRequestsKey('ws-1', 'c1');

  function seed(pages: AgentHttpRequestListResponseDto[]) {
    const client = new QueryClient();
    client.setQueryData<Data>(key, {
      pages,
      pageParams: pages.map((_, i) => (i ? `cursor-${i}` : undefined)),
    });
    return client;
  }
  const ids = (client: QueryClient) =>
    client.getQueryData<Data>(key)!.pages.map((p) => p.data.map((r) => r.id));

  it('inserts new rows into the newest page, newest first, skipping known ids', () => {
    const client = seed([
      { data: [at('b', 20), at('a', 10)], nextCursor: 'cursor-1' },
      { data: [at('z', 5)], nextCursor: null },
    ]);

    mergeHttpRequestsIntoCache(client, 'ws-1', 'c1', {
      requests: [at('c', 30), at('b', 20), at('d', 40)],
    });

    expect(ids(client)).toEqual([['d', 'c', 'b', 'a'], ['z']]);
    expect(client.getQueryData<Data>(key)!.pages[0].nextCursor).toBe('cursor-1');
  });

  it('refetches instead when a row would sort past the newest page cursor', () => {
    const client = seed([
      { data: [at('b', 20), at('a', 10)], nextCursor: 'cursor-1' },
      { data: [at('z', 5)], nextCursor: null },
    ]);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    mergeHttpRequestsIntoCache(client, 'ws-1', 'c1', { requests: [at('late', 1)] });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
    expect(ids(client)).toEqual([['b', 'a'], ['z']]);
  });

  it('accepts an old row when the newest page is the only one', () => {
    const client = seed([{ data: [at('b', 20)], nextCursor: null }]);
    mergeHttpRequestsIntoCache(client, 'ws-1', 'c1', { requests: [at('late', 1)] });
    expect(ids(client)).toEqual([['b', 'late']]);
  });

  it('does nothing while the list has not loaded', () => {
    const client = new QueryClient();
    mergeHttpRequestsIntoCache(client, 'ws-1', 'c1', { requests: [at('a', 1)] });
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it('invalidates the list on a refetch push', () => {
    const client = seed([{ data: [], nextCursor: null }]);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    mergeHttpRequestsIntoCache(client, 'ws-1', 'c1', { refetch: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
  });
});
