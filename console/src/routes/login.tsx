import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import Login from '@/pages/login/login';

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  component: Login,
});
