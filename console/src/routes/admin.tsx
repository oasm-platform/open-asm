import {
  createFileRoute,
  Navigate,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import AdminLayout from '@/components/common/layout/admin-layout';
import { useSession, type User } from '@/utils/authClient';

const ADMIN_ROLE = 'admin';

// Guards every /admin/* route: child routes run this beforeLoad first.
export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }
    if (context.session.role !== ADMIN_ROLE) {
      throw redirect({ to: '/' });
    }
  },
  component: AdminRoute,
});

function AdminRoute() {
  // Route context can be stale (beforeLoad doesn't re-run when the session
  // cache changes), so re-check against the live session too.
  const { data: liveSession, isPending } = useSession();
  if (isPending) return null;
  if (!liveSession) return <Navigate to="/login" replace />;
  if ((liveSession.user as User).role !== ADMIN_ROLE) {
    return <Navigate to="/" replace />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
