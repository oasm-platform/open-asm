import { createRootRouteWithContext, Outlet, Link } from '@tanstack/react-router';
import type { RouterContext } from '@/router';
import { useWorkspaceSync } from '@/hooks/useWorkspaceSelector';
import { usePermission } from '@/hooks/usePermission';
import { OpenLinkDialog } from '@/components/ui/open-link';

/**
 * Selects the workspace and warms its permissions for every route, so direct
 * navigation (e.g. /settings/mcp) gets the same state as going through
 * /_authed. Both hooks no-op while signed out or before a workspace exists.
 * This is the only place the selection is resolved.
 */
function useRootBootstrap() {
  useWorkspaceSync();
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
      <OpenLinkDialog />
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
