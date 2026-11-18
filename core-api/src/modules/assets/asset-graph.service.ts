import { NotFoundError } from '@/common/errors/domain.errors';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Target } from '../targets/entities/target.entity';
import { TechnologyForwarderService } from '../technology/technology-forwarder.service';
import {
  AssetGraphResponseDto,
  GetAssetGraphQueryDto,
  GraphEdgeDto,
  GraphNodeDto,
} from './dto/graph.dto';
import { AssetService } from './entities/asset-services.entity';
import { Asset } from './entities/assets.entity';

/**
 * The asset topology graph of a workspace (`GET assets/graph`) and the lazy
 * expansion of one asset's services (`GET assets/:assetId/services`). Read
 * only; every sub-query is scoped to the workspace.
 */
@Injectable()
export class AssetGraphService {
  constructor(
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
    @InjectRepository(AssetService)
    private readonly assetServiceRepo: Repository<AssetService>,
    @InjectRepository(Target)
    private readonly targetRepo: Repository<Target>,
    private readonly dataSource: DataSource,
    private readonly technologyForwarderService: TechnologyForwarderService,
  ) {}

  /**
   * Returns the full asset topology graph for a workspace.
   *
   * Builds nodes from 7 entity types (target, asset, ip, service,
   * technology, tls, statusCode) and edges from FK relationships.
   * Technology nodes are enriched via {@link TechnologyForwarderService}.
   *
   * @param query   Optional filters (targetId to scope to a single target).
   * @param workspaceId  Workspace scope — every sub-query is filtered by this.
   */
  public async getAssetGraph(
    query: GetAssetGraphQueryDto,
    workspaceId: string,
  ): Promise<AssetGraphResponseDto> {
    const MAX_NODES = 2000;
    const MAX_EDGES = 4000;

    const rawParams: string[] = [workspaceId];
    let targetFilter = '';
    if (query.targetId) {
      rawParams.push(query.targetId);
      targetFilter = `AND tgt.id = $${rawParams.length}`;
    }

    // ── 1. Target nodes ──────────────────────────────────────────────
    const targetQb = this.targetRepo
      .createQueryBuilder('t')
      .where('t.workspaceId = :workspaceId', { workspaceId });
    if (query.targetId) {
      targetQb.andWhere('t.id = :targetId', { targetId: query.targetId });
    }
    const targetsPromise = targetQb.getMany();

    // ── 2. Asset nodes (with DNS IPs) ────────────────────────────────
    const assetQb = this.assetRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect(
        'a.dnsRecordRows',
        'dns',
        `dns."recordType" IN ('A', 'AAAA')`,
      )
      .innerJoin('a.target', 'target')
      .where('target.workspaceId = :workspaceId', { workspaceId });
    if (query.targetId) {
      assetQb.andWhere('target.id = :targetId', { targetId: query.targetId });
    }
    const assetsPromise = assetQb.getMany();

    // ── 4. Service nodes ─────────────────────────────────────────────
    const serviceQb = this.assetServiceRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .where('target.workspaceId = :workspaceId', { workspaceId });
    if (query.targetId) {
      serviceQb.andWhere('target.id = :targetId', { targetId: query.targetId });
    }
    const servicesPromise = serviceQb.getMany();

    // ── 5. Technology nodes (raw query — batch enrichment runs after
    //       the parallel batch resolves, below) ───────────────────────
    const techRowsPromise: Promise<{ serviceId: string; tech: string }[]> =
      this.dataSource.query(
        `
        SELECT
          svc.id AS "serviceId",
          hrt.name || CASE WHEN hrt.version IS NULL THEN '' ELSE ':' || hrt.version END AS "tech"
        FROM http_response_technologies hrt
        INNER JOIN http_responses hr ON hr.id = hrt."httpResponseId"
        INNER JOIN asset_services svc ON svc.id = hr."assetServiceId"
        INNER JOIN assets a ON a.id = svc."assetId"
        INNER JOIN targets tgt ON tgt.id = a."targetId"
        WHERE tgt."workspaceId" = $1
          ${targetFilter}
          AND hr.id = (
            SELECT hr2.id FROM http_responses hr2
            WHERE hr2."assetServiceId" = hr."assetServiceId"
            ORDER BY hr2."createdAt" DESC LIMIT 1
          )
        `,
        rawParams,
      );

    // ── 6. TLS nodes (normalized table, latest cert per service) ────
    const tlsRecordsPromise: Promise<
      {
        host: string;
        sni: string;
        subjectDn: string;
        issuerDn: string;
        notBefore: string;
        notAfter: string;
        tlsVersion: string;
        cipher: string;
        assetServiceId: string;
      }[]
    > = this.dataSource.query(
      `
        SELECT DISTINCT ON (tc."host", tc."assetServiceId")
          tc."host" AS "host",
          tc."sni" AS "sni",
          tc."subjectDn" AS "subjectDn",
          tc."issuerDn" AS "issuerDn",
          tc."notBefore" AS "notBefore",
          tc."notAfter" AS "notAfter",
          tc."tlsVersion" AS "tlsVersion",
          tc."cipher" AS "cipher",
          tc."assetServiceId" AS "assetServiceId"
        FROM tls_certificates tc
        INNER JOIN asset_services svc ON svc.id = tc."assetServiceId"
        INNER JOIN assets a ON a.id = svc."assetId"
        INNER JOIN targets tgt ON tgt.id = a."targetId"
        WHERE tgt."workspaceId" = $1
          ${targetFilter}
          AND tc."host" IS NOT NULL
        ORDER BY tc."host", tc."assetServiceId", tc."createdAt" DESC
        `,
      rawParams,
    );

    // ── 7. StatusCode nodes (raw query) ─────────────────────────────
    const statusServiceRowsPromise: Promise<
      {
        statusCode: number;
        serviceId: string;
        lastScannedAt?: string;
      }[]
    > = this.dataSource.query(
      `
        SELECT
          hsc."statusCode" AS "statusCode",
          hsc."assetServiceId" AS "serviceId",
          hr."createdAt" AS "lastScannedAt"
        FROM http_status_codes hsc
        INNER JOIN asset_services svc ON svc.id = hsc."assetServiceId"
        INNER JOIN assets a ON a.id = svc."assetId"
        INNER JOIN targets tgt ON tgt.id = a."targetId"
        INNER JOIN http_responses hr ON hr."assetServiceId" = hsc."assetServiceId"
          AND hr.id = (
            SELECT hr2.id FROM http_responses hr2
            WHERE hr2."assetServiceId" = hr."assetServiceId"
            ORDER BY hr2."createdAt" DESC LIMIT 1
          )
        WHERE tgt."workspaceId" = $1
          ${targetFilter}
          AND hsc."statusCode" IS NOT NULL
          AND hsc."statusCode" != 0
        `,
      rawParams,
    );

    // ══════════════════════════════════════════════════════════════════
    // Resolve the six independent workspace-scoped queries concurrently
    // (targets, assets, services, tech rows, TLS, status codes). The
    // derived steps below — IP set from assets, batch enrichment from tech
    // rows, alert ids from status rows — consume these results, so they run
    // only after the batch settles. Promise.all preserves the input order.
    // ══════════════════════════════════════════════════════════════════
    const [
      targets,
      assets,
      services,
      techRows,
      tlsRecords,
      statusServiceRows,
    ] = await Promise.all([
      targetsPromise,
      assetsPromise,
      servicesPromise,
      techRowsPromise,
      tlsRecordsPromise,
      statusServiceRowsPromise,
    ]);

    // ── 3. IP nodes (collected from normalized dns records) ─────────
    const ipSet = new Set<string>();
    for (const a of assets) {
      const rows = (
        a as unknown as { dnsRecordRows?: { value?: string }[] }
      ).dnsRecordRows;
      if (rows) {
        for (const r of rows) {
          if (r.value) ipSet.add(r.value);
        }
      }
    }

    // ── 5. Technology enrichment (derived from the tech rows above) ──
    const techBaseNames = new Set<string>();
    const serviceTechPairs: Array<{
      serviceId: string;
      baseName: string;
    }> = [];
    for (const row of techRows) {
      const idx = row.tech.indexOf(':');
      const baseName = idx < 0 ? row.tech : row.tech.slice(0, idx);
      techBaseNames.add(baseName);
      serviceTechPairs.push({ serviceId: row.serviceId, baseName });
    }

    const uniqueBaseNames = [...techBaseNames];
    const enrichedTechs =
      await this.technologyForwarderService.enrichTechnologies(uniqueBaseNames);
    const techEnrichmentMap = new Map(
      enrichedTechs.map((t) => [t.name, t]),
    );

    // Services whose latest http response errored (4xx/5xx) — drives the
    // `alert` flag on service nodes.
    const alertServiceIds = new Set(
      statusServiceRows
        .filter((row) => row.statusCode >= 400)
        .map((row) => row.serviceId),
    );

    // Latest scan timestamp per service — the createdAt of the latest
    // http_response for that service (same row the statusCode correlation
    // selects). Drives the "scanned X ago" freshness chip on service nodes.
    const lastScannedAtByServiceId = new Map<string, string>();
    for (const row of statusServiceRows) {
      if (row.lastScannedAt && !lastScannedAtByServiceId.has(row.serviceId)) {
        lastScannedAtByServiceId.set(row.serviceId, row.lastScannedAt);
      }
    }
    // Latest http status code per service — lets the graph view derive
    // severity (warn 4xx / danger 5xx) without statusCode satellite nodes.
    const statusCodeByServiceId = new Map<string, number>();
    for (const row of statusServiceRows) {
      if (!statusCodeByServiceId.has(row.serviceId)) {
        statusCodeByServiceId.set(row.serviceId, row.statusCode);
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // Build nodes
    // ══════════════════════════════════════════════════════════════════
    const nodeMap = new Map<string, GraphNodeDto>();

    for (const t of targets) {
      const id = `target|${t.id}`;
      nodeMap.set(id, {
        id,
        type: 'target',
        data: { label: t.value, metadata: { id: t.id } },
      });
    }

    for (const a of assets) {
      const id = `asset|${a.id}`;
      nodeMap.set(id, {
        id,
        type: 'asset',
        data: {
          label: a.value,
          metadata: {
            id: a.id,
            targetId: a.targetId,
            isEnabled: a.isEnabled,
            dnsRecords: a.dnsRecords,
            ipAddresses: (
              (a as unknown as { dnsRecordRows?: { value?: string }[] })
                .dnsRecordRows ?? []
            )
              .map((r) => r.value)
              .filter((v): v is string => !!v),
          },
        },
      });
    }

    for (const ip of ipSet) {
      const id = `ip|${ip}`;
      nodeMap.set(id, {
        id,
        type: 'ip',
        data: { label: ip, metadata: { ip } },
      });
    }

    for (const s of services) {
      const id = `service|${s.id}`;
      const lastScannedAt = lastScannedAtByServiceId.get(s.id);
      const statusCode = statusCodeByServiceId.get(s.id);
      nodeMap.set(id, {
        id,
        type: 'service',
        data: {
          label: s.value,
          metadata: {
            id: s.id,
            value: s.value,
            port: s.port,
            assetId: s.assetId,
            ...(lastScannedAt && { lastScannedAt }),
            ...(statusCode !== undefined && { statusCode }),
          },
          alert: alertServiceIds.has(s.id),
        },
      });
    }

    for (const baseName of uniqueBaseNames) {
      const id = `tech|${baseName}`;
      const enriched = techEnrichmentMap.get(baseName);
      nodeMap.set(id, {
        id,
        type: 'technology',
        data: {
          label: baseName,
          metadata: enriched
            ? {
                name: enriched.name,
                description: enriched.description,
                iconUrl: enriched.iconUrl,
                categoryNames: enriched.categoryNames,
              }
            : { name: baseName },
        },
      });
    }

    for (const tls of tlsRecords) {
      const id = `tls|${tls.host}`;
      nodeMap.set(id, {
        id,
        type: 'tls',
        data: {
          label: tls.host,
          metadata: {
            host: tls.host,
            sni: tls.sni,
            subjectDn: tls.subjectDn,
            issuerDn: tls.issuerDn,
            notBefore: tls.notBefore,
            notAfter: tls.notAfter,
            tlsVersion: tls.tlsVersion,
            cipher: tls.cipher,
          },
        },
      });
    }

    for (const row of statusServiceRows) {
      const id = `statusCode|${row.statusCode}`;
      nodeMap.set(id, {
        id,
        type: 'statusCode',
        data: {
          label: String(row.statusCode),
          metadata: { statusCode: row.statusCode },
        },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // Build edges
    // ══════════════════════════════════════════════════════════════════
    const edgeSet = new Set<string>();
    const edgeList: GraphEdgeDto[] = [];

    const addEdge = (
      source: string,
      target: string,
      type: string,
    ): void => {
      const key = `${source}->${target}`;
      if (edgeSet.has(key)) return;
      if (!nodeMap.has(source) || !nodeMap.has(target)) return;
      edgeSet.add(key);
      edgeList.push({
        id: `e-${source}-${target}`,
        source,
        target,
        type,
      });
    };

    for (const a of assets) {
      if (a.targetId) {
        addEdge(`target|${a.targetId}`, `asset|${a.id}`, 'belongs_to');
      }
    }

    for (const a of assets) {
      const rows = (
        a as unknown as { dnsRecordRows?: { value?: string }[] }
      ).dnsRecordRows;
      if (rows) {
        for (const r of rows) {
          if (r.value) {
            addEdge(`asset|${a.id}`, `ip|${r.value}`, 'resolves_to');
          }
        }
      }
    }

    for (const s of services) {
      if (s.assetId) {
        addEdge(`asset|${s.assetId}`, `service|${s.id}`, 'runs_on');
      }
    }

    for (const pair of serviceTechPairs) {
      addEdge(`service|${pair.serviceId}`, `tech|${pair.baseName}`, 'uses');
    }

    for (const tls of tlsRecords) {
      if (tls.assetServiceId) {
        addEdge(`service|${tls.assetServiceId}`, `tls|${tls.host}`, 'has_tls');
      }
    }

    for (const row of statusServiceRows) {
      addEdge(
        `service|${row.serviceId}`,
        `statusCode|${row.statusCode}`,
        'returns',
      );
    }

    // ══════════════════════════════════════════════════════════════════
    // Dedup + cap + sort
    // ══════════════════════════════════════════════════════════════════
    const typePriority: Record<string, number> = {
      target: 0,
      asset: 1,
      service: 2,
      ip: 3,
      technology: 4,
      tls: 5,
      statusCode: 6,
    };

    let nodeList = [...nodeMap.values()];
    if (nodeList.length > MAX_NODES) {
      nodeList.sort((a, b) => {
        const pa = typePriority[a.type] ?? 99;
        const pb = typePriority[b.type] ?? 99;
        if (pa !== pb) return pa - pb;
        return a.id.localeCompare(b.id);
      });
      nodeList = nodeList.slice(0, MAX_NODES);
      const allowedIds = new Set(nodeList.map((n) => n.id));
      const filteredEdges = edgeList.filter(
        (e) => allowedIds.has(e.source) && allowedIds.has(e.target),
      );
      edgeList.length = 0;
      edgeList.push(...filteredEdges);
    }

    if (edgeList.length > MAX_EDGES) {
      // Truncate by explicit edge-type priority, not insertion order: the
      // structural spine (target→asset→ip→service→technology) must always
      // survive before leaf attachments (has_tls, returns). The sort is
      // stable, so edges of the same type keep their build order.
      const edgeTypePriority: Record<string, number> = {
        belongs_to: 0,
        resolves_to: 1,
        runs_on: 2,
        uses: 3,
        has_tls: 4,
        returns: 5,
      };
      edgeList.sort((a, b) => {
        // `type` is optional on the DTO — index with a fallback key so an
        // untyped edge sorts with unknown types (priority 99).
        const pa = edgeTypePriority[a.type ?? ''] ?? 99;
        const pb = edgeTypePriority[b.type ?? ''] ?? 99;
        return pa - pb;
      });
      edgeList.length = MAX_EDGES;
    }

    nodeList.sort((a, b) =>
      a.type === b.type
        ? a.id.localeCompare(b.id)
        : a.type.localeCompare(b.type),
    );
    edgeList.sort((a, b) =>
      a.source === b.source
        ? a.target.localeCompare(b.target)
        : a.source.localeCompare(b.source),
    );

    return { nodes: nodeList, edges: edgeList };
  }

  /**
   * Returns the service nodes (and the asset→service runs_on edges) for a
   * single asset. Used by the graph view to lazily expand a domain node's
   * child services. Scoped to the workspace: a foreign/unknown asset id
   * throws NotFound.
   */
  public async getAssetServiceGraph(
    assetId: string,
    workspaceId: string,
  ): Promise<AssetGraphResponseDto> {
    // 1. The asset must exist inside the requesting workspace.
    const asset = await this.assetRepo.findOne({
      where: { id: assetId, target: { workspaceId } },
    });
    if (!asset) {
      throw new NotFoundError('Asset not found');
    }

    // 2. Services of this asset (workspace scope already guaranteed by the
    //    asset lookup).
    const services = await this.assetServiceRepo.find({
      where: { assetId },
    });
    const serviceIds = services.map((svc) => svc.id);

    // 3. Latest http status per service — drives the alert flag and the
    //    lastScannedAt metadata (same correlation as the full graph).
    let statusRows: {
      statusCode: number;
      serviceId: string;
      lastScannedAt?: string;
    }[] = [];
    if (serviceIds.length > 0) {
      statusRows = await this.dataSource.query(
        `
        SELECT
          hsc."statusCode" AS "statusCode",
          hsc."assetServiceId" AS "serviceId",
          hr."createdAt" AS "lastScannedAt"
        FROM http_status_codes hsc
        INNER JOIN asset_services svc ON svc.id = hsc."assetServiceId"
        INNER JOIN http_responses hr ON hr."assetServiceId" = hsc."assetServiceId"
          AND hr.id = (
            SELECT hr2.id FROM http_responses hr2
            WHERE hr2."assetServiceId" = hr."assetServiceId"
            ORDER BY hr2."createdAt" DESC LIMIT 1
          )
        WHERE svc."assetId" = $1
          AND hsc."statusCode" IS NOT NULL
          AND hsc."statusCode" != 0
        `,
        [assetId],
      );
    }

    const alertServiceIds = new Set(
      statusRows
        .filter((row) => row.statusCode >= 400)
        .map((row) => row.serviceId),
    );
    const lastScannedAtByServiceId = new Map<string, string>();
    for (const row of statusRows) {
      if (row.lastScannedAt && !lastScannedAtByServiceId.has(row.serviceId)) {
        lastScannedAtByServiceId.set(row.serviceId, row.lastScannedAt);
      }
    }
    const statusCodeByServiceId = new Map<string, number>();
    for (const row of statusRows) {
      if (!statusCodeByServiceId.has(row.serviceId)) {
        statusCodeByServiceId.set(row.serviceId, row.statusCode);
      }
    }

    // 4. Build nodes + runs_on edges.
    const nodes: GraphNodeDto[] = [];
    const edges: GraphEdgeDto[] = [];
    for (const svc of services) {
      const id = `service|${svc.id}`;
      const lastScannedAt = lastScannedAtByServiceId.get(svc.id);
      const statusCode = statusCodeByServiceId.get(svc.id);
      nodes.push({
        id,
        type: 'service',
        data: {
          label: svc.value,
          metadata: {
            id: svc.id,
            value: svc.value,
            port: svc.port,
            assetId: svc.assetId,
            ...(lastScannedAt && { lastScannedAt }),
            ...(statusCode !== undefined && { statusCode }),
          },
          alert: alertServiceIds.has(svc.id),
        },
      });
      edges.push({
        id: `e-asset|${assetId}-${id}`,
        source: `asset|${assetId}`,
        target: id,
        type: 'runs_on',
      });
    }

    return { nodes, edges };
  }
}
