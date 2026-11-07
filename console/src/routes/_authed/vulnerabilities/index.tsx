import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { z } from 'zod';
import { tableSearch } from '@/lib/table-search';
import Vulnerabilities from '@/pages/vulnerabilities/vulnerabilities';
import {
  VulnerabilityDiscoveredBy,
  VulnerabilityStatus,
} from '@/services/apis/gen/queries';

// Most severe first unless the user picks another column.
const table = tableSearch({ sortBy: 'severity', sortOrder: 'DESC' });

const vulnerabilitiesSearchSchema = z.object({
  ...table.shape,
  status: z
    .enum(Object.values(VulnerabilityStatus) as [string, ...string[]])
    .optional()
    .catch(undefined),
  severity: z.string().optional(),
  tags: z.string().optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  targetId: z.string().optional(),
  // FilterToolbar tree (encodeFilter); without it the schema strips the filter.
  where: z.string().optional(),
  overdue: z.boolean().optional().catch(undefined),
  discoveredBy: z
    .enum(Object.values(VulnerabilityDiscoveredBy) as [string, ...string[]])
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute('/_authed/vulnerabilities/')({
  validateSearch: vulnerabilitiesSearchSchema,
  search: { middlewares: [stripSearchParams(table.defaults)] },
  component: () => <Vulnerabilities />,
});
