import { RouterProvider } from '@tanstack/react-router';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import React, { StrictMode } from 'react';
import {
  getRootControllerGetMetadataQueryKey,
  useRootControllerGetMetadata,
} from './services/apis/gen/queries';
import { router } from './router';
import { ThemeProvider } from './components/ui/theme-provider';
import { TooltipProvider } from './components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import ReactDOM from 'react-dom/client';
// Styles
import './styles/index.css';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: false,
      refetchIntervalInBackground: false,
      retry: false,
    },
  },
});

const localStoragePersister = createAsyncStoragePersister({
  storage: window.localStorage,
  key: 'rq-persist',
});

persistQueryClient({
  queryClient,
  persister: localStoragePersister,
  maxAge: 1000 * 60 * 24,
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
              {import.meta.env.DEV && (
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
              )}
            </TooltipProvider>
          </ThemeProvider>
        </MetadataProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
