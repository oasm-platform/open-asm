import { createFileRoute } from '@tanstack/react-router';
import IssueDetail from '@/pages/issues/issue-detail';

export const Route = createFileRoute('/_authed/issues/$id')({
  component: () => (
      <IssueDetail />
  ),
});
