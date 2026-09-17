import { VercelConnector, VercelSyncError } from './vercel.connector';

/**
 * Vercel connector transport + discovery tests (SC-VC-*).
 * Global fetch is mocked and the connector's `sleep` is spied on, so the suite
 * is deterministic and never performs real network/timer waits. DB services
 * are mocked plain objects — todo 1 performs no persistence, so they are only
 * asserted to stay UNTOUCHED.
 */

const PROJECT_A = { id: 'prj_a', name: 'site-a' };
const PROJECT_B = { id: 'prj_b', name: 'site-b' };

function mockResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
    json: () => Promise.resolve(body),
    text: () =>
      Promise.resolve(
        typeof body === 'string' ? body : JSON.stringify(body ?? {}),
      ),
  } as unknown as Response;
}

/** Object-form (paginated) projects payload; omit `next` for a terminal page. */
function projectsPage(
  projects: unknown[],
  next?: string | number | null,
): unknown {
  return next === undefined
    ? { projects, pagination: {} }
    : { projects, pagination: { next } };
}

/** Object-form domains payload; omit `next` for a terminal page. */
function domainsPage(
  domains: unknown[],
  next?: string | number | null,
): unknown {
  return next === undefined
    ? { domains, pagination: {} }
    : { domains, pagination: { next } };
}

interface DomainOverrides {
  name?: string;
  apexName?: string;
  verified?: boolean;
  redirect?: string;
  gitBranch?: string;
  customEnvironmentId?: string;
}

function domain(overrides: DomainOverrides = {}): unknown {
  return {
    name: 'www.example.com',
    apexName: 'example.com',
    verified: true,
    ...overrides,
  };
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    apiToken: 'vercel-token',
    workspaceId: 'ws-1',
    integrationId: 'integration-1',
    targetsService: {
      findByWorkspaceAndValues: jest.fn().mockResolvedValue([]),
      createMultipleTargets: jest.fn().mockResolvedValue({
        created: [{ id: 'target-created', value: 'example.com' }],
        skipped: [],
        totalRequested: 1,
        totalCreated: 1,
        totalSkipped: 0,
      }),
    },
    dataAdapterService: {
      upsertAssetsByTargetId: jest.fn().mockResolvedValue(0),
    },
    actingUserContext: { id: 'user-1', userId: 'user-1' },
    ...overrides,
  };
}

function urlsOf(mockFetch: jest.SpyInstance): string[] {
  return mockFetch.mock.calls.map((call) => String(call[0]));
}

