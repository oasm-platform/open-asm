import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import type { QueryClient } from '@tanstack/react-query';

export interface RouterContext {
  queryClient: QueryClient;
}

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  // Cache preloaded route loaders for 5 minutes so that hovering links in the
  // sidebar does not retrigger beforeLoad (which would refetch the session).
  defaultPreloadStaleTime: 5 * 60 * 1000,
  context: { queryClient: undefined! },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export { router };
