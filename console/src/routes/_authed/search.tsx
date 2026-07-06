import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import Search from '@/pages/search/search';

const searchSearchSchema = z.object({
  query: z.string().default(''),
});

export const Route = createFileRoute('/_authed/search')({
  validateSearch: searchSearchSchema,
  component: () => (
      <Search />
  ),
});
