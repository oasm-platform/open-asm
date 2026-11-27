import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  agentHttpRequestsControllerGetHttpRequests,
  type AgentHttpRequestListItemDto,
} from '@/services/apis/gen/queries';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

/** The API's largest page */
export const NETWORK_PAGE_SIZE = 100;
export const NETWORK_POLL_MS = 2_000;

/**
 * The HTTP requests a conversation's agent shell commands made, oldest first
 * (the API pages newest first; "load more" brings older ones).
 *
 * There is no push channel for new rows, so it polls, but only while a run
 * is active and someone is looking (`watching`); otherwise it loads once and
 * again when a run ends, which catches requests the worker flushed late.
 */
export function useConversationHttpRequests(
  conversationId: string | undefined,
  { running, watching = true }: { running: boolean; watching?: boolean },
) {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const params = { conversationId, limit: NETWORK_PAGE_SIZE };

  const query = useInfiniteQuery({
    queryKey: [
      '/api/agents/http-requests',
      'infinite',
      selectedWorkspaceId,
      params,
    ],
    queryFn: ({ pageParam, signal }) =>
      agentHttpRequestsControllerGetHttpRequests(
        { ...params, cursor: pageParam },
        undefined,
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!selectedWorkspaceId && !!conversationId,
    refetchInterval: running && watching ? NETWORK_POLL_MS : false,
    refetchIntervalInBackground: false,
  });

  const { refetch } = query;
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running && conversationId) void refetch();
    wasRunning.current = running;
  }, [running, conversationId, refetch]);

  const requests = useMemo<AgentHttpRequestListItemDto[]>(
    () => (query.data?.pages.flatMap((page) => page.data) ?? []).reverse(),
    [query.data],
  );

  return { ...query, requests };
}

export type ConversationHttpRequests = ReturnType<
  typeof useConversationHttpRequests
>;
