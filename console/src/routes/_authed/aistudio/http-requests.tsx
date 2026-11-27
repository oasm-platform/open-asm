import { createFileRoute } from '@tanstack/react-router';
import AgentHttpRequestsPage from '@/pages/agents/http-requests/http-requests';
import { httpRequestsSearchSchema } from '@/pages/agents/http-requests/search';

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
