import { createFileRoute } from '@tanstack/react-router';
import { AssetGroups } from '@/pages/asset-group/asset-groups';
import { RequireWorkspace } from '@/components/common/require-workspace';

export const Route = createFileRoute('/_authed/groups/')({
  component: () => (
    <RequireWorkspace>
      <AssetGroups />
    </RequireWorkspace>
  ),
});
