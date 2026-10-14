import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AssetsService } from '../src/modules/assets/assets.service';
import { DataAdapterService } from '../src/modules/data-adapter/data-adapter.service';
import { closeTestApp, createTestApp, type TestApp } from './helpers/app';
import { cleanupE2eData, createUserWithWorkspace } from './helpers/workspace';

/**
 * Normalized asset facets (dns_records / ip_observations / tech / tls) against
 * real Postgres.
 *
 * Proofs:
 *  1. DNS ingest attaches records to the asset that owns them, even when the
 *     batch contains assets that already exist (orIgnore skips them).
 *  2. replaceDnsRecords removes stale facet rows; the facets always mirror
 *     `assets.dnsRecords`.
 *  3. The IP tab, the IP filter and the `ipAddresses` field all read the DNS
 *     A/AAAA IPs of the asset; DNS resolver IPs never surface.
 *  4. An invalid IP filter is rejected with 400 instead of a DB error.
 *  5. The asset list resolves tech/TLS from the latest http response.
 *  6. Schema: tech rows dedupe on a NULL version; the latest-response lookup
 *     is backed by a composite index.
 */
describe('Asset facets (e2e)', () => {
  jest.setTimeout(60_000);

  let app: TestApp;
  let server: App;
  let dataSource: DataSource;
  let assets: AssetsService;
  let adapter: DataAdapterService;
  let headers: Record<string, string>;
  let workspaceId: string;
  let userId: string;
  let targetId: string;

  const domain = `e2e-facets-${Date.now()}.example.com`;
  const subA = `a.${domain}`;
  const subB = `b.${domain}`;

  const listQuery = (extra: Record<string, unknown> = {}) =>
    ({
      page: 1,
      limit: 50,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      ...extra,
    }) as never;

  const assetId = async (value: string): Promise<string> => {
    const rows: { id: string }[] = await dataSource.query(
      `SELECT id FROM assets WHERE value = $1 AND "targetId" = $2`,
      [value, targetId],
    );
    return rows[0].id;
  };

  const dnsRows = async (value: string): Promise<string[]> => {
    const rows: { r: string }[] = await dataSource.query(
      `SELECT d."recordType" || ' ' || d.value AS r
         FROM dns_records d JOIN assets a ON a.id = d."assetId"
        WHERE a.value = $1 AND a."targetId" = $2 ORDER BY 1`,
      [value, targetId],
    );
    return rows.map((row) => row.r);
  };

  const dnsIps = async (value: string): Promise<string[]> => {
    const rows: { ip: string }[] = await dataSource.query(
      `SELECT host(io.ip) AS ip
         FROM ip_observations io JOIN assets a ON a.id = io."assetId"
        WHERE a.value = $1 AND a."targetId" = $2 ORDER BY 1`,
      [value, targetId],
    );
    return rows.map((row) => row.ip);
  };

  beforeAll(async () => {
    app = await createTestApp();
    server = app.server;
    dataSource = app.dataSource;
    assets = app.app.get(AssetsService);
    adapter = app.app.get(DataAdapterService);

    const ctx = await createUserWithWorkspace(app.server, 'facets');
    headers = ctx.headers;
    workspaceId = ctx.workspace.id;
    userId = ctx.user.userId;

    const target: { id: string }[] = await dataSource.query(
      `INSERT INTO targets (value, "workspaceId", type) VALUES ($1, $2, 'DOMAIN') RETURNING id`,
      [domain, workspaceId],
    );
    targetId = target[0].id;
    await dataSource.query(
      `INSERT INTO assets (value, "targetId", "isPrimary") VALUES ($1, $2, true), ($3, $2, false)`,
      [domain, targetId, subA],
    );
  });

  afterAll(async () => {
    await cleanupE2eData(dataSource, {
      workspaceIds: [workspaceId],
      userIds: [userId],
    });
    await closeTestApp(app.app);
  });

  it('attaches DNS facets to the owning asset when the batch has existing assets', async () => {
    // subA already exists (orIgnore skips it) and comes FIRST in the batch.
    await adapter.upsertAssetsByTargetId(targetId, [
      { value: subA, dnsRecords: { A: ['192.0.2.10'] } },
      { value: subB, dnsRecords: { A: ['192.0.2.20'], NS: ['ns1.example.net'] } },
      { value: domain, dnsRecords: { A: ['192.0.2.1'] } },
    ]);

    expect(await dnsRows(subB)).toEqual(['A 192.0.2.20', 'NS ns1.example.net']);
    expect(await dnsIps(subB)).toEqual(['192.0.2.20']);
    // subA's stored json was not touched by orIgnore, so neither are facets.
    expect(await dnsRows(subA)).toEqual([]);
    // The primary asset's merged records are mirrored too.
    expect(await dnsRows(domain)).toEqual(['A 192.0.2.1']);
  });

  it('replaceDnsRecords removes stale facet rows', async () => {
    await adapter.upsertAssetsByTargetId(
      targetId,
      [{ value: subB, dnsRecords: { A: ['192.0.2.21'] } }],
      undefined,
      { replaceDnsRecords: true },
    );

    expect(await dnsRows(subB)).toEqual(['A 192.0.2.21']);
    expect(await dnsIps(subB)).toEqual(['192.0.2.21']);
  });

  describe('with an http-probed service', () => {
    let serviceId: string;

    beforeAll(async () => {
      const svc: { id: string }[] = await dataSource.query(
        `INSERT INTO asset_services (value, port, "assetId") VALUES ($1, 443, $2) RETURNING id`,
        [subB, await assetId(subB)],
      );
      serviceId = svc[0].id;

      const old: { id: string }[] = await dataSource.query(
        `INSERT INTO http_responses ("assetServiceId", failed, "createdAt")
         VALUES ($1, false, now() - interval '1 day') RETURNING id`,
        [serviceId],
      );
      const latest: { id: string }[] = await dataSource.query(
        `INSERT INTO http_responses ("assetServiceId", failed, status_code)
         VALUES ($1, false, 200) RETURNING id`,
        [serviceId],
      );
      await dataSource.query(
        `INSERT INTO http_response_technologies ("httpResponseId", "assetServiceId", name, version)
         VALUES ($1, $3, 'OldTech', NULL), ($2, $3, 'Nginx', '1.25')`,
        [old[0].id, latest[0].id, serviceId],
      );
      await dataSource.query(
        `INSERT INTO tls_certificates ("httpResponseId", "assetServiceId", host, "tlsVersion")
         VALUES ($1, $2, $3, 'tls13')`,
        [latest[0].id, serviceId, subB],
      );
      // httpx answer + the DNS resolver it used: the resolver is not an
      // asset IP and must never be listed.
      await dataSource.query(
        `INSERT INTO ip_observations ("httpResponseId", "assetServiceId", ip, source)
         VALUES ($1, $2, '198.51.100.7', 'httpx_a'), ($1, $2, '8.8.8.8', 'resolver')`,
        [latest[0].id, serviceId],
      );
    });

    it('lists DNS IPs in the IP tab and never resolver IPs', async () => {
      const res = await assets.getIpAssets(
        listQuery({ sortBy: 'ip' }),
        workspaceId,
      );
      const ips = res.data.map((row) => row.ip);
      expect(ips).toContain('192.0.2.21');
      expect(ips).not.toContain('8.8.8.8');
    });

    it('filters services by DNS IP and returns it in ipAddresses', async () => {
      const res = await assets.getManyAsssetServices(
        listQuery({ ipAddresses: ['192.0.2.21'] }),
        workspaceId,
      );
      expect(res.data.map((row) => row.id)).toEqual([serviceId]);
      expect(res.data[0].ipAddresses).toEqual(['192.0.2.21']);
    });

    it('resolves tech and TLS from the latest http response', async () => {
      const res = await assets.getManyAsssetServices(listQuery(), workspaceId);
      const row = res.data.find((item) => item.id === serviceId);
      expect(row?.httpResponses?.tech).toEqual(['Nginx:1.25']);
      expect((row?.httpResponses?.tls as { host?: string } | null)?.host).toBe(
        subB,
      );

      const one = await assets.getAssetById(serviceId, workspaceId);
      expect(one.httpResponses?.tech).toEqual(['Nginx:1.25']);
      expect(one.ipAddresses).toEqual(['192.0.2.21']);
    });

    it('rejects an invalid IP filter with 400', async () => {
      await request(server)
        .get('/api/assets')
        .query({ ipAddresses: 'not-an-ip' })
        .set(headers)
        .expect(400);
    });

    it('dedupes tech rows that have no version', async () => {
      const latest: { id: string }[] = await dataSource.query(
        `SELECT id FROM http_responses WHERE "assetServiceId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
        [serviceId],
      );
      for (let i = 0; i < 2; i++) {
        await dataSource.query(
          `INSERT INTO http_response_technologies ("httpResponseId", name, version)
           VALUES ($1, 'HSTS', NULL) ON CONFLICT DO NOTHING`,
          [latest[0].id],
        );
      }
      const count: { n: string }[] = await dataSource.query(
        `SELECT count(*)::text AS n FROM http_response_technologies WHERE "httpResponseId" = $1 AND name = 'HSTS'`,
        [latest[0].id],
      );
      expect(count[0].n).toBe('1');
    });
  });

  it('backs the latest-response lookup with a composite index', async () => {
    const rows: { indexdef: string }[] = await dataSource.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'http_responses'`,
    );
    expect(
      rows.some((row) =>
        row.indexdef.includes('("assetServiceId", "createdAt")'),
      ),
    ).toBe(true);
  });
});
