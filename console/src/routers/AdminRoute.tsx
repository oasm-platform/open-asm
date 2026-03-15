import { authClient } from '@/utils/authClient';
import { Navigate, Outlet } from 'react-router-dom';

const AdminRoute = () => {
  const { useSession } = authClient;
  const { data } = useSession();

  if (data?.user.role !== 'admin') {
    return <Navigate to="/" />;
  }

  return <Outlet />;
};

export default AdminRoute;
