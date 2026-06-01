import { createFileRoute, Navigate } from '@tanstack/react-router';
import Register from '@/pages/register/register';
import { useRootControllerGetMetadata } from '@/services/apis/gen/queries';

export const Route = createFileRoute('/init-admin')({
  component: InitAdminPage,
});

function InitAdminPage() {
  const { data, isFetched } = useRootControllerGetMetadata();

  if (!isFetched) return null;
  if (data?.isInit) {
    return <Navigate to="/" />;
  }

  return <Register />;
}
