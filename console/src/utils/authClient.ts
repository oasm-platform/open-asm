import { createAuthClient } from 'better-auth/react';
import { adminClient } from 'better-auth/client/plugins';
import type { User as BetterAuthUser } from 'better-auth';

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

/**
 * Re-reads the session into better-auth's store, the only session the app
 * reads (`useSession` and the router context). Resolves once the store holds
 * the server's answer.
 */
export const refetchSession = (): Promise<void> =>
  (
    authClient.$store.atoms.session.get() as { refetch: () => Promise<void> }
  ).refetch();

export type User = BetterAuthUser & {
  role: string;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
};

// True while a voluntary logout is in flight. Used to skip the session-expiry
// toast/redirect and the login redirect param that would otherwise land the
// user on a stale path (e.g. /workspaces/create) after re-login.
export let isVoluntaryLogout = false;
export const markVoluntaryLogout = () => {
  isVoluntaryLogout = true;
};
export const resetVoluntaryLogout = () => {
  isVoluntaryLogout = false;
};
