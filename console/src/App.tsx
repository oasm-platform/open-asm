import { Toaster } from '@/components/ui/sonner';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './components/ui/theme-provider';

import { router } from './routers';

// Import React for useEffect
import React from 'react';

// Import hook for metadata
import {
  getRootControllerGetMetadataQueryKey,
  useRootControllerGetMetadata,
} from './services/apis/gen/queries';

// Hook to update document title based on metadata
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

// MetadataProvider component
function MetadataProvider({ children }: { children: React.ReactNode }) {
  useMetadataTitle();

  return <>{children}</>;
}

const queryClient = new QueryClient({
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MetadataProvider>
        <ThemeProvider defaultTheme="dark" storageKey="theme">
          <RouterProvider router={router} />
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </MetadataProvider>
    </QueryClientProvider>
  );
}

export default App;
