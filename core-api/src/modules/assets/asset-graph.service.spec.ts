import type { DataSource, Repository } from 'typeorm';
import type { Target } from '../targets/entities/target.entity';
import type { TechnologyForwarderService } from '../technology/technology-forwarder.service';
import { AssetGraphService } from './asset-graph.service';
import type { AssetService } from './entities/asset-services.entity';
import type { Asset } from './entities/assets.entity';

describe('AssetGraphService', () => {
  let service: AssetGraphService;
  let mockAssetRepository: Partial<Repository<Asset>>;
  let mockAssetServiceRepository: Partial<Repository<AssetService>>;
  let mockTargetRepository: Partial<Repository<Target>>;
  let mockTechnologyForwarderService: Partial<TechnologyForwarderService>;
  let mockDataSource: Partial<DataSource>;

  beforeEach(() => {
    mockAssetRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    mockAssetServiceRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getOneOrFail: jest.fn(),
      getMany: jest.fn(),
      getManyAndCount: jest.fn(),
      getRawMany: jest.fn(),
      getRawOne: jest.fn(),
    } as any;

    mockTargetRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
    };

    mockTechnologyForwarderService = {
      enrichTechnologies: jest.fn(),
    };

    mockDataSource = {
      createQueryBuilder: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn(),
      delete: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    } as any;

    service = new AssetGraphService(
      mockAssetRepository as Repository<Asset>,
      mockAssetServiceRepository as Repository<AssetService>,
      mockTargetRepository as Repository<Target>,
      mockDataSource as DataSource,
      mockTechnologyForwarderService as TechnologyForwarderService,
    );
  });

  describe('getAssetGraph', () => {
    const createMockQb = (data: unknown[]) => {
      const qb: Record<string, unknown> = {};
      qb.leftJoinAndSelect = jest.fn().mockReturnValue(qb);
      qb.innerJoin = jest.fn().mockReturnValue(qb);
      qb.leftJoin = jest.fn().mockReturnValue(qb);
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest.fn().mockReturnValue(qb);
      qb.getMany = jest.fn().mockResolvedValue(data);
      return qb;
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns all 7 node types and correct edges with composite IDs', async () => {
      const target = { id: 'target-1', value: 'example.com' };
      const assets = [
        {
          id: 'asset-1',
          value: '1.2.3.4',
          targetId: 'target-1',
          isEnabled: true,
          dnsRecords: ['a.example.com'],
          dnsRecordRows: [{ value: '1.2.3.4' }],
        },
        {
          id: 'asset-2',
          value: '5.6.7.8',
          targetId: 'target-1',
          isEnabled: true,
          dnsRecords: [],
          dnsRecordRows: [{ value: '5.6.7.8' }],
        },
      ];
      const services = [
        { id: 'svc-1', value: 'http', port: 80, assetId: 'asset-1' },
        { id: 'svc-2', value: 'https', port: 443, assetId: 'asset-2' },
      ];
      const techRows = [
        { serviceId: 'svc-1', tech: 'nginx:1.21' },
        { serviceId: 'svc-2', tech: 'react:18' },
      ];
      const tlsRecords = [
        {
          host: 'example.com',
          sni: 'example.com',
          subjectDn: 'CN=example.com',
          issuerDn: 'CN=LE',
          notBefore: '2026-01-01',
          notAfter: '2026-12-31',
          tlsVersion: 'TLSv1.3',
          cipher: 'AES256',
          assetServiceId: 'svc-1',
        },
      ];
      const statusRows = [{ statusCode: 200, serviceId: 'svc-1' }];
      const enrichedTechs = [
        {
          name: 'nginx',
          description: 'Web server',
          iconUrl: 'nginx.png',
          categoryNames: ['Web'],
        },
        {
          name: 'react',
          description: 'JS library',
          iconUrl: 'react.png',
          categoryNames: ['Frontend'],
        },
      ];
      // Mock query builders
      (mockTargetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([target]));
      (mockAssetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb(assets));
      (mockAssetServiceRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb(services));

      mockDataSource.query = jest
        .fn()
        .mockResolvedValueOnce(techRows)
        .mockResolvedValueOnce(tlsRecords)
        .mockResolvedValueOnce(statusRows);

      mockTechnologyForwarderService.enrichTechnologies = jest
        .fn()
        .mockResolvedValue(enrichedTechs);

      const result = await service.getAssetGraph({}, 'ws-1');

      // ── Nodes ──────────────────────────────────────────────
      const nodeIds = result.nodes.map((n) => n.id);
      expect(nodeIds).toContain('target|target-1');
      expect(nodeIds).toContain('asset|asset-1');
      expect(nodeIds).toContain('asset|asset-2');
      expect(nodeIds).toContain('ip|1.2.3.4');
      expect(nodeIds).toContain('ip|5.6.7.8');
      expect(nodeIds).toContain('service|svc-1');
      expect(nodeIds).toContain('service|svc-2');
      expect(nodeIds).toContain('tech|nginx');
      expect(nodeIds).toContain('tech|react');
      expect(nodeIds).toContain('tls|example.com');
      expect(nodeIds).toContain('statusCode|200');
      expect(result.nodes).toHaveLength(11);

      const nodeById = new Map(result.nodes.map((n) => [n.id, n]));
      expect(nodeById.get('target|target-1')!.type).toBe('target');
      expect(nodeById.get('asset|asset-1')!.type).toBe('asset');
      expect(nodeById.get('ip|1.2.3.4')!.type).toBe('ip');
      expect(nodeById.get('service|svc-1')!.type).toBe('service');
      expect(nodeById.get('tech|nginx')!.type).toBe('technology');
      expect(nodeById.get('tls|example.com')!.type).toBe('tls');
      expect(nodeById.get('statusCode|200')!.type).toBe('statusCode');

      const techNode = nodeById.get('tech|nginx')!;
      expect(techNode.data.metadata).toEqual(
        expect.objectContaining({
          name: 'nginx',
          description: 'Web server',
          iconUrl: 'nginx.png',
          categoryNames: ['Web'],
        }),
      );

      // ── Edges ──────────────────────────────────────────────
      expect(result.edges).toHaveLength(10);

      for (const edge of result.edges) {
        expect(edge.id).toBe(`e-${edge.source}-${edge.target}`);
      }

      const nodeIdSet = new Set(nodeIds);
      for (const edge of result.edges) {
        expect(nodeIdSet.has(edge.source)).toBe(true);
        expect(nodeIdSet.has(edge.target)).toBe(true);
      }

      const edgeTypes = result.edges.map((e) => `${e.source}→${e.target} [${e.type}]`);
      expect(edgeTypes).toContain(
        'target|target-1→asset|asset-1 [belongs_to]',
      );
      expect(edgeTypes).toContain(
        'target|target-1→asset|asset-2 [belongs_to]',
      );
      expect(edgeTypes).toContain('asset|asset-1→ip|1.2.3.4 [resolves_to]');
      expect(edgeTypes).toContain('asset|asset-2→ip|5.6.7.8 [resolves_to]');
      expect(edgeTypes).toContain(
        'asset|asset-1→service|svc-1 [runs_on]',
      );
      expect(edgeTypes).toContain(
        'asset|asset-2→service|svc-2 [runs_on]',
      );
      expect(edgeTypes).toContain('service|svc-1→tech|nginx [uses]');
      expect(edgeTypes).toContain('service|svc-2→tech|react [uses]');
      expect(edgeTypes).toContain(
        'service|svc-1→tls|example.com [has_tls]',
      );
      expect(edgeTypes).toContain(
        'service|svc-1→statusCode|200 [returns]',
      );
    });

    it('returns empty nodes and edges when workspace has no data', async () => {
      (mockTargetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([]));
      (mockAssetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([]));
      (mockAssetServiceRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([]));
      mockDataSource.query = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockTechnologyForwarderService.enrichTechnologies = jest
        .fn()
        .mockResolvedValue([]);

      const result = await service.getAssetGraph({}, 'empty-ws');

      expect(result).toEqual({ nodes: [], edges: [] });
    });

    it('passes targetId filter to repos and returns scoped data', async () => {
      const target = { id: 'target-1', value: 'example.com' };
      const asset = {
        id: 'asset-1',
        value: '1.2.3.4',
        targetId: 'target-1',
        isEnabled: true,
        dnsRecords: [],
        dnsRecordRows: [{ value: '1.2.3.4' }],
      };

      (mockTargetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([target]));
      (mockAssetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([asset]));
      (mockAssetServiceRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([]));
      mockDataSource.query = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockTechnologyForwarderService.enrichTechnologies = jest
        .fn()
        .mockResolvedValue([]);

      const result = await service.getAssetGraph(
        { targetId: 'target-1' },
        'ws-1',
      );

      const nodeIds = result.nodes.map((n) => n.id);
      expect(nodeIds).toContain('target|target-1');
      expect(nodeIds).toContain('asset|asset-1');
      expect(nodeIds).toContain('ip|1.2.3.4');
      expect(nodeIds.filter((id) => id.startsWith('target|'))).toHaveLength(1);
      expect(nodeIds.filter((id) => id.startsWith('asset|'))).toHaveLength(1);

      const targetQb = (mockTargetRepository as any).createQueryBuilder;
      const targetQbInstance = targetQb.mock.results[0].value;
      expect(targetQbInstance.andWhere).toHaveBeenCalledWith(
        expect.stringContaining(':targetId'),
        expect.objectContaining({ targetId: 'target-1' }),
      );
    });

    it('keeps ip nodes and resolves_to edges when nodes exceed the old 500 cap', async () => {
      // A workspace whose node count is well above MAX_NODES: ip nodes must
      // not be trimmed away, otherwise domain↔IP relationships vanish.
      const target = { id: 't-big', value: 'big.example.com' };
      const assetCount = 600;
      const assets = Array.from({ length: assetCount }, (_, i) => ({
        id: `asset-${i}`,
        value: `a${i}.example.com`,
        targetId: 't-big',
        isEnabled: true,
        dnsRecords: [],
        dnsRecordRows: [{ value: `10.0.0.${i}` }],
      }));

      (mockTargetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([target]));
      (mockAssetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb(assets));
      (mockAssetServiceRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([]));
      mockDataSource.query = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockTechnologyForwarderService.enrichTechnologies = jest
        .fn()
        .mockResolvedValue([]);

      const result = await service.getAssetGraph({}, 'ws-big');

      // All 600 ip nodes survive the node cap.
      expect(result.nodes.filter((n) => n.type === 'ip')).toHaveLength(
        assetCount,
      );
      expect(result.nodes).toHaveLength(1 + assetCount * 2);

      // Every domain connects to its IP: domain↔IP relationship is visible.
      expect(result.edges.filter((e) => e.type === 'resolves_to')).toHaveLength(
        assetCount,
      );
      const edgeTypes = result.edges.map(
        (e) => `${e.source}→${e.target} [${e.type}]`,
      );
      expect(edgeTypes).toContain(
        'asset|asset-0→ip|10.0.0.0 [resolves_to]',
      );
      expect(edgeTypes).toContain(
        `asset|asset-${assetCount - 1}→ip|10.0.0.${assetCount - 1} [resolves_to]`,
      );
    });

    it('truncates edges by explicit type priority, not insertion order', async () => {
      // Edge cap (MAX_EDGES=4000) must drop leaf edges (has_tls/returns)
      // before structural ones (belongs_to/resolves_to/runs_on/uses) by
      // explicit type priority — not by whatever order the builder loops
      // happen to insert them in. Here leaf edges dominate the input
      // (1200 structural + 300 has_tls + 9000 returns = 10500 > 4000), so
      // every dropped edge must be a `returns` edge, and among the leaves
      // has_tls (priority 4) must survive ahead of returns (priority 5).
      const target = { id: 't-big', value: 'big.example.com' };
      const assetCount = 300;
      const assets = Array.from({ length: assetCount }, (_, i) => ({
        id: `asset-${i}`,
        value: `a${i}.example.com`,
        targetId: 't-big',
        isEnabled: true,
        dnsRecords: [],
        dnsRecordRows: [{ value: `10.0.0.${i}` }],
      }));
      const services = Array.from({ length: assetCount }, (_, i) => ({
        id: `svc-${i}`,
        value: 'http',
        port: 80,
        assetId: `asset-${i}`,
      }));
      const techRows = Array.from({ length: assetCount }, (_, i) => ({
        serviceId: `svc-${i}`,
        tech: `tech-${i}:1.0`,
      }));
      const tlsRecords = Array.from({ length: assetCount }, (_, i) => ({
        host: `h-${i}.example.com`,
        sni: `h-${i}.example.com`,
        subjectDn: 'CN=x',
        issuerDn: 'CN=y',
        notBefore: '2026-01-01',
        notAfter: '2026-12-31',
        tlsVersion: 'TLSv1.3',
        cipher: 'AES256',
        assetServiceId: `svc-${i}`,
      }));
      // 30 status codes × 300 services = 9000 returns edges. Row order is
      // the returns-edge insertion order; the last 6200 rows are the ones
      // that must be dropped first.
      const statusCodeCount = 30;
      const statusRows: { statusCode: number; serviceId: string }[] = [];
      for (let code = 1; code <= statusCodeCount; code++) {
        for (let i = 0; i < assetCount; i++) {
          statusRows.push({ statusCode: code, serviceId: `svc-${i}` });
        }
      }

      (mockTargetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([target]));
      (mockAssetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb(assets));
      (mockAssetServiceRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb(services));

      mockDataSource.query = jest
        .fn()
        .mockResolvedValueOnce(techRows)
        .mockResolvedValueOnce(tlsRecords)
        .mockResolvedValueOnce(statusRows);

      mockTechnologyForwarderService.enrichTechnologies = jest
        .fn()
        .mockResolvedValue([]);

      const result = await service.getAssetGraph({}, 'ws-big');

      // ── Cap applied ─────────────────────────────────────────────
      expect(result.edges).toHaveLength(4000);

      const edgeByKey = new Map(
        result.edges.map((e) => [`${e.source}->${e.target}`, e]),
      );

      // ── Structural group (priority 0-3) fully survives ──────────
      const belongsTo = result.edges.filter((e) => e.type === 'belongs_to');
      const resolvesTo = result.edges.filter((e) => e.type === 'resolves_to');
      const runsOn = result.edges.filter((e) => e.type === 'runs_on');
      const uses = result.edges.filter((e) => e.type === 'uses');
      expect(belongsTo).toHaveLength(assetCount);
      expect(resolvesTo).toHaveLength(assetCount);
      expect(runsOn).toHaveLength(assetCount);
      expect(uses).toHaveLength(assetCount);
      expect(
        edgeByKey.has(`target|t-big->asset|asset-${assetCount - 1}`),
      ).toBe(true);
      expect(
        edgeByKey.has(
          `asset|asset-${assetCount - 1}->ip|10.0.0.${assetCount - 1}`,
        ),
      ).toBe(true);
      expect(
        edgeByKey.has(
          `asset|asset-${assetCount - 1}->service|svc-${assetCount - 1}`,
        ),
      ).toBe(true);
      expect(
        edgeByKey.has(
          `service|svc-${assetCount - 1}->tech|tech-${assetCount - 1}`,
        ),
      ).toBe(true);

      // ── has_tls (priority 4) survives ahead of returns ──────────
      expect(result.edges.filter((e) => e.type === 'has_tls')).toHaveLength(
        assetCount,
      );

      // ── returns (priority 5) is the only dropped type: the first
      // 2500 rows survive, everything after the cap is cut ─────────
      const returnsEdges = result.edges.filter((e) => e.type === 'returns');
      expect(returnsEdges).toHaveLength(4000 - assetCount * 5);
      // Code 9, first service: within the budget → survives.
      expect(edgeByKey.has('service|svc-0->statusCode|9')).toBe(true);
      // Code 9, service 99: last row inside the budget → survives.
      expect(edgeByKey.has('service|svc-99->statusCode|9')).toBe(true);
      // Code 9, service 100: exactly at the budget boundary → cut.
      expect(edgeByKey.has('service|svc-100->statusCode|9')).toBe(false);
      // Code 10 entirely: beyond the budget → cut.
      expect(edgeByKey.has('service|svc-0->statusCode|10')).toBe(false);
    });

    it('deduplicates edges with the same source and target', async () => {
      const target = { id: 't1', value: 'example.com' };
      const asset = {
        id: 'a1',
        value: '1.2.3.4',
        targetId: 't1',
        isEnabled: true,
        dnsRecords: [],
        dnsRecordRows: [{ value: '1.2.3.4' }],
      };
      const svc = { id: 's1', value: 'http', port: 80, assetId: 'a1' };

      const techRows = [
        { serviceId: 's1', tech: 'nginx:1.21' },
        { serviceId: 's1', tech: 'nginx:1.21' },
      ];

      (mockTargetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([target]));
      (mockAssetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([asset]));
      (mockAssetServiceRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([svc]));
      mockDataSource.query = jest
        .fn()
        .mockResolvedValueOnce(techRows)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockTechnologyForwarderService.enrichTechnologies = jest
        .fn()
        .mockResolvedValue([
          { name: 'nginx', description: '', iconUrl: '', categoryNames: [] },
        ]);

      const result = await service.getAssetGraph({}, 'ws-1');

      const usesEdges = result.edges.filter((e) => e.type === 'uses');
      expect(usesEdges).toHaveLength(1);
      expect(usesEdges[0]).toEqual({
        id: 'e-service|s1-tech|nginx',
        source: 'service|s1',
        target: 'tech|nginx',
        type: 'uses',
      });
    });

    it('only the latest http response status code per service is emitted', async () => {
      const target = { id: 't1', value: 'example.com' };
      const asset = {
        id: 'a1',
        value: '1.2.3.4',
        targetId: 't1',
        isEnabled: true,
        dnsRecords: [],
        dnsRecordRows: [{ value: '1.2.3.4' }],
      };
      const svc = { id: 's1', value: 'http', port: 80, assetId: 'a1' };

      // Two status rows for the same service: an old 500 and a newer 200.
      // The SQL must correlate http_responses to the latest row per service,
      // so only the newest status code survives the query.
      const statusRows = [
        { statusCode: 500, serviceId: 's1' },
        { statusCode: 200, serviceId: 's1' },
      ];

      (mockTargetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([target]));
      (mockAssetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([asset]));
      (mockAssetServiceRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([svc]));
      mockDataSource.query = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(statusRows);

      mockTechnologyForwarderService.enrichTechnologies = jest
        .fn()
        .mockResolvedValue([]);

      const result = await service.getAssetGraph({}, 'ws-1');

      // (a) SQL contract: the status query must correlate the latest
      // http_responses row per service instead of a membership-only subquery.
      const statusSql = (mockDataSource.query as jest.Mock).mock.calls[2][0];
      expect(statusSql).toContain('ORDER BY hr2."createdAt" DESC LIMIT 1');
      expect(statusSql).toContain('hr2."assetServiceId" = hr."assetServiceId"');

      // (b) The rows the query returns map 1:1 to statusCode nodes: every
      // (serviceId, statusCode) pair yields exactly one node and one returns
      // edge — no phantom or duplicated statusCode nodes.
      const statusNodes = result.nodes.filter((n) => n.type === 'statusCode');
      expect(statusNodes).toHaveLength(2);
      const statusNodeIds = new Set(statusNodes.map((n) => n.id));
      expect(statusNodeIds.has('statusCode|500')).toBe(true);
      expect(statusNodeIds.has('statusCode|200')).toBe(true);
      const returnsEdges = result.edges.filter((e) => e.type === 'returns');
      expect(returnsEdges).toHaveLength(2);
      for (const row of statusRows) {
        expect(
          returnsEdges.some(
            (e) =>
              e.source === `service|${row.serviceId}` &&
              e.target === `statusCode|${row.statusCode}`,
          ),
        ).toBe(true);
      }
    });

    it('service nodes carry data.alert=true when latest status code is 4xx/5xx and false otherwise', async () => {
      const target = { id: 't1', value: 'example.com' };
      const asset = {
        id: 'a1',
        value: '1.2.3.4',
        targetId: 't1',
        isEnabled: true,
        dnsRecords: [],
        dnsRecordRows: [{ value: '1.2.3.4' }],
      };
      const services = [
        { id: 's1', value: 'http', port: 80, assetId: 'a1' },
        { id: 's2', value: 'https', port: 443, assetId: 'a1' },
        { id: 's3', value: 'ftp', port: 21, assetId: 'a1' },
      ];

      // s1 has an erroring latest response, s2 is healthy, s3 has no status
      // row at all — so only s1 must be flagged.
      const statusRows = [
        { statusCode: 500, serviceId: 's1' },
        { statusCode: 200, serviceId: 's2' },
      ];

      (mockTargetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([target]));
      (mockAssetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([asset]));
      (mockAssetServiceRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb(services));
      mockDataSource.query = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(statusRows);

      mockTechnologyForwarderService.enrichTechnologies = jest
        .fn()
        .mockResolvedValue([]);

      const result = await service.getAssetGraph({}, 'ws-1');

      const nodeById = new Map(result.nodes.map((n) => [n.id, n]));
      expect(nodeById.get('service|s1')!.data.alert).toBe(true);
      expect(
        (nodeById.get('service|s1')!.data.metadata as Record<string, unknown>)
          .statusCode,
      ).toBe(500);
      expect(nodeById.get('service|s2')!.data.alert).toBe(false);
      // A service with no status row must not be flagged.
      expect(nodeById.get('service|s3')!.data.alert).toBe(false);
    });

    it('service node metadata includes lastScannedAt from the latest http response', async () => {
      const target = { id: 't1', value: 'example.com' };
      const asset = {
        id: 'a1',
        value: '1.2.3.4',
        targetId: 't1',
        isEnabled: true,
        dnsRecords: [],
        dnsRecordRows: [{ value: '1.2.3.4' }],
      };
      const services = [
        { id: 's1', value: 'http', port: 80, assetId: 'a1' },
        { id: 's2', value: 'https', port: 443, assetId: 'a1' },
      ];

      // s1 has a scannedAt timestamp on its latest http response row; s2's
      // row has none — so s1 must expose lastScannedAt and s2 must not.
      const statusRows = [
        {
          statusCode: 200,
          serviceId: 's1',
          lastScannedAt: '2026-08-13T09:00:00.000Z',
        },
        { statusCode: 404, serviceId: 's2' },
      ];

      (mockTargetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([target]));
      (mockAssetRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb([asset]));
      (mockAssetServiceRepository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(createMockQb(services));
      mockDataSource.query = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(statusRows);

      mockTechnologyForwarderService.enrichTechnologies = jest
        .fn()
        .mockResolvedValue([]);

      const result = await service.getAssetGraph({}, 'ws-1');

      const nodeById = new Map(result.nodes.map((n) => [n.id, n]));
      expect(nodeById.get('service|s1')!.data.metadata).toEqual(
        expect.objectContaining({
          lastScannedAt: '2026-08-13T09:00:00.000Z',
        }),
      );
      // A service whose latest response row carries no scannedAt must not
      // expose lastScannedAt on its node metadata.
      expect(
        (nodeById.get('service|s2')!.data.metadata as Record<string, unknown>)
          .lastScannedAt,
      ).toBeUndefined();
    });
  });

  describe('getAssetServiceGraph', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockDataSource.query = jest.fn();
    });

    it('returns the service nodes and runs_on edges for the asset, workspace-scoped', async () => {
      (mockAssetRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'asset-1',
        value: 'example.com',
        targetId: 'target-1',
      });
      (mockAssetServiceRepository.find as jest.Mock).mockResolvedValue([
        { id: 'svc-1', value: 'http', port: 80, assetId: 'asset-1' },
        { id: 'svc-2', value: 'https', port: 443, assetId: 'asset-1' },
      ]);
      (mockDataSource.query as jest.Mock).mockResolvedValue([]);

      const result = await service.getAssetServiceGraph('asset-1', 'ws-1');

      const nodeById = new Map(result.nodes.map((n) => [n.id, n]));
      expect(nodeById.get('service|svc-1')).toMatchObject({
        type: 'service',
        data: { label: 'http' },
      });
      expect(nodeById.get('service|svc-2')).toMatchObject({
        type: 'service',
        data: { label: 'https' },
      });
      expect(
        (nodeById.get('service|svc-1')!.data.metadata as Record<string, unknown>)
          .assetId,
      ).toBe('asset-1');

      expect(result.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'asset|asset-1',
            target: 'service|svc-1',
            type: 'runs_on',
          }),
          expect.objectContaining({
            source: 'asset|asset-1',
            target: 'service|svc-2',
            type: 'runs_on',
          }),
        ]),
      );

      // Workspace scoping: the asset lookup must restrict to the workspace.
      expect(mockAssetRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'asset-1',
            target: { workspaceId: 'ws-1' },
          }),
        }),
      );
    });

    it('throws NotFoundException when the asset does not belong to the workspace', async () => {
      (mockAssetRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getAssetServiceGraph('asset-foreign', 'ws-1'),
      ).rejects.toThrow('Asset not found');
      expect(mockAssetServiceRepository.find).not.toHaveBeenCalled();
    });

    it('marks service nodes alert=true when the latest http response is 4xx/5xx and attaches lastScannedAt', async () => {
      (mockAssetRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'asset-1',
        value: 'example.com',
        targetId: 'target-1',
      });
      (mockAssetServiceRepository.find as jest.Mock).mockResolvedValue([
        { id: 'svc-1', value: 'http', port: 80, assetId: 'asset-1' },
      ]);
      (mockDataSource.query as jest.Mock).mockResolvedValue([
        {
          statusCode: 503,
          serviceId: 'svc-1',
          lastScannedAt: '2026-08-13T09:00:00.000Z',
        },
      ]);

      const result = await service.getAssetServiceGraph('asset-1', 'ws-1');

      const nodeById = new Map(result.nodes.map((n) => [n.id, n]));
      expect(nodeById.get('service|svc-1')!.data.alert).toBe(true);
      expect(
        (nodeById.get('service|svc-1')!.data.metadata as Record<string, unknown>)
          .lastScannedAt,
      ).toBe('2026-08-13T09:00:00.000Z');
      expect(
        (nodeById.get('service|svc-1')!.data.metadata as Record<string, unknown>)
          .statusCode,
      ).toBe(503);
    });

    it('returns empty nodes and edges when the asset has no services', async () => {
      (mockAssetRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'asset-empty',
        value: 'empty.example',
        targetId: 'target-1',
      });
      (mockAssetServiceRepository.find as jest.Mock).mockResolvedValue([]);
      (mockDataSource.query as jest.Mock).mockResolvedValue([]);

      const result = await service.getAssetServiceGraph('asset-empty', 'ws-1');

      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });
  });
});
