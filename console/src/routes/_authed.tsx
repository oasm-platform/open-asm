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
  // Read the live session: useRouteContext is stale because beforeLoad does
  // not re-run when the session ends.
  const { data: liveSession } = useSession();
  const {
    workspaces,
    isLoading: isWorkspaceLoading,
    selectedWorkspace,
  } = useWorkspaceSelector();
  const { pathname } = useLocation();
  // The root picks a workspace in an effect, one render after the list
  // arrives (right after login nothing is selected yet). Mounting the layout
  // before that starts workspace-scoped work, like the live event stream,
  // without a workspace and restarts it a moment later.
  const isSelectingWorkspace = workspaces.length > 0 && !selectedWorkspace;

  // The HTML #boot-splash covers the screen until the workspace load
  // finishes — remove it as soon as the layout is ready to render.
  const isReady = !isWorkspaceLoading && !isSelectingWorkspace && !!liveSession;
  useEffect(() => {
    if (isReady) removeBootSplash();
  }, [isReady]);

  if (!isReady) return null;

  const isWorkspacesRoute = pathname.startsWith('/workspaces');
  if (!isWorkspacesRoute && (!workspaces || workspaces.length === 0)) {
    return <Navigate to="/workspaces/create" replace />;
  }

  return (
    <ProtectedLayout>
      {/* Remounted on a switch: no page keeps observing the previous
          workspace's queries, or refetches them with the new header. */}
      <Outlet key={selectedWorkspace} />
    </ProtectedLayout>
  );
}
