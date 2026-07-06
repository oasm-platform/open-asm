import { createFileRoute } from '@tanstack/react-router';
import CreateInternalNetwork from '@/pages/internal-networks/create-internal-network';

export const Route = createFileRoute('/_authed/internal-networks/create')({
  component: () => (
      <CreateInternalNetwork />
  ),
});
