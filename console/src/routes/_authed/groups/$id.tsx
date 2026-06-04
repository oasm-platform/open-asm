import { createFileRoute } from '@tanstack/react-router';
import AssetGroupDetail from '@/pages/asset-group/asset-group-detail';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/groups/$id')({
  component: () => (
    <RequireWorkspace>
      <AssetGroupDetail />
    </RequireWorkspace>
  ),
});
