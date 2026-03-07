import ProtectedLayout from '@/components/common/layout/protect-layout';
import SettingsLayout from '@/components/common/layout/settings-layout';
import { authClient } from '@/utils/authClient';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

const { useSession } = authClient;

type LayoutType = 'application' | 'settings';

interface ProtectedRouteProps {
  layout?: LayoutType;
}

const ProtectedRoute = ({ layout = 'application' }: ProtectedRouteProps) => {
  const { data, isPending } = useSession();
  const location = useLocation();
  const currentPath = location.pathname;

  if (!data && !isPending) {
    return <Navigate to={`/login?redirect=${currentPath}`} />;
  }

  const LayoutComponent =
    layout === 'settings' ? SettingsLayout : ProtectedLayout;

  return (
    <LayoutComponent>
      <Outlet />
    </LayoutComponent>
  );
};

export default ProtectedRoute;
