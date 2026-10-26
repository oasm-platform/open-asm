import { createFileRoute } from '@tanstack/react-router';
import Users from '@/modules/admin/pages/users';

export const Route = createFileRoute('/admin/users')({
  component: Users,
});
