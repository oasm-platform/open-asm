import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { z } from 'zod';
import { tableSearch } from '@/lib/table-search';
import ProjectDetail from '@/pages/projects/project-detail';
import { VulnerabilityDiscoveredBy } from '@/services/apis/gen/queries';

// The Vulnerabilities tab: most severe first unless the user picks another column.
const table = tableSearch({ sortBy: 'severity', sortOrder: 'DESC' });

/**
 * Filters live in the URL so a shared link opens the same view: the
 * vulnerability list (status, provenance, run and the other filters of the
 * workspace list), and the run/workflow filters of the Runs tab.
 */
const projectDetailSearchSchema = z.object({
  ...table.shape,
  provenance: z.string().optional(),
  severity: z.string().optional(),
  run: z.string().optional(),
  workflow: z.string().optional(),
  vulnerability: z.string().optional(),
  status: z.string().optional(),
  where: z.string().optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  overdue: z.boolean().optional().catch(undefined),
  discoveredBy: z
    .enum(Object.values(VulnerabilityDiscoveredBy) as [string, ...string[]])
    .optional()
    .catch(undefined),
});

export type ProjectDetailSearch = z.infer<typeof projectDetailSearchSchema>;

export const Route = createFileRoute('/_authed/projects/$id/$tab')({
  validateSearch: projectDetailSearchSchema,
  search: { middlewares: [stripSearchParams(table.defaults)] },
  component: () => <ProjectDetail />,
});
