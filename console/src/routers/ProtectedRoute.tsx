import EditorLayout from '@/components/common/layout/editor-layout';
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

  if (currentPath.startsWith('/editor')) {
    return (
      <EditorLayout>
        <Outlet />
      </EditorLayout>
    );
  }

  return (
    <ProtectedLayout>
      <Outlet />
    </ProtectedLayout>
  );
};

export default ProtectedRoute;
