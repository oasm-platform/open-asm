import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import * as request from 'supertest';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { cleanupE2eData, createUserWithWorkspace } from './helpers/workspace';

/**
 * Compiled asset filter tree (every field x allowed operator) against real
 * Postgres, through the real HTTP pipeline.
 */
describe('Asset filter tree (e2e)', () => {
  jest.setTimeout(120_000);

  let app: TestApp;
  let server: App;
  let dataSource: DataSource;
  let headers: Record<string, string>;
  let otherHeaders: Record<string, string>;
  let workspaceIds: string[] = [];
  let userIds: string[] = [];

  const domain = `e2e-filter-${Date.now()}.example.com`;
  const hostA = `alpha.${domain}`;
  const hostB = `beta.${domain}`;
  let svcA: string;
  let svcB: string;
  let groupId: string;

  const insertOne = async (sql: string, params: unknown[]): Promise<string> => {
    const rows: { id: string }[] = await dataSource.query(sql, params);
    return rows[0].id;
  };

  const seedService = async (
    targetId: string,
    s: {
      host: string;
      port: string;
      ip: string;
      tech: [string, string | null];
      url: string;
      status: number;
      tls: string;
      tag: string;
    },
  ) => {
    const assetId = await insertOne(
      `INSERT INTO assets (value, "targetId", "isPrimary") VALUES ($1, $2, false) RETURNING id`,
      [s.host, targetId],
    );
    const serviceId = await insertOne(
      `INSERT INTO asset_services (value, port, "assetId") VALUES ($1, $2, $3) RETURNING id`,
      [s.host, s.port, assetId],
    );
    const respId = await insertOne(
      `INSERT INTO http_responses ("assetServiceId", failed, status_code) VALUES ($1, false, $2) RETURNING id`,
      [serviceId, s.status],
    );
    await dataSource.query(
      `INSERT INTO ip_observations ("assetId", ip, source) VALUES ($1, $2, 'dns_a')`,
      [assetId, s.ip],
    );
    await dataSource.query(
      `INSERT INTO http_response_technologies ("httpResponseId", "assetServiceId", name, version) VALUES ($1, $2, $3, $4)`,
      [respId, serviceId, s.tech[0], s.tech[1]],
    );
    await dataSource.query(
      `INSERT INTO discovered_urls (url, "assetServiceId") VALUES ($1, $2)`,
      [s.url, serviceId],
    );
    await dataSource.query(
      `INSERT INTO http_status_codes ("httpResponseId", "assetServiceId", "statusCode", "isPrimary") VALUES ($1, $2, $3, true)`,
      [respId, serviceId, s.status],
    );
    await dataSource.query(
      `INSERT INTO tls_certificates ("httpResponseId", "assetServiceId", host) VALUES ($1, $2, $3)`,
      [respId, serviceId, s.tls],
    );
    await dataSource.query(
      `INSERT INTO asset_services_tags (tag, "assetServiceId") VALUES ($1, $2)`,
      [s.tag, serviceId],
    );
    return { assetId, serviceId };
  };

  const listIds = async (
    path: string,
    filter?: unknown,
    extra: Record<string, string> = {},
    hdrs = headers,
  ): Promise<string[]> => {
    const res = await request(server)
      .get(path)
      .query({
        limit: 50,
        ...extra,
        ...(filter === undefined ? {} : { filter: JSON.stringify(filter) }),
      })
      .set(hdrs)
      .expect(200);
    return (res.body as { data: { id: string }[] }).data.map((r) => r.id);
  };

  const and = (...items: unknown[]) => ({ logic: 'and', items });

  beforeAll(async () => {
    app = await createTestApp();
    server = app.server;
    dataSource = app.dataSource;

    const ctx = await createUserWithWorkspace(app.server, 'filter');
    headers = ctx.headers;
    const ctx2 = await createUserWithWorkspace(app.server, 'filter2');
    otherHeaders = ctx2.headers;
    workspaceIds = [ctx.workspace.id, ctx2.workspace.id];
    userIds = [ctx.user.userId, ctx2.user.userId];

    const targetId = await insertOne(
      `INSERT INTO targets (value, "workspaceId", type) VALUES ($1, $2, 'DOMAIN') RETURNING id`,
      [domain, ctx.workspace.id],
    );
    const a = await seedService(targetId, {
      host: hostA,
      port: '8080',
      ip: '192.0.2.10',
      tech: ['Nginx', '1.25'],
      url: `https://${hostA}/login`,
      status: 200,
      tls: `tls-a.${domain}`,
      tag: 'env%prod',
    });
    const b = await seedService(targetId, {
      host: hostB,
      port: '9090',
      ip: '198.51.100.20',
      tech: ['Apache', null],
      url: `https://${hostB}/admin`,
      status: 404,
      tls: `tls-b.${domain}`,
      tag: 'env_prod',
    });
    svcA = a.serviceId;
    svcB = b.serviceId;

    groupId = await insertOne(
      `INSERT INTO asset_groups (name, "workspaceId") VALUES ($1, $2) RETURNING id`,
      ['e2e-filter-group', ctx.workspace.id],
    );
    await dataSource.query(
      `INSERT INTO assets_group_assets ("assetGroupId", "assetId") VALUES ($1, $2)`,
      [groupId, a.assetId],
    );
  });

  afterAll(async () => {
    await cleanupE2eData(dataSource, { workspaceIds, userIds });
    await closeTestApp(app.app);
  });

  type Case = [string, string, string | string[], 'A' | 'B' | 'AB' | ''];
  const cases = (): Case[] => [
    ['host', 'eq', hostA, 'A'],
    ['host', 'neq', hostA, 'B'],
    ['host', 'contains', 'alpha', 'A'],
    ['host', 'notContains', 'alpha', 'B'],
    ['host', 'in', [hostA, 'nope.example.com'], 'A'],
    ['host', 'notIn', [hostA], 'B'],
    ['port', 'eq', '8080', 'A'],
    ['port', 'neq', '8080', 'B'],
    ['port', 'in', ['8080', '1'], 'A'],
    ['port', 'notIn', ['8080'], 'B'],
    ['ip', 'eq', '192.0.2.10', 'A'],
    ['ip', 'neq', '192.0.2.10', 'B'],
    ['ip', 'in', ['192.0.2.10', '10.9.9.9'], 'A'],
    ['ip', 'notIn', ['192.0.2.10'], 'B'],
    ['ip', 'inSubnet', ['192.0.2.0/24'], 'A'],
    ['ip', 'inSubnet', ['192.0.2.77/24'], 'A'],
    ['ip', 'inSubnet', ['192.0.2.0/24', '198.51.100.0/24'], 'AB'],
    ['tech', 'eq', 'Nginx', 'A'],
    ['tech', 'eq', 'Nginx:1.25', 'A'],
    ['tech', 'neq', 'Nginx', 'B'],
    ['tech', 'contains', 'ngi', 'A'],
    ['tech', 'in', ['Nginx:1.25'], 'A'],
    ['tech', 'notIn', ['Nginx'], 'B'],
    ['url', 'eq', `https://${hostA}/login`, 'A'],
    ['url', 'in', [`https://${hostA}/login`, 'https://nope/x'], 'A'],
    ['url', 'notIn', [`https://${hostA}/login`], 'B'],
    ['url', 'contains', 'login', 'A'],
    ['url', 'notContains', 'login', 'B'],
    ['statusCode', 'eq', '200', 'A'],
    ['statusCode', 'neq', '200', 'B'],
    ['statusCode', 'in', ['200', '301'], 'A'],
    ['statusCode', 'notIn', ['200'], 'B'],
    ['tlsHost', 'eq', `tls-a.${domain}`, 'A'],
    ['tlsHost', 'neq', `tls-a.${domain}`, 'B'],
    ['tlsHost', 'contains', 'tls-a', 'A'],
    ['tlsHost', 'in', [`tls-a.${domain}`], 'A'],
    ['tag', 'eq', 'env%prod', 'A'],
    ['tag', 'neq', 'env%prod', 'B'],
    ['tag', 'contains', 'env', 'AB'],
    ['tag', 'in', ['env%prod'], 'A'],
    ['tag', 'notIn', ['env%prod'], 'B'],
    // LIKE metacharacters are literal.
    ['tag', 'contains', '%', 'A'],
    ['tag', 'contains', '_', 'B'],
    ['tag', 'contains', 'v%p', 'A'],
    ['tag', 'contains', 'v_p', 'B'],
    ['host', 'contains', '%', ''],
    ['assetGroup', 'eq', 'GROUP', 'A'],
    ['assetGroup', 'neq', 'GROUP', 'B'],
    ['assetGroup', 'in', ['GROUP'], 'A'],
    ['assetGroup', 'notIn', ['GROUP'], 'B'],
  ];

  const expected = (e: string) => [
    ...(e.includes('A') ? [svcA] : []),
    ...(e.includes('B') ? [svcB] : []),
  ];
  const resolve = (v: string | string[]) =>
    Array.isArray(v) ? v.map((x) => (x === 'GROUP' ? groupId : x)) : v === 'GROUP' ? groupId : v;

  it.each(cases().map((c) => [`${c[0]} ${c[1]} ${JSON.stringify(c[2])}`, c]))(
    '%s',
    async (_name, c) => {
      const [field, op, value, exp] = c;
      const ids = await listIds(
        '/api/assets',
        and({ field, op, value: resolve(value) }),
      );
      expect([...ids].sort()).toEqual(expected(exp).sort());
    },
  );

  it('supports an OR group inside an AND root', async () => {
    const filter = and(
      { field: 'port', op: 'in', value: ['8080', '9090'] },
      {
        logic: 'or',
        conditions: [
          { field: 'host', op: 'eq', value: hostA },
          { field: 'statusCode', op: 'eq', value: '404' },
        ],
      },
    );
    expect((await listIds('/api/assets', filter)).sort()).toEqual(
      [svcA, svcB].sort(),
    );
    const narrowed = and(
      { field: 'port', op: 'eq', value: '9090' },
      {
        logic: 'or',
        conditions: [
          { field: 'host', op: 'eq', value: hostA },
          { field: 'tag', op: 'eq', value: 'env%prod' },
        ],
      },
    );
    expect(await listIds('/api/assets', narrowed)).toEqual([]);
  });

  it('keeps legacy params working and ANDs them with the filter', async () => {
    expect(await listIds('/api/assets', undefined, { hosts: hostA })).toEqual([
      svcA,
    ]);
    expect(
      await listIds(
        '/api/assets',
        and({ field: 'host', op: 'eq', value: hostB }),
        { hosts: hostA },
      ),
    ).toEqual([]);
    expect(
      await listIds(
        '/api/assets',
        and({ field: 'port', op: 'eq', value: '8080' }),
        { hosts: hostA },
      ),
    ).toEqual([svcA]);
  });

  it('serves /tls and /tags with a filter', async () => {
    const tls = await request(server)
      .get('/api/assets/tls')
      .query({
        filter: JSON.stringify(and({ field: 'host', op: 'eq', value: hostA })),
      })
      .set(headers)
      .expect(200);
    const tlsHosts = (tls.body as { data: { host: string }[] }).data.map(
      (r) => r.host,
    );
    expect(tlsHosts).toEqual([`tls-a.${domain}`]);

    const tags = await request(server)
      .get('/api/assets/tags')
      .set(headers)
      .expect(200);
    const rows = (
      tags.body as { data: { tag: string; assetCount: number | string }[] }
    ).data;
    expect(rows.map((r) => r.tag).sort()).toEqual(['env%prod', 'env_prod']);
    expect(Number(rows.find((r) => r.tag === 'env%prod')?.assetCount)).toBe(1);

    const filtered = await request(server)
      .get('/api/assets/tags')
      .query({
        filter: JSON.stringify(and({ field: 'host', op: 'eq', value: hostA })),
      })
      .set(headers)
      .expect(200);
    expect(
      (filtered.body as { data: { tag: string }[] }).data.map((r) => r.tag),
    ).toEqual(['env%prod']);
  });

  it.each(['ip', 'host', 'port', 'url', 'tech', 'status-code'])(
    'serves grouped endpoint /%s with a filter',
    async (path) => {
      await request(server)
        .get(`/api/assets/${path}`)
        .query({
          limit: 50,
          filter: JSON.stringify(
            and(
              { field: 'host', op: 'contains', value: 'alpha' },
              { field: 'tag', op: 'contains', value: 'env' },
            ),
          ),
        })
        .set(headers)
        .expect(200);
    },
  );

  it.each([
    ['malformed JSON', '{bad'],
    [
      'unknown field',
      JSON.stringify(and({ field: 'nope', op: 'eq', value: 'a' })),
    ],
    [
      'bad CIDR',
      JSON.stringify(and({ field: 'ip', op: 'inSubnet', value: ['1.2.3.4/99'] })),
    ],
    [
      'IPv6 zone id',
      JSON.stringify(and({ field: 'ip', op: 'eq', value: 'fe80::1%eth0' })),
    ],
    [
      'disallowed operator',
      JSON.stringify(and({ field: 'port', op: 'contains', value: '80' })),
    ],
  ])('rejects %s with 400', async (_n, raw) => {
    await request(server)
      .get('/api/assets')
      .query({ filter: raw })
      .set(headers)
      .expect(400);
  });

  it('isolates workspaces', async () => {
    const filter = {
      logic: 'or',
      items: [
        { field: 'host', op: 'eq', value: hostA },
        { field: 'host', op: 'neq', value: hostA },
        { field: 'tag', op: 'contains', value: 'env' },
      ],
    };
    expect(await listIds('/api/assets', filter, {}, otherHeaders)).toEqual([]);
    expect(await listIds('/api/assets', undefined, {}, otherHeaders)).toEqual(
      [],
    );
  });
});
