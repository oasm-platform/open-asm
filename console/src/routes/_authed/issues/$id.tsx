import { createFileRoute } from '@tanstack/react-router';
import IssueDetail from '@/pages/issues/issue-detail';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/issues/$id')({
  component: () => (
    <RequireWorkspace>
      <IssueDetail />
    </RequireWorkspace>
  ),
});
