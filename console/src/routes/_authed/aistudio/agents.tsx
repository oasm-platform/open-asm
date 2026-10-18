import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import AgentsLandingPage from '@/pages/agents/agents-landing';
import { SendMessageDtoAgentMode } from '@/services/apis/gen/queries';

const agentsSearchSchema = z.object({
  text: z.string().optional(),
});

// Same landing page as /aistudio, opened in agent mode.
export const Route = createFileRoute('/_authed/aistudio/agents')({
  validateSearch: agentsSearchSchema,
  component: () => (
    <AgentsLandingPage initialAgentMode={SendMessageDtoAgentMode.agent} />
  ),
});
