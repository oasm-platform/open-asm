import { createFileRoute } from '@tanstack/react-router';
import Login from '@/pages/login/login';

export const Route = createFileRoute('/login')({
  component: Login,
});
