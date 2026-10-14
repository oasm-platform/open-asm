import { createFileRoute } from '@tanstack/react-router';
import AiStudioSettingsPage from '@/pages/agents/settings';

export const Route = createFileRoute('/_authed/aistudio/skills')({
  component: () => <AiStudioSettingsPage section="skills" />,
});
