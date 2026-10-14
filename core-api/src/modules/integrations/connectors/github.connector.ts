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

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
/** `/user/repos` has no name filter, so a search scans at most this many pages. */
const MAX_SEARCH_SCAN_PAGES = 10;
const SEARCH_SCAN_PAGE_SIZE = 100;
/** Organizations of one user — 1000 is far beyond any real membership. */
const MAX_ORG_PAGES = 10;

/** Stored integration config (see github.schema.ts). */
interface GithubConfig {
  apiToken: string;
  /** GitHub Enterprise Server API root, e.g. https://ghe.acme.com/api/v3. */
  baseUrl?: string;
  /** `owner/repo` that receives issues (TICKETING). */
  ticketRepository?: string;
  ticketLabels?: string[];
}

/** Runtime fields the integrations event lane adds for createTicket. */
interface GithubTicketConfig extends GithubConfig {
  title?: string;
  text: string;
  eventId?: string;
}

interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  default_branch?: string;
  private: boolean;
  archived: boolean;
  fork?: boolean;
  has_issues?: boolean;
  updated_at?: string;
  pushed_at?: string | null;
}

interface GithubAccount {
  login: string;
  name?: string | null;
  html_url?: string;
  avatar_url?: string | null;
  type?: 'User' | 'Organization';
}

/** Builds the repo-list path for one page (owner already resolved). */
type RepoPagePath = (perPage: number, page: number) => string;

/**
 * GitHub connector — one connection, two capabilities:
 *  - SOURCE_CODE: list the repositories the token can see.
 *  - TICKETING:   open an issue in `ticketRepository` per pushed event.
 *
 * Auth is a personal access token (classic or fine-grained). Required
 * fine-grained permissions: Metadata (read) for SOURCE_CODE, plus Issues
 * (write) on the issue repository for TICKETING.
 */
