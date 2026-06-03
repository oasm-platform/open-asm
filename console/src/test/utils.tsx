import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from '@tanstack/react-router';
import { ThemeProvider } from '@/components/ui/theme-provider';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: {
    initialEntries?: string[];
    queryClient?: QueryClient;
  } = {}
) {
  const {
    initialEntries = ['/'],
    queryClient = createTestQueryClient(),
  } = options;

  const rootRoute = createRootRoute();

  // Create a test index route that renders the component under test
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="test-wrapper">{ui}</div>,
  });

  // Create a catch-all splat route for non-root paths
  const splatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
    component: () => <div data-testid="test-wrapper">{ui}</div>,
  });

  const routeTree = rootRoute.addChildren([indexRoute, splatRoute]);
  const history = createMemoryHistory({ initialEntries });
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultPendingMinMs: 0,
    defaultPreloadStaleTime: 0,
  });

  // Pre-load the router to resolve route matching
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  router.load();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark" storageKey="theme">
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: Wrapper }),
    queryClient,
    router,
  };
}

export { screen, waitFor } from '@testing-library/react';
