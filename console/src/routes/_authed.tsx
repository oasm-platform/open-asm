import {
  createFileRoute,
  Navigate,
  Outlet,
  useLocation,
} from '@tanstack/react-router';
import ProtectedLayout from '@/components/common/layout/protect-layout';
import { useSession } from '@/utils/authClient';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { Spinner } from '@/components/ui/spinner';
import Logo from '@/components/ui/logo';

function AuthedPending() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <Logo width={48} height={48} />
      <Spinner className="size-6" />
    </div>
  );
}

export const Route = createFileRoute('/_authed')({
  pendingComponent: AuthedPending,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const { workspaces, isLoading: isWorkspaceLoading } = useWorkspaceSelector();
  const { pathname } = useLocation();

  if (isSessionLoading || isWorkspaceLoading) return <AuthedPending />;
  if (!session) return <Navigate to="/login" />;

  const isWorkspacesRoute = pathname.startsWith('/workspaces');
  if (!isWorkspacesRoute && (!workspaces || workspaces.length === 0)) {
    return <Navigate to="/workspaces/create" />;
  }

  return (
    <ProtectedLayout>
      <Outlet />
    </ProtectedLayout>
  );
}
