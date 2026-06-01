import { createFileRoute } from '@tanstack/react-router';
import DetailTarget from '@/pages/targets/detail-target';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/targets/$id/$tab')({
  component: () => (
    <RequireWorkspace>
      <DetailTarget />
    </RequireWorkspace>
  ),
});
