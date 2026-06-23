import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import Assets from '@/pages/assets/assets';

const assetsSearchSchema = z.object({
  tab: z.string().default('service'),
  page: z.number().default(1),
  pageSize: z.number().default(10),
  sortBy: z.string().default('value'),
  sortOrder: z.enum(['ASC', 'DESC']).default('ASC'),
  filter: z.string().default(''),
  ipAddresses: z.union([z.string(), z.array(z.string())]).optional(),
  ports: z.union([z.string(), z.array(z.string())]).optional(),
  techs: z.union([z.string(), z.array(z.string())]).optional(),
  hosts: z.union([z.string(), z.array(z.string())]).optional(),
  statusCodes: z.union([z.string(), z.array(z.string())]).optional(),
  tlsHosts: z.union([z.string(), z.array(z.string())]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const Route = createFileRoute('/_authed/assets/')({
  validateSearch: assetsSearchSchema,
  component: () => (
      <Assets />
  ),
});
