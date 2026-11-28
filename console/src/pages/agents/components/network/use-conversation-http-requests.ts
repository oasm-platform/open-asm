import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  agentHttpRequestsControllerGetHttpRequests,
  type AgentHttpRequestListItemDto,
  type AgentHttpRequestListResponseDto,
} from '@/services/apis/gen/queries';
import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

/** The API's largest page */
export const NETWORK_PAGE_SIZE = 100;
/** New rows arrive over the chat stream; polling only covers a missed push. */
export const NETWORK_POLL_MS = 10_000;

export const conversationHttpRequestsKey = (
  workspaceId: string | null | undefined,
  conversationId: string | undefined,
) =>
  [
    '/api/agents/http-requests',
    'infinite',
    workspaceId,
    { conversationId, limit: NETWORK_PAGE_SIZE },
  ] as const;

/** A `data-http-requests-updated` chat stream part. */
export interface HttpRequestsPush {
  requests?: AgentHttpRequestListItemDto[];
  refetch?: boolean;
}

type HttpRequestsData = InfiniteData<
  AgentHttpRequestListResponseDto,
  string | undefined
>;

// Code-point order, not localeCompare: Postgres sorts uuid by bytes and the
// ISO timestamps share one format, so a locale collation could disagree.
const descending = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

/** The API's order: newest first by (sentAt, id). */
const newerFirst = (
  a: AgentHttpRequestListItemDto,
  b: AgentHttpRequestListItemDto,
) =>
  a.sentAt === b.sentAt
    ? descending(a.id, b.id)
    : descending(a.sentAt, b.sentAt);

/**
 * Adds pushed rows to the conversation's loaded list. They go into the
 * newest page in the API's order; a row that would sort past that page's
 * cursor belongs to an older page, so the list is refetched instead of
 * risking a duplicate on "load more".
 */
export function mergeHttpRequestsIntoCache(
  queryClient: QueryClient,
  workspaceId: string | null | undefined,
  conversationId: string,
  push: HttpRequestsPush,
) {
  const queryKey = conversationHttpRequestsKey(workspaceId, conversationId);
  const data = queryClient.getQueryData<HttpRequestsData>(queryKey);
  if (push.refetch) {
    void queryClient.invalidateQueries({ queryKey });
    return;
  }
  const [newest, ...older] = data?.pages ?? [];
  if (!newest || !push.requests?.length) return;

  const known = new Set(data!.pages.flatMap((p) => p.data.map((r) => r.id)));
  const fresh = push.requests.filter((r) => !known.has(r.id));
  if (!fresh.length) return;

  const last = newest.data[newest.data.length - 1];
  if (newest.nextCursor && last && fresh.some((r) => newerFirst(r, last) > 0)) {
    void queryClient.invalidateQueries({ queryKey });
    return;
  }
  queryClient.setQueryData<HttpRequestsData>(queryKey, {
    ...data!,
    pages: [
      { ...newest, data: [...fresh, ...newest.data].sort(newerFirst) },
      ...older,
    ],
  });
}

/**
 * The HTTP requests a conversation's agent shell commands made, oldest first
 * (the API pages newest first; "load more" brings older ones).
 *
 * New rows are pushed over the chat stream (`mergeHttpRequestsIntoCache`).
 * While a run is active and someone is looking (`watching`) it also polls
 * slowly in case a push was missed; it reloads when a run ends, which
 * catches requests the worker flushed late.
 */
export function useConversationHttpRequests(
  conversationId: string | undefined,
  { running, watching = true }: { running: boolean; watching?: boolean },
) {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const queryKey = conversationHttpRequestsKey(selectedWorkspaceId, conversationId);
  const params = queryKey[3];
  const enabled = !!selectedWorkspaceId && !!conversationId;

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      agentHttpRequestsControllerGetHttpRequests(
        { ...params, cursor: pageParam },
        undefined,
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    refetchInterval: running && watching ? NETWORK_POLL_MS : false,
    refetchIntervalInBackground: false,
  });

  const { refetch } = query;
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running && enabled) void refetch();
    wasRunning.current = running;
  }, [running, enabled, refetch]);

  const requests = useMemo<AgentHttpRequestListItemDto[]>(
    () => (query.data?.pages.flatMap((page) => page.data) ?? []).reverse(),
    [query.data],
  );

  return { ...query, requests };
}

export type ConversationHttpRequests = ReturnType<
  typeof useConversationHttpRequests
>;
