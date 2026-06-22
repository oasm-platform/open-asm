import Login from '@/pages/login/login';
import { useRootControllerGetMetadata } from '@/services/apis/gen/queries';
import { useSession } from '@/utils/authClient';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { z } from 'zod';
import { Spinner } from '@/components/ui/spinner';
import Logo from '@/components/ui/logo';

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

function LoginGuard() {
  const { data: metadata, isLoading: isMetadataLoading, isError } =
    useRootControllerGetMetadata();
  const { data: session, isLoading: isSessionLoading } = useSession();

  if (isMetadataLoading || isSessionLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Logo width={48} height={48} />
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Logo width={48} height={48} />
        <div className="text-destructive text-center text-sm">
          Unable to connect to the server. Please check your connection and try
          again.
        </div>
      </div>
    );
  }

  if (metadata && !metadata.isInit) return <Navigate to="/init-admin" />;
  if (session) return <Navigate to="/" />;

  return <Login />;
}

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  component: LoginGuard,
});
