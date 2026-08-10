import { createFileRoute } from '@tanstack/react-router';
import NewPermissionGroupPage from '@/pages/settings/permission-groups/new-permission-group';

export const Route = createFileRoute('/settings/members/permission-groups/new')(
  {
    component: NewPermissionGroupPage,
  },
);
