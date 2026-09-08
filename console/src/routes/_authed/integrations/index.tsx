import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import Integrations from '@/pages/integrations';

const integrationsSearchSchema = z.object({
  tab: z.string().default('applications'),
  search: z.string().optional(),
  category: z.string().optional(),
});

export const Route = createFileRoute('/_authed/integrations/')({
  validateSearch: integrationsSearchSchema,
  component: () => <Integrations />,
});
