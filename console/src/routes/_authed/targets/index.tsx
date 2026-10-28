import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { z } from 'zod';
import { tableSearch } from '@/lib/table-search';
import Targets from '@/pages/targets/targets';

const table = tableSearch();

const targetsSearchSchema = z.object({
  ...table.shape,
  type: z.string().optional(),
  status: z.string().optional(),
  scope: z.string().optional(),
});

export const Route = createFileRoute('/_authed/targets/')({
  validateSearch: targetsSearchSchema,
  search: { middlewares: [stripSearchParams(table.defaults)] },
  component: () => (
      <Targets />
  ),
});
