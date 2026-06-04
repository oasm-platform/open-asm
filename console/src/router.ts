import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import type { QueryClient } from '@tanstack/react-query';

export interface RouterContext {
  queryClient: QueryClient;
}

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  context: { queryClient: undefined! },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export { router };
