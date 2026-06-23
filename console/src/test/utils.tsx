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
    routePath?: string;
  } = {}
) {
  const {
    queryClient = createTestQueryClient(),
    routePath = '/',
  } = options;

  const initialEntries = options.initialEntries ?? [routePath];

  const rootRoute = createRootRoute();

  // Create a test route that renders the component under test
  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: routePath,
    component: () => <div data-testid="test-wrapper">{ui}</div>,
  });

  // Create a catch-all splat route for non-matching paths (e.g. nested routes)
  const splatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
    component: () => <div data-testid="test-wrapper">{ui}</div>,
  });

  const routeTree = rootRoute.addChildren([testRoute, splatRoute]);
  const history = createMemoryHistory({ initialEntries });
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient, session: null },
    defaultPendingMinMs: 0,
    defaultPreloadStaleTime: 0,
  });

  // Pre-load the router to resolve route matching
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  router.load();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="system" storageKey="theme">
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
