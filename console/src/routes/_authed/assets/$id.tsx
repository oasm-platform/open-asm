import { createFileRoute } from '@tanstack/react-router';
import DetailAsset from '@/pages/assets/detail-asset';

export const Route = createFileRoute('/_authed/assets/$id')({
  component: () => (
      <DetailAsset />
  ),
});
