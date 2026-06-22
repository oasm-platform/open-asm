import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import DetailTarget from '@/pages/targets/detail-target';

const targetDetailSearchSchema = z.object({
  animation: z.string().optional(),
  tab: z.string().optional(),
  page: z.number().default(1),
  pageSize: z.number().default(10),
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['ASC', 'DESC']).default('DESC'),
  filter: z.string().default(''),
  status: z.string().optional(),
  severity: z.string().optional(),
  tags: z.string().optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  targetId: z.string().optional(),
  ipAddresses: z.union([z.string(), z.array(z.string())]).optional(),
  ports: z.union([z.string(), z.array(z.string())]).optional(),
  techs: z.union([z.string(), z.array(z.string())]).optional(),
  hosts: z.union([z.string(), z.array(z.string())]).optional(),
  statusCodes: z.union([z.string(), z.array(z.string())]).optional(),
  tlsHosts: z.union([z.string(), z.array(z.string())]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const Route = createFileRoute('/_authed/targets/$id/$tab')({
  validateSearch: targetDetailSearchSchema,
  component: () => (
      <DetailTarget />
  ),
});
