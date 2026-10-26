import { createFileRoute } from '@tanstack/react-router';
import About from '@/modules/admin/pages/about';

export const Route = createFileRoute('/admin/about')({
  component: About,
});
