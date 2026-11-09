import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import AgentsLandingPage from '@/pages/agents/agents-landing';
import { SendMessageDtoAgentMode } from '@/services/apis/gen/queries';

const agentsSearchSchema = z.object({
  text: z.string().optional(),
  // false: ?text= only fills the input (caret at the end) for the user to finish
  autoSubmit: z.boolean().optional(),
  // Opened from a project: the new chat starts in it
  projectId: z.string().uuid().optional(),
  mode: z.enum(['ask', 'agent']).optional(),
});

export const Route = createFileRoute('/_authed/aistudio/')({
  validateSearch: agentsSearchSchema,
  component: function AiStudioIndex() {
    const { mode } = Route.useSearch();
    return (
      <AgentsLandingPage
        initialAgentMode={
          mode === 'agent'
            ? SendMessageDtoAgentMode.agent
            : SendMessageDtoAgentMode.ask
        }
      />
    );
  },
});
