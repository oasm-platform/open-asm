import { createFileRoute } from '@tanstack/react-router';
import AdminRoute from '@/modules/admin/layout/admin-route';
import { requireAdmin } from '@/modules/admin/utils';

// Guards every /admin/* route: child routes run this beforeLoad first.
export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context, location }) =>
    requireAdmin(context.session, location.href),
  component: AdminRoute,
});
