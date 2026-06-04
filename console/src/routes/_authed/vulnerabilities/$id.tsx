import { createFileRoute } from '@tanstack/react-router';
import DetailVulnerability from '@/pages/vulnerabilities/detail-vulnerability';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/vulnerabilities/$id')({
  component: () => (
    <RequireWorkspace>
      <DetailVulnerability />
    </RequireWorkspace>
  ),
});
