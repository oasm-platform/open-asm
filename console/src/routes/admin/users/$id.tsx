import { createFileRoute } from '@tanstack/react-router';
import UserDetail from '@/modules/admin/pages/user-detail';

export const Route = createFileRoute('/admin/users/$id')({
  component: UserDetail,
});
