import { createFileRoute } from '@tanstack/react-router';
import Brand from '@/modules/admin/pages/brand';

export const Route = createFileRoute('/admin/brand')({
  component: Brand,
});
