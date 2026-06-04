import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import Targets from '@/pages/targets/targets';
import { RequireWorkspace } from '@/components/common/require-workspace';

const targetsSearchSchema = z.object({
  page: z.number().default(1),
  pageSize: z.number().default(10),
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['ASC', 'DESC']).default('DESC'),
  filter: z.string().default(''),
  type: z.string().optional(),
  status: z.string().optional(),
  scope: z.string().optional(),
});

export const Route = createFileRoute('/_authed/targets/')({
  validateSearch: targetsSearchSchema,
  component: () => (
    <RequireWorkspace>
      <Targets />
    </RequireWorkspace>
  ),
});
