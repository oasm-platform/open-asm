import { createFileRoute } from '@tanstack/react-router';
import Brand from '@/pages/admin/brand';

export const Route = createFileRoute('/admin/brand')({
  component: Brand,
});
