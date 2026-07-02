import { createFileRoute } from '@tanstack/react-router';
import CreateIssue from '@/pages/issues/create-issue';

export const Route = createFileRoute('/_authed/issues/create')({
  component: () => (
      <CreateIssue />
  ),
});
