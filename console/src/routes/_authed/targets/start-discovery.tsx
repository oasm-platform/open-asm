import { createFileRoute } from '@tanstack/react-router';
import StartDiscovery from '@/pages/targets/start-discovery';

export const Route = createFileRoute('/_authed/targets/start-discovery')({
  component: () => (
      <StartDiscovery />
  ),
});
