import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import ToolDetail from '@/pages/tools/components/tool-detail';

const toolDetailSearchSchema = z.object({
  tab: z.string().optional(),
  /** Opens the create-configuration sheet on the Configuration tab. */
  openCreateToolConfiguration: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute('/_authed/tools/$id')({
  validateSearch: toolDetailSearchSchema,
  component: () => (
      <ToolDetail />
  ),
});
