import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { matchesLiveEvent, useLiveEvents } from '@/hooks/use-live-events';

const workspace = { selectedWorkspaceId: 'ws-1' };
vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: workspace }),
}));

interface FakeStream {
  headers: Record<string, string>;
  signal: AbortSignal;
  push: (chunk: string) => void;
}

let streams: FakeStream[] = [];

function fakeFetch(_url: string, init: RequestInit) {
  const encoder = new TextEncoder();
  let push: FakeStream['push'] = () => undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (chunk) => controller.enqueue(encoder.encode(chunk));
      init.signal?.addEventListener('abort', () =>
        controller.error(new DOMException('aborted', 'AbortError')),
      );
    },
  });
  streams.push({
    headers: init.headers as Record<string, string>,
    signal: init.signal as AbortSignal,
    push: (chunk) => push(chunk),
  });
  return Promise.resolve({ ok: true, body } as Response);
}

const message = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

describe('matchesLiveEvent', () => {
  it('matches exact names and whole domains only', () => {
    expect(matchesLiveEvent('worker.*', 'worker.joined')).toBe(true);
    expect(matchesLiveEvent('worker.joined', 'worker.joined')).toBe(true);
    expect(matchesLiveEvent('worker.*', 'workers.joined')).toBe(false);
    expect(matchesLiveEvent('worker.joined', 'worker.timed_out')).toBe(false);
  });
});

describe('useLiveEvents', () => {
  beforeEach(() => {
    streams = [];
    workspace.selectedWorkspaceId = 'ws-1';
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares one connection, pinned to the tab\'s workspace header', async () => {
    const onWorker = vi.fn();
    const onNotification = vi.fn();
    const a = renderHook(() => useLiveEvents('worker.*', onWorker));
    const b = renderHook(() =>
      useLiveEvents(['notification.*'], onNotification),
    );

    await waitFor(() => expect(streams).toHaveLength(1));
    const [stream] = streams;
    expect(fetch).toHaveBeenCalledWith('/api/events/stream', expect.anything());
    expect(stream.headers['X-Workspace-Id']).toBe('ws-1');

    stream.push('event: ping\ndata: \n\n');
    stream.push(message({ id: '1', type: 'worker.joined' }));
    stream.push(message({ id: '2', type: 'notification.created' }).slice(0, 10));
    stream.push(message({ id: '2', type: 'notification.created' }).slice(10));

    await waitFor(() => expect(onNotification).toHaveBeenCalled());
    expect(onWorker).toHaveBeenCalledExactlyOnceWith({
      id: '1',
      type: 'worker.joined',
    });
    expect(onNotification).toHaveBeenCalledExactlyOnceWith({
      id: '2',
      type: 'notification.created',
    });

    a.unmount();
    expect(stream.signal.aborted).toBe(false);
    b.unmount();
    expect(stream.signal.aborted).toBe(true);
  });

  it('keeps delivering when one handler throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    const a = renderHook(() =>
      useLiveEvents('worker.*', () => {
        throw new Error('boom');
      }),
    );
    const b = renderHook(() => useLiveEvents('worker.*', after));

    await waitFor(() => expect(streams).toHaveLength(1));
    streams[0].push(message({ id: '1', type: 'worker.joined' }));

    await waitFor(() => expect(after).toHaveBeenCalledOnce());
    a.unmount();
    b.unmount();
    consoleError.mockRestore();
  });

  it('reconnects when the workspace changes', async () => {
    const { rerender, unmount } = renderHook(() =>
      useLiveEvents('worker.*', vi.fn()),
    );
    await waitFor(() => expect(streams).toHaveLength(1));

    workspace.selectedWorkspaceId = 'ws-2';
    rerender();

    await waitFor(() => expect(streams).toHaveLength(2));
    expect(streams[0].signal.aborted).toBe(true);
    expect(streams[1].headers['X-Workspace-Id']).toBe('ws-2');
    unmount();
  });

  it('streams notifications without a workspace', async () => {
    workspace.selectedWorkspaceId = '';
    const { unmount } = renderHook(() =>
      useLiveEvents('notification.*', vi.fn()),
    );

    await waitFor(() => expect(streams).toHaveLength(1));
    expect(streams[0].headers['X-Workspace-Id']).toBeUndefined();
    unmount();
  });
});
