import { Toaster } from '@/components/ui/sonner';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { RouterProvider } from '@tanstack/react-router';
import React, { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './components/ui/theme-provider';
import { TooltipProvider } from './components/ui/tooltip';
import { router } from './router';
import {
  getRootControllerGetMetadataQueryKey,
  useRootControllerGetMetadata,
} from './services/apis/gen/queries';
// Styles
import './styles/index.css';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { handleServerError } from './lib/handle-server-error';
import { SESSION_QUERY_KEY } from './utils/authClient';

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
      staleTime: 10 * 1000, // 10s
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
          toast.error('Session expired!');
          queryClient.removeQueries({ queryKey: SESSION_QUERY_KEY });
          const currentPath = router.history.location.pathname;

          if (currentPath !== '/login') {
            toast.error('Session expired!');
            const redirect = `${router.history.location.href}`;
            router.navigate({ to: '/login', search: { redirect } });
          }
        }
        // if (error.response?.status === 500) {
        //   toast.error('Internal Server Error!');
        //   // Only navigate to error page in production to avoid disrupting HMR in development
        //   if (import.meta.env.PROD) {
        //     router.navigate({ to: '/500' });
        //   }
        // }
        // if (error.response?.status === 403) {
        //   if (import.meta.env.PROD) {
        //     router.navigate({ to: '/403' });
        //   }
        // }
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
      const queryKey = JSON.stringify(query.queryKey);
      const sessionKey = JSON.stringify(SESSION_QUERY_KEY);
      return queryKey !== sessionKey;
    },
  },
});

function useMetadataTitle() {
  const { data: metadata } = useRootControllerGetMetadata({
    query: {
      queryKey: getRootControllerGetMetadataQueryKey(),
    },
  });

  React.useEffect(() => {
    if (metadata?.name) {
      document.title = metadata.name;
    }
  }, [metadata]);
}

function MetadataProvider({ children }: { children: React.ReactNode }) {
  useMetadataTitle();

  return <>{children}</>;
}

const rootElement = document.getElementById('root')!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MetadataProvider>
          <ThemeProvider defaultTheme="dark" storageKey="theme">
            <TooltipProvider>
              <RouterProvider router={router} context={{ queryClient }} />
              <Toaster position="bottom-center" />
              {/* {import.meta.env.DEV && (
                <TanStackDevtools
                  plugins={[
                    {
                      name: 'TanStack Query',
                      render: <ReactQueryDevtoolsPanel client={queryClient} />,
                    },
                    {
                      name: 'TanStack Router',
                      render: <TanStackRouterDevtoolsPanel router={router} />,
                    },
                  ]}
                />
              )} */}
            </TooltipProvider>
          </ThemeProvider>
        </MetadataProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
