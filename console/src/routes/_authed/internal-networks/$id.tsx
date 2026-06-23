import { createFileRoute } from '@tanstack/react-router';
import InternalNetworkDetail from '@/pages/internal-networks/internal-network-detail';

export const Route = createFileRoute('/_authed/internal-networks/$id')({
  component: () => (
      <InternalNetworkDetail />
  ),
});
