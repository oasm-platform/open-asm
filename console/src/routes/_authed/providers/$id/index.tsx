import { createFileRoute } from '@tanstack/react-router';
import DetailProvider from '@/pages/providers/detail-provider';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/providers/$id/')({
  component: () => (
    <RequireWorkspace>
      <DetailProvider />
    </RequireWorkspace>
  ),
});
