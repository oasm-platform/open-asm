import { createFileRoute } from '@tanstack/react-router';
import AiStudioSettingsPage from '@/pages/agents/settings';

export const Route = createFileRoute('/_authed/aistudio/memory')({
  component: () => <AiStudioSettingsPage section="memory" />,
});
