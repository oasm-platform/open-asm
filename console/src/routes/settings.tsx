import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import SettingsLayout from '@/components/common/layout/settings-layout';
import { Spinner } from '@/components/ui/spinner';
import Logo from '@/components/ui/logo';

export const Route = createFileRoute('/settings')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }
  },
  pendingComponent: () => (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <Logo width={48} height={48} />
      <Spinner className="size-6" />
    </div>
  ),
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
});
