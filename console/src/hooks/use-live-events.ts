import { useEffect, useRef } from 'react';
import { useWorkspaceState } from './useWorkspaceSelector';

/**
 * One message of `GET /api/events/stream`. It only points at what changed —
 * refetch through the REST endpoints to get the data.
 */
export interface LiveEvent {
  id: string;
  /** Event name, e.g. `worker.joined`, `notification.created`. */
  type: string;
  time?: string;
  resourceType?: string;
  resourceId?: string;
}

/** An exact name (`worker.joined`) or a whole domain (`worker.*`). */
export type LiveEventPattern = string;

type Handler = (event: LiveEvent) => void;

interface Listener {
  patterns: readonly LiveEventPattern[];
  handler: Handler;
}

const STREAM_URL = '/api/events/stream';
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;

export function matchesLiveEvent(
  pattern: LiveEventPattern,
  type: string,
): boolean {
  return pattern.endsWith('.*')
    ? type.startsWith(pattern.slice(0, -1))
    : type === pattern;
}

/**
 * The single shared connection. Every `useLiveEvents` call registers here, so
 * the app holds one stream however many components listen.
 *
 * `fetch` rather than `EventSource`: EventSource cannot send headers, so the
 * server would have to fall back to the `wid` cookie — which every tab shares,
 * letting a reconnect follow the workspace another tab selected. The header
 * pins the stream to THIS tab's workspace. Without one the server still
 * streams the user's notifications.
 */
const listeners = new Set<Listener>();
let connection: AbortController | null = null;
let connectedWorkspace: string | null = null;

function dispatch(data: string) {
  let event: LiveEvent;
  try {
    event = JSON.parse(data) as LiveEvent;
  } catch {
    return;
  }
  for (const { patterns, handler } of listeners) {
    if (!patterns.some((pattern) => matchesLiveEvent(pattern, event.type))) {
      continue;
    }
    // One failing handler must not starve the listeners after it.
    try {
      handler(event);
    } catch (error) {
      console.error('Live event handler failed', error);
    }
  }
}

/** Splits an SSE body into messages; only unnamed events carry data. */
async function readEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      let name = 'message';
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      // Named events (the `ping` heartbeat) are not data.
      if (name === 'message' && data.length > 0) dispatch(data.join('\n'));
    }
  }
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Keeps the stream open until aborted, reconnecting with backoff. */
async function run(workspaceId: string | null, signal: AbortSignal) {
  let retryDelay = RETRY_MIN_MS;
  while (!signal.aborted) {
    try {
      const response = await fetch(STREAM_URL, {
        headers: {
          Accept: 'text/event-stream',
          ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
        },
        credentials: 'include',
        signal,
      });
      if (response.ok && response.body) {
        retryDelay = RETRY_MIN_MS;
        await readEvents(response.body);
      }
    } catch {
      // Network drop or abort; the loop condition tells them apart.
    }
    if (signal.aborted) return;
    await wait(retryDelay, signal);
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
  }
}

function disconnect() {
  connection?.abort();
  connection = null;
  connectedWorkspace = null;
}

function connect(workspaceId: string | null) {
  if (connection && connectedWorkspace === workspaceId) return;
  disconnect();
  const controller = new AbortController();
  connection = controller;
  connectedWorkspace = workspaceId;
  void run(workspaceId, controller.signal);
}

/**
 * Calls `handler` for every live event matching `patterns`, e.g.
 *
 *   useLiveEvents(['worker.*', 'target.created'], () => refetch());
 *
 * Only events the server allowlists (`core-api/src/modules/events/client-events.ts`)
 * ever arrive; workspace events only once a workspace is selected.
 * `handler` may change between renders without reconnecting.
 */
export function useLiveEvents(
  patterns: LiveEventPattern | readonly LiveEventPattern[],
  handler: Handler,
) {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const workspaceId = selectedWorkspaceId || null;

  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const key = (Array.isArray(patterns) ? patterns : [patterns]).join('|');

  useEffect(() => {
    const listener: Listener = {
      patterns: key.split('|'),
      handler: (event) => handlerRef.current(event),
    };
    listeners.add(listener);
    connect(workspaceId);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) disconnect();
    };
  }, [key, workspaceId]);
}
