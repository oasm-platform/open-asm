import { IntegrationType } from '@/common/enums/enum';
import { GithubConnector } from './github.connector';
import { GitlabConnector } from './gitlab.connector';

type FetchCall = [string, RequestInit];

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

describe('source-code connectors', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  const calls = () => fetchMock.mock.calls as FetchCall[];

  describe('GithubConnector', () => {
    const connector = new GithubConnector();
    const config = { apiToken: 'ghp_x' };

    const repo = (id: number, fullName: string) => ({
      id,
      name: fullName.split('/')[1],
      full_name: fullName,
      html_url: `https://github.com/${fullName}`,
      default_branch: 'main',
      private: true,
      archived: false,
      updated_at: '2026-10-01T00:00:00Z',
    });

    it('lists one provider page and reads hasNextPage from the Link header', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([repo(1, 'acme/web')], {
          headers: { link: '<https://api.github.com/user/repos?page=2>; rel="next"' },
        }),
      );

      const page = await connector.listRepositories(config, { page: 1, limit: 30 });

      expect(page).toEqual({
        data: [
          {
            id: '1',
            name: 'web',
            fullName: 'acme/web',
            url: 'https://github.com/acme/web',
            defaultBranch: 'main',
            private: true,
            archived: false,
            fork: false,
            updatedAt: '2026-10-01T00:00:00Z',
            pushedAt: null,
          },
        ],
        page: 1,
        limit: 30,
        hasNextPage: true,
      });
      const [url, init] = calls()[0];
      expect(url).toContain('https://api.github.com/user/repos?per_page=30&page=1');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer ghp_x',
      );
    });

    it('filters by name across scanned pages when searching', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse([repo(1, 'acme/web'), repo(2, 'acme/api')], {
            headers: { link: '<x>; rel="next"' },
          }),
        )
        .mockResolvedValueOnce(jsonResponse([repo(3, 'acme/web-admin')]));

      const page = await connector.listRepositories(config, {
        page: 1,
        limit: 30,
        search: 'WEB',
      });

      expect(page.data.map((r) => r.fullName)).toEqual([
        'acme/web',
        'acme/web-admin',
      ]);
      expect(page.hasNextPage).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('honours a GitHub Enterprise baseUrl', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([]));

      await connector.listRepositories(
        { ...config, baseUrl: 'https://ghe.acme.com/api/v3/' },
        { page: 1, limit: 10 },
      );

      expect(calls()[0][0]).toMatch(/^https:\/\/ghe\.acme\.com\/api\/v3\/user\/repos\?/);
    });

    it('opens an issue with title, body, labels and the event marker', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ number: 7 }, { status: 201 }));

      await connector.createTicket({
        ...config,
        ticketRepository: 'acme/security',
        ticketLabels: ['security', ''],
        title: '2 new vulnerabilities found',
        text: 'body text',
        eventId: 'evt-1',
      });

      const [url, init] = calls()[0];
      expect(url).toBe('https://api.github.com/repos/acme/security/issues');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({
        title: '2 new vulnerabilities found',
        body: 'body text\n\n<!-- oasm-event-id: evt-1 -->',
        labels: ['security'],
      });
    });

    it('fails createTicket without a ticket repository', async () => {
      await expect(
        connector.createTicket({ ...config, text: 'x' }),
      ).rejects.toThrow(/ticketRepository/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('turns a 401 into an actionable message', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ message: 'Bad credentials' }, { status: 401 }),
      );

      await expect(connector.testConnection(config)).rejects.toThrow(
        'GitHub API error: token is invalid or expired (Bad credentials)',
      );
    });

    it('TICKETING test fails when issues are disabled on the repository', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ login: 'bot' }))
        .mockResolvedValueOnce(
          jsonResponse({ ...repo(1, 'acme/security'), has_issues: false }),
        );

      await expect(
        connector.testConnection(
          { ...config, ticketRepository: 'acme/security' },
          IntegrationType.TICKETING,
        ),
      ).rejects.toThrow(/Issues are disabled/);
    });
  });

  describe('GitlabConnector', () => {
    const connector = new GitlabConnector();
    const config = { apiToken: 'glpat-x' };

    const project = {
      id: 42,
      name: 'web',
      path_with_namespace: 'acme/platform/web',
      web_url: 'https://gitlab.com/acme/platform/web',
      default_branch: 'main',
      visibility: 'internal',
      archived: false,
      last_activity_at: '2026-10-01T00:00:00Z',
    };

    it('lists projects with server-side search and X-Next-Page', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([project], { headers: { 'x-next-page': '2' } }),
      );

      const page = await connector.listRepositories(config, {
        page: 1,
        limit: 20,
        search: 'web',
      });

      expect(page.hasNextPage).toBe(true);
      expect(page.data[0]).toMatchObject({
        id: '42',
        fullName: 'acme/platform/web',
        private: true, // internal ≠ public
      });
      const [url, init] = calls()[0];
      expect(url).toContain('https://gitlab.com/api/v4/projects?');
      expect(url).toContain('search=web');
      expect((init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe(
        'glpat-x',
      );
    });

    it('reports no next page when X-Next-Page is empty', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([project], { headers: { 'x-next-page': '' } }),
      );

      const page = await connector.listRepositories(
        { ...config, baseUrl: 'https://gitlab.acme.com' },
        { page: 3, limit: 20 },
      );

      expect(page.hasNextPage).toBe(false);
      expect(calls()[0][0]).toMatch(/^https:\/\/gitlab\.acme\.com\/api\/v4\//);
    });

    it('opens an issue in the URL-encoded project path', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ iid: 1 }, { status: 201 }));

      await connector.createTicket({
        ...config,
        ticketRepository: 'acme/platform/web',
        ticketLabels: ['security', 'oasm'],
        text: 'first line\nsecond line',
      });

      const [url, init] = calls()[0];
      expect(url).toBe(
        'https://gitlab.com/api/v4/projects/acme%2Fplatform%2Fweb/issues',
      );
      expect(JSON.parse(init.body as string)).toEqual({
        title: 'first line',
        description: 'first line\nsecond line',
        labels: 'security,oasm',
      });
    });
  });
});