describe('VercelConnector', () => {
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    mockFetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(mockResponse(projectsPage([])));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('beforeExecute', () => {
    it('SC-VC-1: rejects when apiToken is absent', () => {
      const connector = new VercelConnector();
      expect(() => connector.beforeExecute({ workspaceId: 'ws-1' })).toThrow(
        'Vercel sync requires apiToken in config',
      );
    });

    it('SC-VC-1a: resolves when apiToken is present', async () => {
      const connector = new VercelConnector();
      await expect(connector.beforeExecute(makeConfig())).resolves.toBeUndefined();
    });
  });

  describe('syncAssets — happy path', () => {
    it('SC-VC-2: two projects (one domain each) → counts, no cap, zero DB writes', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(
          mockResponse(projectsPage([PROJECT_A, PROJECT_B])),
        )
        .mockResolvedValueOnce(
          mockResponse(domainsPage([domain()])),
        )
        .mockResolvedValueOnce(
          mockResponse(
            domainsPage([
              domain({ name: 'www.example.net', apexName: 'example.net' }),
            ]),
          ),
        );

      const config = makeConfig();
      const result = await connector.syncAssets(config);

      expect(result).toEqual({
        projects: 2,
        domains: 2,
        truncated: false,
        targetsCreated: 2,
        assetsUpserted: 0,
      });

      const urls = urlsOf(mockFetch);
      expect(urls[0]).toContain('/v10/projects?limit=100');
      expect(urls[1]).toContain('/v9/projects/prj_a/domains?');
      expect(urls[2]).toContain('/v9/projects/prj_b/domains?');

      // Two distinct apexes → two target lookups/creates and two upserts.
      expect(config.targetsService.findByWorkspaceAndValues).toHaveBeenCalledTimes(2);
      expect(config.targetsService.createMultipleTargets).toHaveBeenCalledTimes(2);
      expect(
        config.dataAdapterService.upsertAssetsByTargetId,
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('dry-run probe', () => {
    it('SC-VC-3: __dryRun issues exactly one /v10/projects?limit=1 fetch and zero service calls', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch.mockResolvedValueOnce(mockResponse([]));

      const config = makeConfig({ __dryRun: true });
      const result = await connector.syncAssets(config);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(String(mockFetch.mock.calls[0][0])).toBe(
        'https://api.vercel.com/v10/projects?limit=1',
      );
      expect(result).toEqual({
        projects: 0,
        domains: 0,
        truncated: false,
        targetsCreated: 0,
        assetsUpserted: 0,
        tokenStatus: 'active',
      });

      expect(config.targetsService.findByWorkspaceAndValues).not.toHaveBeenCalled();
      expect(config.targetsService.createMultipleTargets).not.toHaveBeenCalled();
      expect(
        config.dataAdapterService.upsertAssetsByTargetId,
      ).not.toHaveBeenCalled();
    });
  });

  describe('teamId', () => {
    it('SC-VC-4: teamId is appended to the dry-run probe when configured', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch.mockResolvedValueOnce(mockResponse([]));

      await connector.syncAssets(makeConfig({ __dryRun: true, teamId: 'team_abc' }));

      expect(String(mockFetch.mock.calls[0][0])).toBe(
        'https://api.vercel.com/v10/projects?limit=1&teamId=team_abc',
      );
    });

    it('SC-VC-5: teamId is appended to both endpoint kinds, and absent when unset', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(projectsPage([PROJECT_A])))
        .mockResolvedValueOnce(mockResponse(domainsPage([])));

      await connector.syncAssets(makeConfig({ teamId: 'team_abc' }));

      const urls = urlsOf(mockFetch);
      expect(urls[0]).toBe(
        'https://api.vercel.com/v10/projects?limit=100&teamId=team_abc',
      );
      expect(urls[1]).toContain('/domains?');
      expect(urls[1]).toContain('&teamId=team_abc');
    });

    it('SC-VC-5a: no teamId → no teamId query parameter anywhere', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(projectsPage([PROJECT_A])))
        .mockResolvedValueOnce(mockResponse(domainsPage([])));

      await connector.syncAssets(makeConfig());

      for (const url of urlsOf(mockFetch)) {
        expect(url).not.toContain('teamId');
      }
    });
  });

  describe('pagination', () => {
    it('SC-VC-6: a STRING pagination.next is echoed verbatim into from=', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(
          mockResponse(projectsPage([PROJECT_A], 'cursor-abc')),
        )
        .mockResolvedValueOnce(
          mockResponse(projectsPage([PROJECT_B], null)),
        )
        .mockResolvedValueOnce(mockResponse(domainsPage([])))
        .mockResolvedValueOnce(mockResponse(domainsPage([])));

      const result = await connector.syncAssets(makeConfig());

      const projectUrls = urlsOf(mockFetch).filter((url) =>
        url.includes('/v10/projects'),
      );
      expect(projectUrls).toHaveLength(2);
      expect(projectUrls[1]).toBe(
        'https://api.vercel.com/v10/projects?limit=100&from=cursor-abc',
      );
      expect(result.projects).toBe(2);
    });

    it('SC-VC-7: a NUMERIC pagination.next is echoed verbatim into from= (no coercion)', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(
          mockResponse(projectsPage([PROJECT_A], 1_700_000_000_000)),
        )
        .mockResolvedValueOnce(mockResponse(projectsPage([PROJECT_B], null)))
        .mockResolvedValueOnce(mockResponse(domainsPage([])))
        .mockResolvedValueOnce(mockResponse(domainsPage([])));

      await connector.syncAssets(makeConfig());

      const projectUrls = urlsOf(mockFetch).filter((url) =>
        url.includes('/v10/projects'),
      );
      expect(projectUrls[1]).toBe(
        'https://api.vercel.com/v10/projects?limit=100&from=1700000000000',
      );
    });

    it('SC-VC-8: domains pagination.next becomes until= and the base URL carries order=DESC', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(projectsPage([PROJECT_A])))
        .mockResolvedValueOnce(
          mockResponse(
            domainsPage([domain()], 1_700_000_000_000),
          ),
        )
        .mockResolvedValueOnce(
          mockResponse(
            domainsPage([
              domain({ name: 'api.example.com', apexName: 'example.com' }),
            ]),
          ),
        );

      const result = await connector.syncAssets(makeConfig());

      const domainUrls = urlsOf(mockFetch).filter((url) =>
        url.includes('/domains'),
      );
      expect(domainUrls).toHaveLength(2);
      expect(domainUrls[0]).toContain(
        '/v9/projects/prj_a/domains?production=true&verified=true&redirects=false&limit=100&order=DESC',
      );
      expect(domainUrls[1]).toContain('until=1700000000000');
      expect(result.projects).toBe(1);
      expect(result.domains).toBe(2);
    });

    it('SC-VC-9: a repeated projects cursor throws the repeat-guard error instead of looping', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(
          mockResponse(projectsPage([PROJECT_A], 'same-cursor')),
        )
        .mockResolvedValueOnce(
          mockResponse(projectsPage([], 'same-cursor')),
        );

      const error = await connector
        .syncAssets(makeConfig())
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(VercelSyncError);
      expect((error as Error).message).toContain('cursor did not advance');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('SC-VC-10: a repeated domains cursor throws the repeat-guard error', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(projectsPage([PROJECT_A])))
        .mockResolvedValueOnce(mockResponse(domainsPage([], 111)))
        .mockResolvedValueOnce(mockResponse(domainsPage([], 111)));

      const error = await connector
        .syncAssets(makeConfig())
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(VercelSyncError);
      expect((error as Error).message).toContain('cursor did not advance');
    });
  });

  describe('truncation + caps', () => {
    it('SC-VC-11: a bare-array projects response of length PROJECTS_PAGE_SIZE sets truncated and stops', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      const fullPage = Array.from({ length: 100 }, (_, i) => ({
        id: `prj_${i}`,
        name: `site-${i}`,
      }));

      mockFetch.mockImplementation((url: unknown) => {
        if (String(url).includes('/v10/projects')) {
          return Promise.resolve(mockResponse(fullPage));
        }
        return Promise.resolve(mockResponse(domainsPage([])));
      });

      const result = await connector.syncAssets(makeConfig());

      expect(result.projects).toBe(100);
      expect(result.truncated).toBe(true);
      const projectUrls = urlsOf(mockFetch).filter((url) =>
        url.includes('/v10/projects'),
      );
      expect(projectUrls).toHaveLength(1);
    });

    it('SC-VC-12: a shorter bare-array projects response completes without truncation', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch.mockImplementation((url: unknown) => {
        if (String(url).includes('/v10/projects')) {
          return Promise.resolve(mockResponse([PROJECT_A, PROJECT_B]));
        }
        return Promise.resolve(mockResponse(domainsPage([])));
      });

      const result = await connector.syncAssets(makeConfig());

      expect(result.projects).toBe(2);
      expect(result.truncated).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('SC-VC-13: exceeding MAX_PROJECT_PAGES throws VercelSyncError', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      let projectCalls = 0;
      mockFetch.mockImplementation((url: unknown) => {
        if (String(url).includes('/v10/projects')) {
          projectCalls++;
          // Always a fresh advancing cursor → only the hard cap can stop it.
          return Promise.resolve(
            mockResponse(projectsPage([], projectCalls)),
          );
        }
        return Promise.resolve(mockResponse(domainsPage([])));
      });

      const error = await connector
        .syncAssets(makeConfig())
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(VercelSyncError);
      expect((error as Error).message).toContain('projects page cap exceeded');
      expect(projectCalls).toBe(2000);
    });

    it('SC-VC-14: exceeding MAX_DOMAIN_PAGES_PER_PROJECT throws VercelSyncError', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      let domainCalls = 0;
      mockFetch.mockImplementation((url: unknown) => {
        if (String(url).includes('/v10/projects')) {
          return Promise.resolve(mockResponse([PROJECT_A]));
        }
        domainCalls++;
        return Promise.resolve(mockResponse(domainsPage([], domainCalls)));
      });

      const error = await connector
        .syncAssets(makeConfig())
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(VercelSyncError);
      expect((error as Error).message).toContain('domains page cap exceeded');
      expect(domainCalls).toBe(1000);
    });

    it('SC-VC-15: an exhausted maxSyncDurationMs truncates and stops mid-pagination', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      // startedAt, projects iter-1 top, projects iter-2 top, domains iter-1 top.
      const times = [1_000_000, 1_000_000, 2_000_000, 2_000_000];
      jest
        .spyOn(Date, 'now')
        .mockImplementation(() => times.shift() ?? 2_000_000);

      mockFetch.mockImplementation((url: unknown) => {
        if (String(url).includes('/v10/projects')) {
          return Promise.resolve(
            mockResponse(projectsPage([PROJECT_A], 'next-cursor')),
          );
        }
        return Promise.resolve(mockResponse(domainsPage([])));
      });

      const result = await connector.syncAssets(
        makeConfig({ maxSyncDurationMs: 1000 }),
      );

      expect(result.truncated).toBe(true);
      expect(result.projects).toBe(1);
      expect(result.domains).toBe(0);
      // The second projects page (the pagination follow-up) was never fetched,
      // and neither was any domains page.
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('exclusion + apex validation', () => {
    it('SC-VC-16: .vercel.app (by name or apexName) and wildcard hosts are excluded from grouping', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(projectsPage([PROJECT_A])))
        .mockResolvedValueOnce(
          mockResponse(
            domainsPage([
              domain({ name: 'www.example.com', apexName: 'example.com' }),
              domain({ name: 'app.vercel.app', apexName: 'example.com' }),
              domain({
                name: 'preview.myteam.vercel.app',
                apexName: 'myteam.vercel.app',
              }),
              domain({ name: '*.example.com', apexName: 'example.com' }),
            ]),
          ),
        );

      const result = await connector.syncAssets(makeConfig());

      expect(result.projects).toBe(1);
      expect(result.domains).toBe(1);
    });

    it('SC-VC-17: unverified / redirect / branch / custom-environment rows are excluded', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(projectsPage([PROJECT_A])))
        .mockResolvedValueOnce(
          mockResponse(
            domainsPage([
              domain({ name: 'www.example.com', apexName: 'example.com' }),
              domain({
                name: 'unverified.example.com',
                apexName: 'example.com',
                verified: false,
              }),
              domain({
                name: 'redirect.example.com',
                apexName: 'example.com',
                redirect: 'www.example.com',
              }),
              domain({
                name: 'branch.example.com',
                apexName: 'example.com',
                gitBranch: 'preview',
              }),
              domain({
                name: 'env.example.com',
                apexName: 'example.com',
                customEnvironmentId: 'env_1',
              }),
            ]),
          ),
        );

      const result = await connector.syncAssets(makeConfig());

      expect(result.domains).toBe(1);
    });

    it('SC-VC-18: an invalid apex and the bare `vercel.app` grouping key are skipped', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(projectsPage([PROJECT_A])))
        .mockResolvedValueOnce(
          mockResponse(
            domainsPage([
              domain({ name: 'a.example.com', apexName: 'example.com' }),
              // Not a valid apex (no dot + TLD) → the whole group is skipped.
              domain({ name: 'x.invalid', apexName: 'invalid' }),
              // Rows whose name passes the exclusion regex but whose apex is the
              // generated base domain must not create a group.
              domain({ name: 'notvercel.app', apexName: 'vercel.app' }),
            ]),
          ),
        );

      const result = await connector.syncAssets(makeConfig());

      expect(result.domains).toBe(1);
    });
  });

  describe('retry + timeout', () => {
    it('SC-VC-19: 429 with error.limit.resetMs retries using the derived clamped delay', async () => {
      const connector = new VercelConnector();
      const sleepSpy = jest
        .spyOn(connector as any, 'sleep')
        .mockResolvedValue(undefined);
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      mockFetch
        .mockResolvedValueOnce(
          mockResponse(
            { error: { limit: { resetMs: 1_012_000 } } },
            429,
          ),
        )
        .mockResolvedValueOnce(mockResponse([]));

      const result = await connector.syncAssets(makeConfig({ __dryRun: true }));

      expect(result.tokenStatus).toBe('active');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenCalledWith(12_000); // (1_012_000 - 1_000_000)ms
    });

    it('SC-VC-20: 429 with only error.limit.reset derives a bounded delay from epoch seconds', async () => {
      const connector = new VercelConnector();
      const sleepSpy = jest
        .spyOn(connector as any, 'sleep')
        .mockResolvedValue(undefined);
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      mockFetch
        .mockResolvedValueOnce(
          mockResponse({ error: { limit: { reset: 1007 } } }, 429),
        )
        .mockResolvedValueOnce(mockResponse([]));

      await connector.syncAssets(makeConfig({ __dryRun: true }));

      expect(sleepSpy).toHaveBeenCalledWith(7_000); // 1007 - 1000s
    });

    it('SC-VC-21: the derived resetMs delay is clamped to [1s, 60s]', async () => {
      const connector = new VercelConnector();
      const sleepSpy = jest
        .spyOn(connector as any, 'sleep')
        .mockResolvedValue(undefined);
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      mockFetch
        .mockResolvedValueOnce(
          mockResponse(
            { error: { limit: { resetMs: 1_000_000 + 999_000 } } },
            429,
          ),
        )
        .mockResolvedValueOnce(mockResponse([]));

      await connector.syncAssets(makeConfig({ __dryRun: true }));

      expect(sleepSpy).toHaveBeenCalledWith(60_000); // clamped from 999s
    });

    it('SC-VC-22: a non-JSON 429 body retries with the default delay and never throws a parse error', async () => {
      const connector = new VercelConnector();
      const sleepSpy = jest
        .spyOn(connector as any, 'sleep')
        .mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(
          mockResponse('<html>rate limited</html>', 429),
        )
        .mockResolvedValueOnce(mockResponse([]));

      const result = await connector.syncAssets(makeConfig({ __dryRun: true }));

      expect(result.tokenStatus).toBe('active');
      expect(sleepSpy).toHaveBeenCalledWith(5_000);
    });

    it('SC-VC-23: 401 rejects with VercelSyncError carrying the status and body snippet, no retry', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: { message: 'invalid access token' } }, 401),
      );

      const error = await connector
        .syncAssets(makeConfig({ __dryRun: true }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(VercelSyncError);
      expect((error as Error).message).toContain('401');
      expect((error as Error).message).toContain('invalid access token');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('SC-VC-24: 403 rejects with VercelSyncError', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: { message: 'forbidden' } }, 403),
      );

      const error = await connector
        .syncAssets(makeConfig({ __dryRun: true }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(VercelSyncError);
      expect((error as Error).message).toContain('403');
    });

    it('SC-VC-25: a persistent 5xx exhausts MAX_REQUEST_ATTEMPTS and rejects with the 5xx default delay', async () => {
      const connector = new VercelConnector();
      const sleepSpy = jest
        .spyOn(connector as any, 'sleep')
        .mockResolvedValue(undefined);

      mockFetch.mockResolvedValue(mockResponse('upstream boom', 503));

      const error = await connector
        .syncAssets(makeConfig({ __dryRun: true }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(VercelSyncError);
      expect((error as Error).message).toContain('503');
      expect((error as Error).message).toContain('boom');
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(sleepSpy).toHaveBeenCalledWith(2_000); // 5xx default
    });

    it('SC-VC-26: an abort/timeout rejection surfaces as VercelSyncError and the request carries a signal + bearer auth', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      let init: RequestInit | undefined;
      mockFetch.mockImplementationOnce(
        (_url: unknown, requestInit?: RequestInit) => {
          init = requestInit;
          return Promise.reject(
            new DOMException(
              'The operation was aborted due to timeout',
              'TimeoutError',
            ),
          );
        },
      );

      const error = await connector
        .syncAssets(makeConfig({ __dryRun: true }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(VercelSyncError);
      expect((error as Error).message).toContain('Vercel API request failed');
      expect(init).toEqual(
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(init?.headers).toEqual({ Authorization: 'Bearer vercel-token' });
    });
  });

  describe('malformed payloads', () => {
    it('SC-VC-27: a null projects body does not throw and yields zero counts', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      // 200 with a `null` JSON body → treated as zero projects, stop.
      mockFetch.mockResolvedValueOnce(mockResponse(null));

      const result = await connector.syncAssets(makeConfig());

      expect(result.projects).toBe(0);
      expect(result.domains).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it('SC-VC-27a: a domains body that omits `domains` entirely does not throw', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(mockResponse(projectsPage([PROJECT_A])))
        .mockResolvedValueOnce(mockResponse({ pagination: {} }));

      const result = await connector.syncAssets(makeConfig());

      expect(result.projects).toBe(1);
      expect(result.domains).toBe(0);
    });

    it('SC-VC-28: an empty pagination object terminates pagination', async () => {
      const connector = new VercelConnector();
      jest.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce(
          mockResponse({ projects: [PROJECT_A], pagination: {} }),
        )
        .mockResolvedValueOnce(
          mockResponse({ domains: [], pagination: {} }),
        );

      const result = await connector.syncAssets(makeConfig());

      expect(result.projects).toBe(1);
      expect(result.domains).toBe(0);
    });
  });
});
