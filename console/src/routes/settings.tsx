import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { LoadingScreen } from '@/components/ui/loading-screen';
import SettingsLayout from '@/components/common/layout/settings-layout';

export const Route = createFileRoute('/settings')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }
  },
  pendingComponent: LoadingScreen,
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
});
