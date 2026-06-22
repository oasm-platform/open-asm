import { createFileRoute, Navigate, Outlet, redirect, useLocation } from '@tanstack/react-router';
import { LoadingScreen } from '@/components/ui/loading-screen';
import ProtectedLayout from '@/components/common/layout/protect-layout';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }
  },
  pendingComponent: LoadingScreen,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { workspaces, isLoading: isWorkspaceLoading } = useWorkspaceSelector();
  const { pathname } = useLocation();

  if (isWorkspaceLoading) return <AuthedPending />;

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
