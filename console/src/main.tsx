import { RouteProgress } from '@/components/common/route-progress';
import { Toaster } from '@/components/ui/sonner';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { RouterProvider } from '@tanstack/react-router';
import React, { StrictMode, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './components/ui/theme-provider';
import { TooltipProvider } from './components/ui/tooltip';
import { router } from './router';
import {
  getRootControllerGetMetadataQueryKey,
  useRootControllerGetMetadata,
} from './services/apis/gen/queries';
import './styles/index.css';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { handleServerError } from './lib/handle-server-error';
import { removeBootSplash } from '@/lib/boot-splash';
import { getWorkspaceListQueryOptions } from './hooks/useWorkspaceSelector';
import {
  refetchSession,
  useSession,
  type User,
  isVoluntaryLogout,
  resetVoluntaryLogout,
} from './utils/authClient';
import {
  hashWorkspaceQueryKey,
  setGlobalWorkspaceId,
} from './utils/workspaceState';

// Deduplicate 401 handling — multiple queries may fail at once during logout.
let isHandling401 = false;
// Guard: skip 401 redirect until the first session fetch completes.
// Prevents restored queries (from persistQueryClient) from triggering a
// navigate to /login before the session is established.
let sessionLoaded = false;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (import.meta.env.DEV) console.log({ failureCount, error });
        if (failureCount >= 0 && import.meta.env.DEV) return false;
        if (failureCount > 3 && import.meta.env.PROD) return false;
        return !(
          error instanceof AxiosError &&
          [401, 403].includes(error.response?.status ?? 0)
        );
      },
      refetchOnWindowFocus: import.meta.env.PROD,
      queryKeyHashFn: hashWorkspaceQueryKey,
    },
    mutations: {
      onError: (error) => {
        handleServerError(error);
        if (error instanceof AxiosError) {
          if (error.response?.status === 304) {
            toast.error('Content not modified!');
          }
        }
      },
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof AxiosError) {
        if (error.response?.status === 401) {
          if (isHandling401 || !sessionLoaded || isVoluntaryLogout) return;
          isHandling401 = true;

          // Navigating to /login here does nothing while better-auth's store
          // still holds the session: login.tsx:beforeLoad sees it in the
          // router context and bounces straight back. Re-check the session
          // instead; once the store drops it, AppRouter's effect shows the
          // toast and navigates. isHandling401 stays set until a new session
          // arrives, so a 401 the session survives is re-checked only once.
          void refetchSession();
        }
      }
    },
  }),
});

const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'rq-persist',
});

// Only what the shell renders before its first fetch. Workspace data (assets,
// findings, members...) never lands in localStorage.
const PERSISTED_QUERY_ROOTS = new Set([
  'global',
  '/api/metadata',
  '/api/workspaces',
  '/api/workspaces/current-permission',
]);

persistQueryClient({
  queryClient,
  persister: localStoragePersister,
  maxAge: 1000 * 60 * 5,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' &&
      PERSISTED_QUERY_ROOTS.has(String(query.queryKey[0])),
  },
});

function useMetadataTitle() {
  const { data: metadata } = useRootControllerGetMetadata({
    query: { queryKey: getRootControllerGetMetadataQueryKey() },
  });
  useEffect(() => {
    if (metadata?.name) document.title = metadata.name;
  }, [metadata]);
}

function MetadataProvider({ children }: { children: React.ReactNode }) {
  useMetadataTitle();
  return <>{children}</>;
}

function AppRouter() {
  const { data: session, isPending } = useSession();
  // Init to undefined (not session) so the first effect run is detectable:
  // on first render session is null, which would be indistinguishable from
  // a later null state. The very first run must be skipped (see effect below).
  const prevSessionRef = React.useRef<typeof session | undefined>(undefined);

  // Reset 401 guard immediately when a fresh session arrives (render phase)
  // to avoid race window where a query 401 fires before the effect runs.
  if (session && !prevSessionRef.current) {
    isHandling401 = false;
    resetVoluntaryLogout();
  }

  useEffect(() => {
    const prevSession = prevSessionRef.current;
    prevSessionRef.current = session;

    // RouterProvider has not mounted yet on the first run — the router
    // singleton still holds context.session = null (router.tsx default).
    // invalidate()/navigate() now would load the current URL as an authed
    // route and redirect to /login (the reload flash). The initial route
    // load already runs with the real session passed via RouterProvider's
    // context prop.
    if (prevSession === undefined) return;

    // Session just became null (e.g. logout) — navigate directly to
    // /login instead of letting _authed re-render and flash through
    // /workspaces/create first.
    if (prevSession && !session) {
      if (!isVoluntaryLogout) toast.error('Session expired!');
      const currentPath = router.history.location.pathname;
      if (currentPath !== '/login') {
        router.navigate({
          to: '/login',
          ...(isVoluntaryLogout
            ? {}
            : { search: { redirect: router.history.location.href } }),
        });
      }
      return;
    }

    // Fresh session (e.g. login) — start loading the authed chunks in
    // parallel with the session propagation that redirects to '/'.
    if (session && !prevSession) {
      router.preloadRoute({ to: '/' }).catch(() => {});
      // Warm the workspaces query the _authed layout blocks on, so the
      // redirect to '/' doesn't stall behind the boot splash.
      void queryClient.prefetchQuery(getWorkspaceListQueryOptions());
    }

    // Invalidate on any session state change (null→valid, valid→valid).
    // This re-evaluates route guards so _authed.beforeLoad sees the
    // current session and login.tsx:beforeLoad redirects away from /login.
    router.invalidate();
  }, [session]);

  // Signed out, nothing cached may survive: not another user's cache restored
  // on boot, not this user's after a logout or an expired session. The authed
  // layouts render nothing without a session, so no query refetches here.
  useEffect(() => {
    if (isPending || session) return;
    queryClient.clear();
    setGlobalWorkspaceId(null);
  }, [isPending, session]);

  // The HTML #boot-splash covers the screen until the app is ready:
  // - no session → login/init-admin render immediately → remove it now
  // - session → the _authed layout removes it when its workspace load
  //   finishes; this timeout is a fallback for non-_authed routes
  //   (e.g. /settings) so the splash can never get stuck.
  useEffect(() => {
    if (isPending) return;
    if (!session) {
      removeBootSplash();
      return;
    }
    const timeout = setTimeout(removeBootSplash, 800);
    return () => clearTimeout(timeout);
  }, [isPending, session]);

  // Wait for session to load before rendering the router. The HTML
  // #boot-splash covers the screen while we wait — nothing renders
  // underneath until the session resolves.
  if (isPending) {
    return null;
  }

  // Mark session as loaded so QueryCache.onError can safely redirect on 401.
  sessionLoaded = true;

  return (
    <RouterProvider
      router={router}
      context={{ queryClient, session: (session?.user as User | null) ?? null }}
    />
  );
}

function App() {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MetadataProvider>
          <ThemeProvider defaultTheme="system" storageKey="theme">
            <TooltipProvider>
              <AppRouter />
              <Toaster position="bottom-center" />
              <RouteProgress />
            </TooltipProvider>
          </ThemeProvider>
        </MetadataProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}

const rootElement = document.getElementById('root')!;
const root = ReactDOM.createRoot(rootElement);

root.render(<App />);
