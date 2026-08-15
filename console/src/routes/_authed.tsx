import { createFileRoute, Navigate, Outlet, redirect, useLocation } from '@tanstack/react-router';
import { useEffect } from 'react';
import ProtectedLayout from '@/components/common/layout/protect-layout';
import { removeBootSplash } from '@/lib/boot-splash';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useSession } from '@/utils/authClient';

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  // Read session directly from React Query cache so we always have the
  // live value — useRouteContext is stale because beforeLoad does not
  // re-run when queryClient.clear() wipes the session.
  const { data: liveSession } = useSession();
  const { workspaces, isLoading: isWorkspaceLoading } = useWorkspaceSelector();
  const { pathname } = useLocation();

  // The HTML #boot-splash covers the screen until the workspace load
  // finishes — remove it as soon as the layout is ready to render.
  const isReady = !isWorkspaceLoading && !!liveSession;
  useEffect(() => {
    if (isReady) removeBootSplash();
  }, [isReady]);

  if (isWorkspaceLoading || !liveSession) return null;

  const isWorkspacesRoute = pathname.startsWith('/workspaces');
  if (!isWorkspacesRoute && (!workspaces || workspaces.length === 0)) {
    return <Navigate to="/workspaces/create" replace />;
  }

  return (
    <ProtectedLayout>
      <Outlet />
    </ProtectedLayout>
  );
}
