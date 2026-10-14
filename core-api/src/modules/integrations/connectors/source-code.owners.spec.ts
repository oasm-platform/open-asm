import { GithubConnector } from './github.connector';
import { GitlabConnector } from './gitlab.connector';

type FetchCall = [string, RequestInit];

function jsonResponse(
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/**
 * Owner-scoped listing and namespace discovery — what GIT_ORG targets use.
 */
describe('source-code connectors: owners and organizations', () => {
  let fetchMock: jest.SpyInstance;
  const urls = () => (fetchMock.mock.calls as FetchCall[]).map(([u]) => u);

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  describe('GithubConnector', () => {
    const connector = new GithubConnector();
    const config = { apiToken: 'ghp_x' };

    it('lists an organization through /orgs/{org}/repos (private repos included)', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ login: 'acme', type: 'Organization' }))
        .mockResolvedValueOnce(jsonResponse([]));

      await connector.listRepositories(config, { owner: 'acme', page: 2, limit: 100 });

      expect(urls()[0]).toBe('https://api.github.com/users/acme');
      expect(urls()[1]).toMatch(
        /^https:\/\/api\.github\.com\/orgs\/acme\/repos\?per_page=100&page=2&sort=updated&type=all$/,
      );
    });

    it("lists the token's own user through /user/repos?affiliation=owner", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ login: 'Alice', type: 'User' }))
        .mockResolvedValueOnce(jsonResponse({ login: 'alice' }))
        .mockResolvedValueOnce(jsonResponse([]));

      await connector.listRepositories(config, { owner: 'alice', page: 1, limit: 100 });

      expect(urls()[2]).toContain('/user/repos?');
      expect(urls()[2]).toContain('affiliation=owner');
    });

    it('lists another user through /users/{user}/repos', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ login: 'bob', type: 'User' }))
        .mockResolvedValueOnce(jsonResponse({ login: 'alice' }))
        .mockResolvedValueOnce(jsonResponse([]));

      await connector.listRepositories(config, { owner: 'bob', page: 1, limit: 100 });

      expect(urls()[2]).toContain('/users/bob/repos?');
    });

    it('lists the user and its organizations with target values', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            login: 'Alice',
            name: 'Alice A.',
            html_url: 'https://github.com/Alice',
            avatar_url: 'https://avatars/alice',
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse([{ login: 'Acme', avatar_url: null }], {
            link: '<https://api.github.com/user/orgs?page=2>; rel="next"',
          }),
        )
        .mockResolvedValueOnce(jsonResponse([{ login: 'Globex' }]));

      const orgs = await connector.listOrganizations(config);

      expect(orgs).toEqual([
        {
          path: 'Alice',
          name: 'Alice A.',
          kind: 'user',
          url: 'https://github.com/Alice',
          avatarUrl: 'https://avatars/alice',
          targetValue: 'github.com/alice',
        },
        {
          path: 'Acme',
          name: 'Acme',
          kind: 'organization',
          url: 'https://github.com/Acme',
          avatarUrl: null,
          targetValue: 'github.com/acme',
        },
        expect.objectContaining({ path: 'Globex', targetValue: 'github.com/globex' }),
      ]);
    });

    it('derives target values from the Enterprise host', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ login: 'alice', html_url: 'https://ghe.acme.com/alice' }),
        )
        .mockResolvedValueOnce(jsonResponse([]));

      const orgs = await connector.listOrganizations({
        ...config,
        baseUrl: 'https://ghe.acme.com/api/v3',
      });

      expect(urls()[0]).toBe('https://ghe.acme.com/api/v3/user');
      expect(orgs[0].targetValue).toBe('ghe.acme.com/alice');
    });
  });

  describe('GitlabConnector', () => {
    const connector = new GitlabConnector();
    const config = { apiToken: 'glpat-x' };

    it('lists a group with its subgroups', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ kind: 'group', full_path: 'acme/platform' }))
        .mockResolvedValueOnce(jsonResponse([], { 'x-next-page': '' }));

      await connector.listRepositories(config, {
        owner: 'acme/platform',
        page: 1,
        limit: 100,
      });

      expect(urls()[0]).toBe('https://gitlab.com/api/v4/namespaces/acme%2Fplatform');
      expect(urls()[1]).toContain('/api/v4/groups/acme%2Fplatform/projects?');
      expect(urls()[1]).toContain('include_subgroups=true');
      expect(urls()[1]).not.toContain('membership');
    });

    it('lists a user namespace through /users/{user}/projects', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ kind: 'user', full_path: 'alice' }))
        .mockResolvedValueOnce(jsonResponse([], { 'x-next-page': '' }));

      await connector.listRepositories(config, { owner: 'alice', page: 1, limit: 100 });

      expect(urls()[1]).toContain('/api/v4/users/alice/projects?');
    });

    it('reports forks', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          [
            {
              id: 1,
              name: 'web',
              path_with_namespace: 'acme/web',
              web_url: 'https://gitlab.com/acme/web',
              forked_from_project: { id: 9 },
            },
          ],
          { 'x-next-page': '' },
        ),
      );

      const page = await connector.listRepositories(config, { page: 1, limit: 20 });

      expect(page.data[0].fork).toBe(true);
    });

    it('lists the user and its groups with target values on a self-managed host', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ username: 'alice', name: 'Alice', web_url: 'https://git.acme.com/alice' }),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            [{ full_path: 'Platform/Backend', full_name: 'Platform / Backend' }],
            { 'x-next-page': '' },
          ),
        );

      const orgs = await connector.listOrganizations({
        ...config,
        baseUrl: 'https://git.acme.com',
      });

      expect(urls()[1]).toContain('/groups?min_access_level=10');
      expect(orgs.map((o) => [o.kind, o.targetValue])).toEqual([
        ['user', 'git.acme.com/alice'],
        ['group', 'git.acme.com/platform/backend'],
      ]);
    });
  });
});
