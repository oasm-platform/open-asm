import { createRootRouteWithContext, Outlet, Link } from '@tanstack/react-router';
import type { RouterContext } from '@/router';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { usePermission } from '@/hooks/usePermission';

/**
 * Warm root queries so any direct navigation (e.g. /settings/mcp) already
 * has workspace + current-permission state.
 *
 * Implementation note on Rules of Hooks: both hooks below must be called
 * unconditionally on every render. Each one already short-circuits its own
 * network query via `enabled`/auth state, so no extra fetch happens on
 * login/public routes. Calling them unconditionally only seeds the shared
 * query cache used by `usePermission`/`useWorkspaceSelector` elsewhere —
 * it does not change behavior, it just guarantees direct-nav into /settings
 * gets the same state as navigating through /_authed.
 */
function useRootBootstrap() {
  // Always mounted so hooks below run unconditionally.
  // The hooks themselves no-op when not authed / no workspace selected.
  useWorkspaceSelector();
  usePermission();
}

function RootBootstrap() {
  useRootBootstrap();
  return null;
}

function RootComponent() {
  return (
    <>
      <RootBootstrap />
      <Outlet />
    </>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground mt-2">Page not found</p>
      <Link to="/" className="mt-4 text-blue-500 hover:underline">
        Go home
      </Link>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});
