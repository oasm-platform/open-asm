import { createFileRoute } from '@tanstack/react-router';
import EditPermissionGroupPage from '@/pages/settings/permission-groups/edit-permission-group';

export const Route = createFileRoute(
  '/settings/members/permission-groups/$permissionId',
)({
  component: PermissionGroupEditRoute,
});

function PermissionGroupEditRoute() {
  const { permissionId } = Route.useParams();
  return <EditPermissionGroupPage permissionId={permissionId} />;
}
