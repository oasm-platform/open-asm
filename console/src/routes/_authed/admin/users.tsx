import { createFileRoute } from '@tanstack/react-router';
import Users from '@/pages/admin/users';

export const Route = createFileRoute('/_authed/admin/users')({
  component: Users,
});
