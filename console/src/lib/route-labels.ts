import { t } from '@/lib/i18n-dictionary';

/**
 * Human names of the console's routes: the document title of every page
 * and the Ask AI page chip. A page that knows its item (a target, a
 * project) names it itself with `documentTitle` on `Page`.
 */

/** Dictionary keys of route names; others fall back to their first path segment, capitalized. */
const ROUTE_LABELS: Record<string, string> = {
  '/': 'shell.nav.dashboard',
  '/targets': 'shell.nav.targets',
  '/assets': 'shell.nav.assets',
  '/vulnerabilities': 'shell.nav.vulnerabilities',
  '/issues': 'shell.nav.issues',
  '/reports': 'shell.nav.reports',
  '/tools': 'shell.nav.tools',
  '/integrations': 'shell.nav.integrations',
  '/workers': 'shell.nav.workers',
  '/projects': 'shell.nav.projects',
  '/search': 'common.search',
  '/workspaces': 'shell.route.workspaces',
  '/settings': 'shell.settings.title',
  '/$': 'shell.notFound.title',
  '/login': 'shell.route.signIn',
  '/signup': 'shell.route.signUp',
  '/init-admin': 'shell.route.setUp',
  '/invite/:token': 'shell.route.invitation',
  '/targets/:id': 'shell.route.target',
  '/targets/:id/:tab': 'shell.route.target',
  '/targets/start-discovery': 'shell.route.startDiscovery',
  '/assets/services/:id': 'shell.route.service',
  '/vulnerabilities/:id': 'shell.route.vulnerability',
  '/issues/:id': 'shell.route.issue',
  '/projects/:id': 'shell.route.project',
  '/projects/:id/:tab': 'shell.route.project',
  '/projects/create': 'shell.route.newProject',
  '/jobs': 'shell.nav.jobsRegistry',
  '/jobs/runs/:id': 'shell.route.jobRun',
  '/tools/:id': 'shell.route.tool',
  '/workers/:id': 'shell.route.worker',
  '/internal-networks': 'shell.route.internalNetworks',
  '/internal-networks/:id': 'shell.route.internalNetwork',
  '/internal-networks/create': 'shell.route.newInternalNetwork',
  '/aistudio': 'shell.nav.aiStudio',
  '/aistudio/conversations': 'shell.route.conversations',
  '/aistudio/conversations/:conversationId': 'shell.route.conversation',
  '/aistudio/agents': 'shell.route.agents',
  '/aistudio/connectors': 'shell.aiStudio.connectors',
  '/aistudio/usage': 'shell.route.aiUsage',
  '/agents/create': 'shell.route.newAgent',
  '/agents/:id': 'shell.route.agent',
  '/agents/:id/edit': 'shell.route.editAgent',
  '/agents/providers/connect': 'shell.route.connectProvider',
  '/providers': 'shell.route.llmProviders',
  '/providers/create': 'shell.route.newLlmProvider',
  '/providers/:id': 'shell.route.llmProvider',
  '/providers/:id/edit': 'shell.route.editLlmProvider',
  '/workspaces/create': 'shell.route.newWorkspace',
  '/settings/:tab': 'shell.settings.title',
  '/settings/members/permission-groups/new': 'shell.route.newPermissionGroup',
  '/settings/members/permission-groups/:permissionId': 'shell.route.permissionGroup',
  '/admin': 'shell.route.admin',
  '/admin/users': 'shell.route.usersAdmin',
  '/admin/users/:id': 'shell.route.userAdmin',
  '/admin/workspaces': 'shell.route.workspacesAdmin',
  '/admin/workspaces/:id': 'shell.route.workspaceAdmin',
  '/admin/brand': 'shell.route.brandAdmin',
  '/admin/mail-server': 'shell.route.mailServerAdmin',
  '/admin/authentication': 'shell.route.authenticationAdmin',
  '/admin/about': 'shell.route.aboutAdmin',
};

const capitalize = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1).replace(/-/g, ' ');

/** `/targets/$id/$tab/` (router `fullPath`) → `/targets/:id/:tab` */
export function normalizeRoutePattern(fullPath: string): string {
  const route = fullPath.replace(/\$([A-Za-z_]\w*)/g, ':$1').replace(/\/+$/, '');
  return route === '' ? '/' : route;
}

// Pages that already name their tabs in the dictionary.
const TAB_KEYS: Record<string, (tab: string) => string> = {
  '/targets/:id/:tab': (tab) => `targets.tabs.${tab}`,
  '/projects/:id/:tab': (tab) => `projects.tabs.${tab}`,
  '/settings/:tab': (tab) =>
    `settings.tabs.${tab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}.label`,
};

/**
 * The name of a `:tab` value: the page's own translated tab label, else the
 * value itself (`api-keys` → `Api keys`); null when it is not a plain word.
 */
export function tabLabel(tab: string | undefined, route?: string): string | null {
  if (!tab || !/^[a-z][a-z-]*$/.test(tab)) return null;
  const key = route ? TAB_KEYS[route]?.(tab) : undefined;
  const label = key ? t(key) : undefined;
  return label && label !== key ? label : capitalize(tab);
}

/** The name of a page: its route's name, plus the tab when the route has one. */
export function routeLabel(route: string, params: Record<string, string>): string {
  const firstSegment = route.split('/').find(Boolean);
  const key = ROUTE_LABELS[route];
  const name = key
    ? t(key)
    : firstSegment
      ? capitalize(firstSegment)
      : t('shell.nav.dashboard');
  const tab = route.endsWith('/:tab') ? tabLabel(params.tab, route) : null;
  return tab ? `${name} · ${tab}` : name;
}
