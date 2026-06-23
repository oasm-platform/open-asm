import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import Vulnerabilities from '@/pages/vulnerabilities/vulnerabilities';

const vulnerabilitiesSearchSchema = z.object({
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
});

export const Route = createFileRoute('/_authed/vulnerabilities/')({
  validateSearch: vulnerabilitiesSearchSchema,
  component: () => (
      <Vulnerabilities />
  ),
});
