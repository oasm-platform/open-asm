import { createAuthClient } from 'better-auth/react';
import { adminClient } from 'better-auth/client/plugins';
import type { User as BetterAuthUser } from 'better-auth';
import { queryOptions, type QueryClient } from '@tanstack/react-query';

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [adminClient()],
  fetchOptions: {},
  // sessionOptions is supported at runtime by better-auth's session refresh
  // manager (see node_modules/better-auth/dist/client/session-refresh.mjs) but
  // is not exposed in the public typings, so we cast through unknown to keep
  // the rest of the client's inferred types intact (plugins, actions, etc.).
  ...({
    sessionOptions: {
      refetchOnWindowFocus: false,
      refetchInterval: 0,
    },
  } as unknown as Record<string, never>),
});

export const { useSession } = authClient;

export const SESSION_QUERY_KEY = ['auth', 'session'] as const;

export const sessionQueryOptions = queryOptions({
  queryKey: SESSION_QUERY_KEY,
  queryFn: async () => {
    const res = await authClient.getSession();
    if (res.error) throw res.error;
    return res.data ?? null;
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
  retry: false,
});

export const invalidateSession = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });

export type User = BetterAuthUser & {
  role: string;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
};
