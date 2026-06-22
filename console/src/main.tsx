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
  useRootControllerGetMetadata,
} from './services/apis/gen/queries';
import './styles/index.css';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { handleServerError } from './lib/handle-server-error';
import { SESSION_QUERY_KEY, useSession } from './utils/authClient';

// Deduplicate 401 handling — multiple queries may fail at once during logout.
let isHandling401 = false;

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
      staleTime: 10 * 1000,
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
          if (isHandling401) return;
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
  const prevSessionRef = React.useRef(session);

  // Reset 401 guard immediately when a fresh session arrives (render phase)
  // to avoid race window where a query 401 fires before the effect runs.
  if (session && !prevSessionRef.current) {
    isHandling401 = false;
  }

  useEffect(() => {
    const prevSession = prevSessionRef.current;
    prevSessionRef.current = session;

    // Session just became null (e.g. logout) — navigate directly to
    // /login instead of letting _authed re-render and flash through
    // /workspaces/create first.
    if (prevSession && !session) {
      const currentPath = router.history.location.pathname;
      if (currentPath !== '/login') {
        router.navigate({
          to: '/login',
          search: { redirect: router.history.location.href },
        });
      }
      return;
    }

    router.invalidate();
  }, [session]);

  // Wait for session to load before rendering the router.
  if (isPending) {
    return <LoadingScreen />;
  }

  return (
    <RouterProvider
      router={router}
      context={{ queryClient, session: session ?? null }}
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
