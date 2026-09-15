import { AUTH_INSTANCE_KEY } from '@/common/constants/app.constants';
import { AuthGuard } from '@/common/guards/auth.guard';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { AssetsService } from './../src/modules/assets/assets.service';

/**
 * Real-surface e2e for GET /api/assets/url against real Postgres.
 *
 * Proofs:
 *  1. HTTP routing + guard: unauthenticated -> 401; authenticated unknown
 *     sibling -> 404 (control proving 401 is the guard, not a missing route);
 *     authenticated /api/assets/url -> 200 with the aggregated envelope.
 *  2. SQL: seeded workspace -> target -> asset -> 2 asset_services ->
 *     discovered_urls aggregates DISTINCT asset services per url.
 *  3. Single source: `discovered_urls` ONLY. A url known only to
 *     `http_responses` (an httpx probe target) must NOT be served and must
 *     NOT count toward total — that is the production bug this suite pins.
 *     A url present in BOTH tables for the same service is returned once.
 *  4. Row-expand regression: GET /api/assets?urls=<discovered url> must return
 *     the owning service (the tab expands a url row into a filtered asset list).
 *
 * All seeded rows are removed in afterAll (workspace cascade + user).
 */
describe('GET /api/assets/url (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let assetsService: AssetsService;
  let workspaceId: string;
  let userId: string;

  const stamp = Date.now();
  const email = `e2e-url-${stamp}@example.com`;
  const password = 'Password123!';
  const domain = `e2e-url-${stamp}.example.com`;
  const urlAdmin = `https://${domain}/admin`;
  const urlLogin = `https://${domain}/login`;
  /** Only in http_responses (httpx) -> must stay invisible to the url list. */
  const urlProbe = `https://${domain}/probe`;
  /** In BOTH tables for the same asset service -> must dedupe to one row. */
  const urlBoth = `https://${domain}/both`;
  let cookie = '';
  let server: App;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror production bootstrap: global 'api' prefix + the global AuthGuard
    // + the ValidationPipe that transforms scalar query params into arrays.
    app.setGlobalPrefix('api');
    app.useGlobalGuards(
      new AuthGuard(app.get(Reflector), app.get(AUTH_INSTANCE_KEY)),
    );
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    dataSource = app.get(DataSource);
    assetsService = app.get(AssetsService);

    // ── Sign up over real HTTP, capture the session cookie ──────────────
    const signUp = await request(server)
      .post('/api/auth/sign-up/email')
      .send({ email, password, name: 'E2E URL' })
      .expect(200);
    userId = (signUp.body as { user: { id: string } }).user.id;
    const setCookie = signUp.headers['set-cookie'] as unknown as
      | string[]
      | undefined;
    cookie = (setCookie ?? []).map((c) => c.split(';')[0]).join('; ');

    // ── Create the workspace over real HTTP (seeds '*' permission group) ─
    const ws = await request(server)
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .send({ name: `e2e-url-ws-${stamp}`, description: 'e2e' })
      .expect(201);
    workspaceId = (ws.body as { id: string }).id;

    // ── Seed discovered urls for the SQL aggregate proof ────────────────
    await dataSource.query(
      `
      WITH t AS (
        INSERT INTO targets (value, "workspaceId", type)
        VALUES ($1, $2, 'DOMAIN') RETURNING id
      ), a AS (
        INSERT INTO assets (value, "targetId")
        SELECT $1, id FROM t RETURNING id
      )
      INSERT INTO asset_services (value, port, "assetId")
      SELECT $1, p.port, a.id FROM a, (VALUES (443), (8443)) AS p(port)
      `,
      [domain, workspaceId],
    );
    // /admin on BOTH services -> assetCount 2
    await dataSource.query(
      `INSERT INTO discovered_urls (url, "assetServiceId")
       SELECT $1, id FROM asset_services WHERE value = $2`,
      [urlAdmin, domain],
    );
    // /login on ONE service -> assetCount 1
    await dataSource.query(
      `INSERT INTO discovered_urls (url, "assetServiceId")
       SELECT $1, id FROM asset_services WHERE value = $2 AND port = 443`,
      [urlLogin, domain],
    );
    // /both on the SAME service in BOTH tables -> still assetCount 1
    await dataSource.query(
      `INSERT INTO discovered_urls (url, "assetServiceId")
       SELECT $1, id FROM asset_services WHERE value = $2 AND port = 443`,
      [urlBoth, domain],
    );
    await dataSource.query(
      `INSERT INTO http_responses (url, "assetServiceId", failed)
       SELECT $1, id, false FROM asset_services WHERE value = $2 AND port = 443`,
      [urlBoth, domain],
    );
    // /probe ONLY in http_responses (the httpx source) -> must never surface.
    await dataSource.query(
      `INSERT INTO http_responses (url, "assetServiceId", failed)
       SELECT $1, id, false FROM asset_services WHERE value = $2 AND port = 8443`,
      [urlProbe, domain],
    );
    // NULL / empty url rows must be ignored (http_responses allows NULL;
    // discovered_urls.url is NOT NULL so only '' can be seeded there).
    await dataSource.query(
      `INSERT INTO discovered_urls (url, "assetServiceId")
       SELECT '', id FROM asset_services WHERE value = $1 AND port = 8443`,
      [domain],
    );
    await dataSource.query(
      `INSERT INTO http_responses (url, "assetServiceId", failed)
       SELECT NULL, id, false FROM asset_services WHERE value = $1 AND port = 8443`,
      [domain],
    );
    await dataSource.query(
      `INSERT INTO http_responses (url, "assetServiceId", failed)
       SELECT '', id, false FROM asset_services WHERE value = $1 AND port = 8443`,
      [domain],
    );
  });

  afterAll(async () => {
    if (workspaceId) {
      await dataSource.query(`DELETE FROM workspaces WHERE id = $1`, [
        workspaceId,
      ]);
      const leftover: { count: string }[] = await dataSource.query(
        `SELECT COUNT(*)::text AS count FROM targets WHERE "workspaceId" = $1`,
        [workspaceId],
      );
      expect(leftover[0].count).toBe('0');
    }
    if (userId) {
      await dataSource.query(`DELETE FROM sessions WHERE "userId" = $1`, [
        userId,
      ]);
      await dataSource.query(`DELETE FROM accounts WHERE "userId" = $1`, [
        userId,
      ]);
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    // No residual rows from the seeded domain may survive in either url table.
    const residue: { discovered: string; http: string }[] =
      await dataSource.query(
        `SELECT
           (SELECT COUNT(*)::text FROM discovered_urls WHERE url LIKE $1) AS discovered,
           (SELECT COUNT(*)::text FROM http_responses WHERE url LIKE $1) AS http`,
        [`%${domain}%`],
      );
    expect(residue[0].discovered).toBe('0');
    expect(residue[0].http).toBe('0');
    await app?.close();
  });

  it('returns 401 for unauthenticated requests (guard active)', async () => {
    await request(server).get('/api/assets/url').expect(401);
  });

  it('returns 404 for an authenticated unknown sibling route (control)', async () => {
    await request(server)
      .get(`/api/definitely-not-a-route-${stamp}`)
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(404);
  });

  it('serves only urls present in discovered_urls (http_responses excluded)', async () => {
    const res = await request(server)
      .get('/api/assets/url')
      .query({ page: 1, limit: 10, sortBy: 'assetCount', sortOrder: 'DESC' })
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    const body = res.body as {
      total: number;
      data: { url: string; assetCount: number }[];
    };
    // 3 distinct discovered urls: admin, login, both (deduped across tables).
    // /probe lives only in http_responses and must be absent from the count.
    expect(body.total).toBe(3);
    const byUrl = new Map(body.data.map((r) => [r.url, Number(r.assetCount)]));
    expect(byUrl.get(urlAdmin)).toBe(2);
    expect(byUrl.get(urlLogin)).toBe(1);
    // Present in both tables for one service -> exactly one row, count 1.
    expect(byUrl.get(urlBoth)).toBe(1);
    // The regression pin: an http_responses-only probe target is NOT a url.
    expect(byUrl.has(urlProbe)).toBe(false);
    expect(body.data.map((r) => r.url)).not.toContain(urlProbe);
    expect(body.data).toHaveLength(3);
    // NULL/'' urls must never surface as rows.
    expect(body.data.every((r) => r.url.length > 0)).toBe(true);
  });

  it('aggregates via the service over real Postgres (distinct asset services)', async () => {
    const result = await assetsService.getUrlAssets(
      {
        page: 1,
        limit: 10,
        sortBy: 'assetCount',
        sortOrder: 'DESC',
      } as never,
      workspaceId,
    );

    expect(result.total).toBe(3);
    const byUrl = new Map(
      result.data.map((row) => [row.url, Number(row.assetCount)]),
    );
    expect(byUrl.get(urlAdmin)).toBe(2);
    expect(byUrl.get(urlLogin)).toBe(1);
    expect(byUrl.get(urlBoth)).toBe(1);
    expect(byUrl.has(urlProbe)).toBe(false);
  });

  it('filters by url value (ILIKE)', async () => {
    const result = await assetsService.getUrlAssets(
      {
        page: 1,
        limit: 10,
        sortBy: 'assetCount',
        sortOrder: 'DESC',
        value: 'login',
      } as never,
      workspaceId,
    );

    expect(result.total).toBe(1);
    expect(result.data[0].url).toBe(urlLogin);
  });

  it('paginates without duplicated or skipped urls (limit=2)', async () => {
    const page1 = await assetsService.getUrlAssets(
      { page: 1, limit: 2, sortBy: 'url', sortOrder: 'ASC' } as never,
      workspaceId,
    );
    const page2 = await assetsService.getUrlAssets(
      { page: 2, limit: 2, sortBy: 'url', sortOrder: 'ASC' } as never,
      workspaceId,
    );

    expect(page1.total).toBe(3);
    expect(page2.total).toBe(3);
    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(1);
    const page1Urls = page1.data.map((r) => r.url);
    const page2Urls = page2.data.map((r) => r.url);
    expect(page1Urls.filter((u) => page2Urls.includes(u))).toEqual([]);
    expect([...page1Urls, ...page2Urls].sort()).toEqual(
      [urlAdmin, urlLogin, urlBoth].sort(),
    );
  });

  it('expands a discovered url into its owning service via GET /api/assets?urls=', async () => {
    const res = await request(server)
      .get('/api/assets')
      .query({ page: 1, limit: 10, urls: urlAdmin })
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    const body = res.body as {
      total: number;
      data: { value: string }[];
    };
    // The row-expand in the URLs tab filters by url; the owning services must
    // resolve (paginated asset list is NOT multiplied by url rows). urlAdmin
    // was seeded on both ports of the domain -> exactly 2 services, not more.
    expect(body.total).toBe(2);
    expect(body.data.every((r) => r.value === domain)).toBe(true);
  });

  it('returns an empty envelope for a workspace with no discovered urls', async () => {
    const other = await request(server)
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .send({ name: `e2e-url-empty-${stamp}`, description: 'e2e' })
      .expect(201);
    const emptyWorkspaceId = (other.body as { id: string }).id;

    const res = await request(server)
      .get('/api/assets/url')
      .query({ page: 1, limit: 10 })
      .set('Cookie', cookie)
      .set('X-Workspace-Id', emptyWorkspaceId)
      .expect(200);

    const body = res.body as { total: number; data: unknown[] };
    expect(body.total).toBe(0);
    expect(body.data).toEqual([]);

    await dataSource.query(`DELETE FROM workspaces WHERE id = $1`, [
      emptyWorkspaceId,
    ]);
  });
});
