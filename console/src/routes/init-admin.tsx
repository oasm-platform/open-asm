import Register from '@/pages/register/register';
import { useRootControllerGetMetadata } from '@/services/apis/gen/queries';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { Spinner } from '@/components/ui/spinner';
import Logo from '@/components/ui/logo';

function InitAdminGuard() {
  const { data: metadata, isLoading } = useRootControllerGetMetadata();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Logo width={48} height={48} />
        <Spinner className="size-6" />
      </div>
    );
  }

  if (metadata?.isInit) return <Navigate to="/login" />;

  return <Register />;
}

export const Route = createFileRoute('/init-admin')({
  component: InitAdminGuard,
});
