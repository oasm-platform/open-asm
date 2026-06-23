import { createFileRoute } from '@tanstack/react-router';
import { AssetGroups } from '@/pages/asset-group/asset-groups';

export const Route = createFileRoute('/_authed/groups/')({
  component: () => (
      <AssetGroups />
  ),
});
