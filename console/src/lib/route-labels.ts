/**
 * Human names of the console's routes: the document title of every page
 * and the Ask AI page chip. A page that knows its item (a target, a
 * project) names it itself with `documentTitle` on `Page`.
 */

/** Routes whose name is not their first path segment, capitalized. */
const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/$': 'Page not found',
  '/login': 'Sign in',
  '/signup': 'Sign up',
  '/init-admin': 'Set up OASM',
  '/invite/:token': 'Invitation',
  '/targets/:id': 'Target',
  '/targets/:id/:tab': 'Target',
  '/targets/start-discovery': 'Start discovery',
  '/assets/services/:id': 'Service',
  '/vulnerabilities/:id': 'Vulnerability',
  '/issues/:id': 'Issue',
  '/projects/:id': 'Project',
  '/projects/:id/:tab': 'Project',
  '/projects/create': 'New project',
  '/jobs': 'Jobs Registry',
  '/jobs/runs/:id': 'Job run',
  '/tools/:id': 'Tool',
  '/workers/:id': 'Worker',
  '/internal-networks': 'Internal networks',
  '/internal-networks/:id': 'Internal network',
  '/internal-networks/create': 'New internal network',
  '/aistudio': 'AI Studio',
  '/aistudio/conversations': 'Conversations',
  '/aistudio/conversations/:conversationId': 'Conversation',
  '/aistudio/agents': 'Agents',
  '/aistudio/connectors': 'Connectors',
  '/aistudio/usage': 'AI usage',
  '/agents/create': 'New agent',
  '/agents/:id': 'Agent',
  '/agents/:id/edit': 'Edit agent',
  '/agents/providers/connect': 'Connect provider',
  '/providers': 'LLM providers',
  '/providers/create': 'New LLM provider',
  '/providers/:id': 'LLM provider',
  '/providers/:id/edit': 'Edit LLM provider',
  '/workspaces/create': 'New workspace',
  '/settings/:tab': 'Settings',
  '/settings/members/permission-groups/new': 'New permission group',
  '/settings/members/permission-groups/:permissionId': 'Permission group',
  '/admin': 'Admin',
  '/admin/users': 'Users · Admin',
  '/admin/users/:id': 'User · Admin',
  '/admin/workspaces': 'Workspaces · Admin',
  '/admin/workspaces/:id': 'Workspace · Admin',
  '/admin/brand': 'Brand · Admin',
  '/admin/mail-server': 'Mail server · Admin',
  '/admin/authentication': 'Authentication · Admin',
  '/admin/about': 'About · Admin',
};

const capitalize = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1).replace(/-/g, ' ');

/** `/targets/$id/$tab/` (router `fullPath`) → `/targets/:id/:tab` */
export function normalizeRoutePattern(fullPath: string): string {
  const route = fullPath.replace(/\$([A-Za-z_]\w*)/g, ':$1').replace(/\/+$/, '');
  return route === '' ? '/' : route;
}

/** The name of a `:tab` value (`api-keys` → `Api keys`); null when it is not a plain word. */
export function tabLabel(tab: string | undefined): string | null {
  return tab && /^[a-z][a-z-]*$/.test(tab) ? capitalize(tab) : null;
}

/** The name of a page: its route's name, plus the tab when the route has one. */
export function routeLabel(route: string, params: Record<string, string>): string {
  const firstSegment = route.split('/').find(Boolean);
  const name = ROUTE_LABELS[route] ?? (firstSegment ? capitalize(firstSegment) : 'Dashboard');
  const tab = route.endsWith('/:tab') ? tabLabel(params.tab) : null;
  return tab ? `${name} · ${tab}` : name;
}
