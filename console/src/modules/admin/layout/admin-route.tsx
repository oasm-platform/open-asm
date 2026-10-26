import { useSession, type User } from '@/utils/authClient';
import { Navigate, Outlet } from '@tanstack/react-router';
import { isAdminUser } from '../utils';
import AdminLayout from './admin-layout';

export default function AdminRoute() {
  // Route context can be stale (beforeLoad doesn't re-run when the session
  // cache changes), so re-check against the live session too.
  const { data: liveSession, isPending } = useSession();
  if (isPending) return null;
  if (!liveSession) return <Navigate to="/login" replace />;
  if (!isAdminUser(liveSession.user as User)) {
    return <Navigate to="/" replace />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
