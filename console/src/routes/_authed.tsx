import { createFileRoute, redirect, Outlet } from '@tanstack/react-router';
import ProtectedLayout from '@/components/common/layout/protect-layout';
import { sessionQueryOptions } from '@/utils/authClient';
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
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient
      .ensureQueryData(sessionQueryOptions)
      .catch((err) => {
        console.log('Session fetch error:', err);
        return null;
      });

    if (!session) {
      throw redirect({ to: '/login' });
    }
  },
  pendingComponent: AuthedPending,
  component: () => (
    <ProtectedLayout>
      <Outlet />
    </ProtectedLayout>
  ),
});
