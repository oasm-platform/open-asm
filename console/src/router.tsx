import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import type { QueryClient } from '@tanstack/react-query';
import { LoadingScreen } from '@/components/ui/loading-screen';
import Logo from '@/components/ui/logo';
import type { User } from '@/utils/authClient';

export interface RouterContext {
  queryClient: QueryClient;
  session: User | null;
}

function DefaultErrorComponent({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <Logo width={64} height={64} />
      <div className="text-destructive text-center text-sm">
        {error.message || 'Something went wrong. Please try again.'}
      </div>
    </div>
  );
}

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 5 * 60 * 1000,
  defaultPendingComponent: LoadingScreen,
  defaultErrorComponent: DefaultErrorComponent,
  context: { queryClient: undefined!, session: null },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export { router };
