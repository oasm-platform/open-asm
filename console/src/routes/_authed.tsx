import { createFileRoute, redirect, Outlet } from '@tanstack/react-router';
import ProtectedLayout from '@/components/common/layout/protect-layout';
import { authClient } from '@/utils/authClient';

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session?.data) {
      throw redirect({ to: '/login' });
    }
  },
  component: () => (
    <ProtectedLayout>
      <Outlet />
    </ProtectedLayout>
  ),
});
