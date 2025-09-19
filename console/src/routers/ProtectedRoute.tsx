import StudioLayout from '@/components/common/layout/studio-layout';
import ProtectedLayout from '@/components/common/layout/protect-layout';
import { authClient } from '@/utils/authClient';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
const { useSession } = authClient;

const ProtectedRoute = () => {
  const { data, isPending: isLoadingSession } = useSession();
  const location = useLocation();
  const currentPath = location.pathname;

  if (!data && !isLoadingSession) {
    return <Navigate to={`/login?redirect=${currentPath}`} />;
  }

  if (currentPath.startsWith('/studio')) {
    return (
      <StudioLayout>
        <Outlet />
      </StudioLayout>
    );
  }

  return (
    <ProtectedLayout>
      <Outlet />
    </ProtectedLayout>
  );
};

export default ProtectedRoute;
