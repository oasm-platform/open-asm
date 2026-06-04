import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import Search from '@/pages/search/search';
import { RequireWorkspace } from '@/components/common/require-workspace';

const searchSearchSchema = z.object({
  query: z.string().default(''),
});

export const Route = createFileRoute('/_authed/search')({
  validateSearch: searchSearchSchema,
  component: () => (
    <RequireWorkspace>
      <Search />
    </RequireWorkspace>
  ),
});
