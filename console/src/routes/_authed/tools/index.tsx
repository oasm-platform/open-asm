import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import Tools from '@/pages/tools/tools';

const toolsSearchSchema = z.object({
  tab: z.string().default('all'),
  search: z.string().optional(),
  category: z.string().optional(),
});

export const Route = createFileRoute('/_authed/tools/')({
  validateSearch: toolsSearchSchema,
  component: () => (
      <Tools />
  ),
});
