import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import SettingsLayout from '@/components/common/layout/settings-layout';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';

export const Route = createFileRoute('/settings')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }
  },
  component: SettingsRoute,
});

function SettingsRoute() {
  const { workspaces, isLoading, selectedWorkspace } = useWorkspaceSelector();
  // Like the _authed layout: workspace settings load only once a workspace is
  // selected, and remount when it changes.
  if (isLoading || (workspaces.length > 0 && !selectedWorkspace)) return null;

  return (
    <SettingsLayout>
      <Outlet key={selectedWorkspace} />
    </SettingsLayout>
  );
}
