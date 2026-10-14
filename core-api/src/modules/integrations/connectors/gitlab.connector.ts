import { IntegrationType } from '@/common/enums/enum';
import { Logger } from '@nestjs/common';
import {
  BaseConnector,
  type ConnectorConfig,
  type RepositoryPage,
  type RepositoryQuery,
  type SourceCodeCapable,
  type SourceOrganization,
  type SourceRepository,
  type TicketingCapable,
} from './connector.abstract';
import { providerFetch, trimBaseUrl } from './source-code.http';

const GITLAB_BASE_URL = 'https://gitlab.com';
/** Groups of one user — 1000 is far beyond any real membership. */
const MAX_GROUP_PAGES = 10;

/** Stored integration config (see gitlab.schema.ts). */
interface GitlabConfig {
  apiToken: string;
  /** Instance root for self-managed GitLab, e.g. https://gitlab.acme.com. */
  baseUrl?: string;
  /** `group/subgroup/project` that receives issues (TICKETING). */
  ticketRepository?: string;
  ticketLabels?: string[];
}

/** Runtime fields the integrations event lane adds for createTicket. */
interface GitlabTicketConfig extends GitlabConfig {
  title?: string;
  text: string;
  eventId?: string;
}

interface GitlabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  default_branch?: string | null;
  visibility?: 'private' | 'internal' | 'public';
  archived?: boolean;
  issues_enabled?: boolean;
  last_activity_at?: string;
  /** Present (non-null) when the project is a fork. */
  forked_from_project?: unknown;
}

interface GitlabUser {
  username: string;
  name?: string;
  web_url?: string;
  avatar_url?: string | null;
}

interface GitlabGroup {
  full_path: string;
  full_name?: string;
  web_url?: string;
  avatar_url?: string | null;
}

interface GitlabNamespace {
  kind: 'group' | 'user';
  full_path: string;
}

/**
 * GitLab connector (gitlab.com or self-managed) — one connection, two
 * capabilities:
 *  - SOURCE_CODE: list the projects the token is a member of.
 *  - TICKETING:   open an issue in `ticketRepository` per pushed event.
 *
 * Auth is a personal/group access token: `read_api` for SOURCE_CODE, `api`
 * when TICKETING is enabled (creating issues needs write scope).
 */
