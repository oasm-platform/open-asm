import { createFileRoute } from '@tanstack/react-router';
import CreateIssue from '@/pages/issues/create-issue';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/issues/create')({
  component: () => (
    <RequireWorkspace>
      <CreateIssue />
    </RequireWorkspace>
  ),
});
