import { createFileRoute } from '@tanstack/react-router';
import InternalNetworks from '@/pages/internal-networks/internal-networks';

export const Route = createFileRoute('/_authed/internal-networks/')({
  component: () => (
      <InternalNetworks />
  ),
});
