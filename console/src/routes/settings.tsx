import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router';
import SettingsLayout from '@/components/common/layout/settings-layout';
import { useSession } from '@/utils/authClient';
import { Spinner } from '@/components/ui/spinner';
import Logo from '@/components/ui/logo';

function SettingsGuard() {
  const { data: session, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Logo width={48} height={48} />
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" />;

  return (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  );
}

export const Route = createFileRoute('/settings')({
  component: SettingsGuard,
});
