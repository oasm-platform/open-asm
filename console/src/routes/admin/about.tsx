import { createFileRoute } from '@tanstack/react-router';
import About from '@/pages/admin/about';

export const Route = createFileRoute('/admin/about')({
  component: About,
});
