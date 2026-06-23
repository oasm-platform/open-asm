import { createFileRoute } from '@tanstack/react-router';
import ProvidersConnectPage from '@/pages/agents/providers-connect';

export const Route = createFileRoute('/_authed/agents/providers/connect')({
  component: () => (
      <ProvidersConnectPage />
  ),
});