export class GithubConnector
  extends BaseConnector
  implements SourceCodeCapable, TicketingCapable
{
  private readonly logger = new Logger(GithubConnector.name);

  async testConnection(
    config: ConnectorConfig,
    capability?: IntegrationType,
  ): Promise<void> {
    const cfg = config as unknown as GithubConfig;
    await this.request(cfg, '/user');

    if (capability === IntegrationType.SOURCE_CODE) {
      await this.request(cfg, '/user/repos?per_page=1');
    }

    if (capability === IntegrationType.TICKETING) {
      const repo = await this.getTicketRepository(cfg);
      if (repo.has_issues === false) {
        throw new Error(
          `Issues are disabled on ${repo.full_name}; enable them or choose another repository`,
        );
      }
    }
  }

  async listRepositories(
    config: ConnectorConfig,
    query: RepositoryQuery,
  ): Promise<RepositoryPage> {
    const cfg = config as unknown as GithubConfig;
    const search = query.search?.trim().toLowerCase();
    const pagePath = await this.resolveRepoPagePath(cfg, query.owner);

    if (!search) {
      const { body, headers } = await this.request<GithubRepo[]>(
        cfg,
        pagePath(query.limit, query.page),
      );
      return {
        data: body.map(toSourceRepository),
        page: query.page,
        limit: query.limit,
        hasNextPage: hasNextLink(headers),
      };
    }

    // No server-side name filter on /user/repos: scan a bounded number of
    // pages and page through the matches in memory.
    const matches: GithubRepo[] = [];
    let scanPage = 1;
    let more = true;
    while (more && scanPage <= MAX_SEARCH_SCAN_PAGES) {
      const { body, headers } = await this.request<GithubRepo[]>(
        cfg,
        pagePath(SEARCH_SCAN_PAGE_SIZE, scanPage),
      );
      matches.push(
        ...body.filter((repo) => repo.full_name.toLowerCase().includes(search)),
      );
      more = hasNextLink(headers);
      scanPage += 1;
    }

    const start = (query.page - 1) * query.limit;
    return {
      data: matches.slice(start, start + query.limit).map(toSourceRepository),
      page: query.page,
      limit: query.limit,
      hasNextPage: matches.length > start + query.limit,
    };
  }

  async listOrganizations(
    config: ConnectorConfig,
  ): Promise<SourceOrganization[]> {
    const cfg = config as unknown as GithubConfig;
    const { body: user } = await this.request<GithubAccount>(cfg, '/user');
    // The web origin (github.com or the GHES host) comes from the profile
    // URL, so org links and target values are right on Enterprise too.
    const webOrigin = new URL(user.html_url ?? 'https://github.com').origin;
    const host = new URL(webOrigin).host;

    const organizations: SourceOrganization[] = [
      toOrganization(user, 'user', webOrigin, host),
    ];
    for (let page = 1; page <= MAX_ORG_PAGES; page++) {
      const { body, headers } = await this.request<GithubAccount[]>(
        cfg,
        `/user/orgs?per_page=100&page=${page}`,
      );
      organizations.push(
        ...body.map((org) =>
          toOrganization(org, 'organization', webOrigin, host),
        ),
      );
      if (!hasNextLink(headers)) break;
    }
    return organizations;
  }

  async createTicket(config: ConnectorConfig): Promise<void> {
    const cfg = config as unknown as GithubTicketConfig;
    const repository = this.requireTicketRepository(cfg);
    if (!cfg.text) {
      throw new Error('GitHub createTicket requires text in config');
    }

    const title = (cfg.title ?? cfg.text.split('\n')[0]).slice(0, 256);
    // Hidden marker so a receiver-side duplicate (proxy retry) can be found.
    const marker = cfg.eventId ? `\n\n<!-- oasm-event-id: ${cfg.eventId} -->` : '';
    const labels = (cfg.ticketLabels ?? []).filter((l) => l.trim() !== '');

    await this.request(cfg, `/repos/${encodeRepoPath(repository)}/issues`, {
      method: 'POST',
      body: {
        title,
        body: `${cfg.text}${marker}`,
        ...(labels.length > 0 ? { labels } : {}),
      },
    });
    this.logger.log(`GitHub issue opened in ${repository}`);
  }

  /**
   * Picks the endpoint that lists an owner's repositories *including private
   * ones the token can read*:
   * - no owner → `/user/repos` (everything the token sees)
   * - an organization → `/orgs/{org}/repos?type=all`
   * - the token's own user → `/user/repos?affiliation=owner`
   *   (`/users/{me}/repos` would return public repositories only)
   * - another user → `/users/{user}/repos` (public only, by GitHub design)
   */
  private async resolveRepoPagePath(
    cfg: GithubConfig,
    owner: string | undefined,
  ): Promise<RepoPagePath> {
    const params = (perPage: number, page: number, extra: Record<string, string>) =>
      new URLSearchParams({
        per_page: String(perPage),
        page: String(page),
        sort: 'updated',
        ...extra,
      }).toString();

    if (!owner) {
      return (perPage, page) =>
        `/user/repos?${params(perPage, page, { affiliation: 'owner,collaborator,organization_member' })}`;
    }

    const encoded = encodeURIComponent(owner);
    const { body: account } = await this.request<GithubAccount>(
      cfg,
      `/users/${encoded}`,
    );
    if (account.type === 'Organization') {
      return (perPage, page) =>
        `/orgs/${encoded}/repos?${params(perPage, page, { type: 'all' })}`;
    }

    const { body: me } = await this.request<GithubAccount>(cfg, '/user');
    if (me.login.toLowerCase() === owner.toLowerCase()) {
      return (perPage, page) =>
        `/user/repos?${params(perPage, page, { affiliation: 'owner' })}`;
    }
    return (perPage, page) =>
      `/users/${encoded}/repos?${params(perPage, page, { type: 'owner' })}`;
  }

  private requireTicketRepository(cfg: GithubConfig): string {
    if (!cfg.ticketRepository) {
      throw new Error('GitHub ticketing requires ticketRepository (owner/repo)');
    }
    return cfg.ticketRepository;
  }

  private async getTicketRepository(cfg: GithubConfig): Promise<GithubRepo> {
    const repository = this.requireTicketRepository(cfg);
    const { body } = await this.request<GithubRepo>(
      cfg,
      `/repos/${encodeRepoPath(repository)}`,
    );
    return body;
  }

  private request<T>(
    cfg: GithubConfig,
    path: string,
    init: { method?: string; body?: unknown } = {},
  ) {
    if (!cfg.apiToken) {
      throw new Error('GitHub integration requires apiToken in config');
    }
    const base = trimBaseUrl(cfg.baseUrl || GITHUB_API_BASE);
    return providerFetch<T>('GitHub', `${base}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cfg.apiToken}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
    });
  }
}

function toSourceRepository(repo: GithubRepo): SourceRepository {
  return {
    id: String(repo.id),
    name: repo.name,
    fullName: repo.full_name,
    url: repo.html_url,
    defaultBranch: repo.default_branch ?? null,
    private: repo.private,
    archived: repo.archived,
    fork: repo.fork ?? false,
    updatedAt: repo.updated_at ?? null,
    pushedAt: repo.pushed_at ?? null,
  };
}

function toOrganization(
  account: GithubAccount,
  kind: SourceOrganization['kind'],
  webOrigin: string,
  host: string,
): SourceOrganization {
  return {
    path: account.login,
    name: account.name || account.login,
    kind,
    url: account.html_url ?? `${webOrigin}/${account.login}`,
    avatarUrl: account.avatar_url ?? null,
    targetValue: `${host}/${account.login}`.toLowerCase(),
  };
}

/** `owner/repo` → `owner/repo` with each segment URL-encoded. */
function encodeRepoPath(repository: string): string {
  return repository.split('/').map(encodeURIComponent).join('/');
}

/** GitHub paginates via RFC 8288 `Link: <…>; rel="next"`. */
function hasNextLink(headers: Headers): boolean {
  return /rel="next"/.test(headers.get('link') ?? '');
}
