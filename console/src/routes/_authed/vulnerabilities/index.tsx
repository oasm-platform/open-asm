import { createFileRoute } from '@tanstack/react-router';
import Vulnerabilities from '@/pages/vulnerabilities/vulnerabilities';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/vulnerabilities/')({
  component: () => (
    <RequireWorkspace>
      <Vulnerabilities />
    </RequireWorkspace>
  ),
});
