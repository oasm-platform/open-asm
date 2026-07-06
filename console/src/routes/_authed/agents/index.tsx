import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import AgentsLandingPage from '@/pages/agents/agents-landing';

const agentsSearchSchema = z.object({
  text: z.string().optional(),
});

export const Route = createFileRoute('/_authed/agents/')({
  validateSearch: agentsSearchSchema,
  component: () => (
      <AgentsLandingPage />
  ),
});
