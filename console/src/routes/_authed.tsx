import { createFileRoute, Outlet, redirect, useLocation } from '@tanstack/react-router';
import ProtectedLayout from '@/components/common/layout/protect-layout';
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
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }
  },
  pendingComponent: AuthedPending,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { workspaces, isLoading: isWorkspaceLoading } = useWorkspaceSelector();
  const { pathname } = useLocation();

  if (isWorkspaceLoading) return <AuthedPending />;

  const isWorkspacesRoute = pathname.startsWith('/workspaces');
  if (!isWorkspacesRoute && (!workspaces || workspaces.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Logo width={48} height={48} />
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <ProtectedLayout>
      <Outlet />
    </ProtectedLayout>
  );
}
