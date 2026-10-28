import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { z } from 'zod';
import { tableSearch } from '@/lib/table-search';
import DetailTarget from '@/pages/targets/detail-target';

const legacyParam = z
  .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
  .optional(); // the router JSON-parses `?ports=443` into a number

const table = tableSearch();

const targetDetailSearchSchema = z.object({
  animation: z.string().optional(),
  tab: z.string().optional(),
  ...table.shape,
  where: z.string().optional(),
  status: z.string().optional(),
  severity: z.string().optional(),
  tags: z.string().optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  targetId: z.string().optional(),
  ipAddresses: legacyParam,
  ports: legacyParam,
  urls: legacyParam,
  techs: legacyParam,
  hosts: legacyParam,
  statusCodes: legacyParam,
  tlsHosts: legacyParam,
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  // Notification links; migrated into the filter tree on load.
  isNew: z.union([z.boolean(), z.string()]).optional(),
});

export const Route = createFileRoute('/_authed/targets/$id/$tab')({
  validateSearch: targetDetailSearchSchema,
  search: { middlewares: [stripSearchParams(table.defaults)] },
  component: () => (
      <DetailTarget />
  ),
});
