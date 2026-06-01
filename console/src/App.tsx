import { RouterProvider } from '@tanstack/react-router';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import React from 'react';
import {
  getRootControllerGetMetadataQueryKey,
  useRootControllerGetMetadata,
} from './services/apis/gen/queries';
import { router } from './router';
import { ThemeProvider } from './components/ui/theme-provider';
import { TooltipProvider } from './components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MetadataProvider>
        <ThemeProvider defaultTheme="dark" storageKey="theme">
          <TooltipProvider>
            <RouterProvider router={router} context={{ queryClient }} />
            <Toaster position="bottom-center" />
          </TooltipProvider>
        </ThemeProvider>
      </MetadataProvider>
    </QueryClientProvider>
  );
}

export default App;
