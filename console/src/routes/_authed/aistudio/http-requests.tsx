import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import AgentHttpRequestsPage from '@/pages/agents/http-requests/http-requests';

const httpRequestsSearchSchema = z.object({
  conversationId: z.string().optional(),
  host: z.string().optional(),
  errorsOnly: z.boolean().optional(),
});

export const Route = createFileRoute('/_authed/aistudio/http-requests')({
  validateSearch: httpRequestsSearchSchema,
  component: HttpRequestsRoute,
});

function HttpRequestsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AgentHttpRequestsPage
      search={search}
      // Filter changes replace the entry so Back leaves the page, not each keystroke
      onSearchChange={(next) => void navigate({ search: next, replace: true })}
    />
  );
}
