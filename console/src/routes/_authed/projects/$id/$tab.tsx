import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import ProjectDetail from '@/pages/projects/project-detail';

/**
 * Filters live in the URL so a shared link opens the same view: the
 * vulnerability provenance and run filters, and the run/workflow filters of
 * the Runs tab.
 */
const projectDetailSearchSchema = z.object({
  provenance: z.string().optional(),
  severity: z.string().optional(),
  run: z.string().optional(),
  workflow: z.string().optional(),
  vulnerability: z.string().optional(),
});

export type ProjectDetailSearch = z.infer<typeof projectDetailSearchSchema>;

export const Route = createFileRoute('/_authed/projects/$id/$tab')({
  validateSearch: projectDetailSearchSchema,
  component: () => <ProjectDetail />,
});