export class GitlabConnector
  extends BaseConnector
  implements SourceCodeCapable, TicketingCapable
{
  private readonly logger = new Logger(GitlabConnector.name);

  async testConnection(
    config: ConnectorConfig,
    capability?: IntegrationType,
  ): Promise<void> {
    const cfg = config as unknown as GitlabConfig;
    await this.request(cfg, '/user');

    if (capability === IntegrationType.SOURCE_CODE) {
      await this.request(cfg, '/projects?membership=true&simple=true&per_page=1');
    }

    if (capability === IntegrationType.TICKETING) {
      const project = await this.getTicketProject(cfg);
      if (project.issues_enabled === false) {
        throw new Error(
          `Issues are disabled on ${project.path_with_namespace}; enable them or choose another project`,
        );
      }
    }
  }

  async listRepositories(
    config: ConnectorConfig,
    query: RepositoryQuery,
  ): Promise<RepositoryPage> {
    const cfg = config as unknown as GitlabConfig;
    const params = new URLSearchParams({
      order_by: 'last_activity_at',
      sort: 'desc',
      per_page: String(query.limit),
      page: String(query.page),
    });
    const search = query.search?.trim();
    if (search) params.set('search', search);

    const basePath = await this.resolveProjectsPath(cfg, query.owner, params);
    const { body, headers } = await this.request<GitlabProject[]>(
      cfg,
      `${basePath}?${params.toString()}`,
    );
    return {
      data: body.map(toSourceRepository),
      page: query.page,
      limit: query.limit,
      // Empty when on the last page; GitLab omits it entirely past 10k rows,
      // in which case a full page is the best signal that more exist.
      hasNextPage: headers.has('x-next-page')
        ? headers.get('x-next-page') !== ''
        : body.length === query.limit,
    };
  }

  async listOrganizations(
    config: ConnectorConfig,
  ): Promise<SourceOrganization[]> {
    const cfg = config as unknown as GitlabConfig;
    const webOrigin = new URL(trimBaseUrl(cfg.baseUrl || GITLAB_BASE_URL)).origin;
    const host = new URL(webOrigin).host;

    const { body: user } = await this.request<GitlabUser>(cfg, '/user');
    const organizations: SourceOrganization[] = [
      {
        path: user.username,
        name: user.name || user.username,
        kind: 'user',
        url: user.web_url ?? `${webOrigin}/${user.username}`,
        avatarUrl: user.avatar_url ?? null,
        targetValue: `${host}/${user.username}`.toLowerCase(),
      },
    ];

    // min_access_level=10 (Guest): every group the user is a member of,
    // subgroups included, as their own entries.
    for (let page = 1; page <= MAX_GROUP_PAGES; page++) {
      const { body, headers } = await this.request<GitlabGroup[]>(
        cfg,
        `/groups?min_access_level=10&per_page=100&page=${page}`,
      );
      organizations.push(
        ...body.map(
          (group): SourceOrganization => ({
            path: group.full_path,
            name: group.full_name || group.full_path,
            kind: 'group',
            url: group.web_url ?? `${webOrigin}/${group.full_path}`,
            avatarUrl: group.avatar_url ?? null,
            targetValue: `${host}/${group.full_path}`.toLowerCase(),
          }),
        ),
      );
      if (!headers.get('x-next-page')) break;
    }
    return organizations;
  }

  async createTicket(config: ConnectorConfig): Promise<void> {
    const cfg = config as unknown as GitlabTicketConfig;
    const project = this.requireTicketRepository(cfg);
    if (!cfg.text) {
      throw new Error('GitLab createTicket requires text in config');
    }

    const title = (cfg.title ?? cfg.text.split('\n')[0]).slice(0, 255);
    const marker = cfg.eventId ? `\n\n<!-- oasm-event-id: ${cfg.eventId} -->` : '';
    const labels = (cfg.ticketLabels ?? []).filter((l) => l.trim() !== '');

    await this.request(cfg, `/projects/${encodeURIComponent(project)}/issues`, {
      method: 'POST',
      body: {
        title,
        description: `${cfg.text}${marker}`,
        ...(labels.length > 0 ? { labels: labels.join(',') } : {}),
      },
    });
    this.logger.log(`GitLab issue opened in ${project}`);
  }

  /**
   * Picks the project-list endpoint for an owner:
   * - no owner → `/projects?membership=true` (everything the token is in)
   * - a group → `/groups/{path}/projects` with subgroups
   * - a user → `/users/{username}/projects`
   */
  private async resolveProjectsPath(
    cfg: GitlabConfig,
    owner: string | undefined,
    params: URLSearchParams,
  ): Promise<string> {
    if (!owner) {
      params.set('membership', 'true');
      return '/projects';
    }
    const { body: namespace } = await this.request<GitlabNamespace>(
      cfg,
      `/namespaces/${encodeURIComponent(owner)}`,
    );
    if (namespace.kind === 'group') {
      params.set('include_subgroups', 'true');
      return `/groups/${encodeURIComponent(namespace.full_path)}/projects`;
    }
    return `/users/${encodeURIComponent(namespace.full_path)}/projects`;
  }

  private requireTicketRepository(cfg: GitlabConfig): string {
    if (!cfg.ticketRepository) {
      throw new Error(
        'GitLab ticketing requires ticketRepository (group/project)',
      );
    }
    return cfg.ticketRepository;
  }

  private async getTicketProject(cfg: GitlabConfig): Promise<GitlabProject> {
    const project = this.requireTicketRepository(cfg);
    const { body } = await this.request<GitlabProject>(
      cfg,
      `/projects/${encodeURIComponent(project)}`,
    );
    return body;
  }

  private request<T>(
    cfg: GitlabConfig,
    path: string,
    init: { method?: string; body?: unknown } = {},
  ) {
    if (!cfg.apiToken) {
      throw new Error('GitLab integration requires apiToken in config');
    }
    const base = trimBaseUrl(cfg.baseUrl || GITLAB_BASE_URL);
    return providerFetch<T>('GitLab', `${base}/api/v4${path}`, {
      ...init,
      headers: { 'PRIVATE-TOKEN': cfg.apiToken },
    });
  }
}

function toSourceRepository(project: GitlabProject): SourceRepository {
  return {
    id: String(project.id),
    name: project.name,
    fullName: project.path_with_namespace,
    url: project.web_url,
    defaultBranch: project.default_branch ?? null,
    private: project.visibility !== 'public',
    archived: project.archived ?? false,
    fork: !!project.forked_from_project,
    updatedAt: project.last_activity_at ?? null,
    // GitLab reports activity (pushes, issues, MRs), not pushes alone.
    pushedAt: project.last_activity_at ?? null,
  };
}
