import { createFileRoute, redirect, Outlet } from '@tanstack/react-router';
import ProtectedLayout from '@/components/common/layout/protect-layout';
import { sessionQueryOptions } from '@/utils/authClient';

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient
      .ensureQueryData(sessionQueryOptions)
      .catch(() => null);

    if (!session) {
      throw redirect({ to: '/login' });
    }
  },
  component: () => (
    <ProtectedLayout>
      <Outlet />
    </ProtectedLayout>
  ),
});
