import { createFileRoute } from '@tanstack/react-router';
import DetailAsset from '@/pages/assets/detail-asset';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/assets/$id')({
  component: () => (
    <RequireWorkspace>
      <DetailAsset />
    </RequireWorkspace>
  ),
});
