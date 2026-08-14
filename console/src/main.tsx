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
import { LoadingScreen } from '@/components/ui/loading-screen';
import { TooltipProvider } from './components/ui/tooltip';
import { router } from './router';
import {
  getRootControllerGetMetadataQueryKey,
  getWorkspacesControllerGetWorkspacesQueryOptions,
  useRootControllerGetMetadata,
} from './services/apis/gen/queries';
import './styles/index.css';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { handleServerError } from './lib/handle-server-error';
import {
  SESSION_QUERY_KEY,
  useSession,
  type User,
  isVoluntaryLogout,
  resetVoluntaryLogout,
} from './utils/authClient';

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

          toast.error('Session expired!');
          queryClient.removeQueries({ queryKey: SESSION_QUERY_KEY });
          const redirect = `${router.history.location.href}`;
          router.navigate({ to: '/login', search: { redirect } });
        }
      }
    },
  }),
});

const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'rq-persist',
});

persistQueryClient({
  queryClient,
  persister: localStoragePersister,
  maxAge: 1000 * 60 * 5,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      if (query.state.status === 'pending') return false;
      const queryKey = JSON.stringify(query.queryKey);
      const sessionKey = JSON.stringify(SESSION_QUERY_KEY);
      return queryKey !== sessionKey;
    },
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
      // redirect to '/' doesn't stall on a full-screen LoadingScreen.
      queryClient.prefetchQuery(
        getWorkspacesControllerGetWorkspacesQueryOptions({
          limit: 100,
          page: 1,
          isArchived: false,
        }),
      );
    }

    // Invalidate on any session state change (null→valid, valid→valid).
    // This re-evaluates route guards so _authed.beforeLoad sees the
    // current session and login.tsx:beforeLoad redirects away from /login.
    router.invalidate();
  }, [session]);

  // Wait for session to load before rendering the router.
  if (isPending) {
    return <LoadingScreen />;
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

// Hand off from the index.html inline splash to React's LoadingScreen
// (same logo+spinner layout → seamless fade).
const bootSplash = document.getElementById('boot-splash');
if (bootSplash) {
  bootSplash.classList.add('hide');
  bootSplash.addEventListener('transitionend', () => bootSplash.remove(), { once: true });
  setTimeout(() => bootSplash.remove(), 500);
}

root.render(<App />);
