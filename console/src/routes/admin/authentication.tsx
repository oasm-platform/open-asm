import { createFileRoute } from '@tanstack/react-router';
import Authentication from '@/modules/admin/pages/authentication';

export const Route = createFileRoute('/admin/authentication')({
  component: Authentication,
});
