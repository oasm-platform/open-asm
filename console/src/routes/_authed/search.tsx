import { createFileRoute } from '@tanstack/react-router';
import Search from '@/pages/search/search';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/search')({
  component: () => (
    <RequireWorkspace>
      <Search />
    </RequireWorkspace>
  ),
});
