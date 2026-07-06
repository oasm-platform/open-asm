import { createFileRoute } from '@tanstack/react-router';
import AssetGroupDetail from '@/pages/asset-group/asset-group-detail';

export const Route = createFileRoute('/_authed/groups/$id')({
  component: () => (
      <AssetGroupDetail />
  ),
});
