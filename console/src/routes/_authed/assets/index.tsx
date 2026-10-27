import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import Assets from '@/pages/assets/assets';

const legacyParam = z
  .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
  .optional(); // the router JSON-parses `?ports=443` into a number

const assetsSearchSchema = z.object({
  tab: z.string().default('service'),
  page: z.number().default(1),
  pageSize: z.number().default(10),
  sortBy: z.string().default('value'),
  sortOrder: z.enum(['ASC', 'DESC']).default('ASC'),
  filter: z.string().default(''),
  where: z.string().optional(),
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

export const Route = createFileRoute('/_authed/assets/')({
  validateSearch: assetsSearchSchema,
  component: () => (
      <Assets />
  ),
});
