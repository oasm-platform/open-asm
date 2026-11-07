import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import Issues, { ISSUE_TABS } from '@/pages/issues/issues';

const issuesSearchSchema = z.object({
  tab: z.enum(ISSUE_TABS).optional(),
  type: z
    .enum(['vulnerability_remediation', 'task', 'asset_review', 'scan_failure'])
    .optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['p1', 'p2', 'p3', 'p4']).optional(),
  assigneeId: z.string().optional(),
  search: z.string().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['ASC', 'DESC']).optional(),
});

export const Route = createFileRoute('/_authed/issues/')({
  validateSearch: issuesSearchSchema,
  component: () => <Issues />,
});
