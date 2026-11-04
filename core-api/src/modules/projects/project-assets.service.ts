import {
  GetManyBaseQueryParams,
  SortOrder,
} from '@/common/dtos/get-many-base.dto';
import { ProjectAssetSource } from '@/common/enums/enum';
import { openVulnerabilityCondition } from '@/modules/vulnerabilities/open-vulnerability';
import { getManyResponse } from '@/utils/getManyResponse';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import type {
  GetProjectAssetsQueryDto,
  ProjectAssetDto,
} from './dto/project-assets.dto';
import { Project } from './entities/project.entity';
import { findProjectOrFail } from './project-access';
import { ProjectScopeService } from './project-scope.service';

const ALLOWED_ASSET_SORT_FIELDS = ['createdAt', 'updatedAt', 'value'] as const;

const ASSET_LIST_SORT: Record<string, string> = {
  value: 'a.value',
  addedAt: 'pa."createdAt"',
  createdAt: 'pa."createdAt"',
};

@Injectable()
export class ProjectAssetsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
    private readonly dataSource: DataSource,
    private readonly scope: ProjectScopeService,
  ) {}

  /**
   * Adds assets by hand. Idempotent: an asset already in the project becomes
   * hand-picked (so a later rule edit no longer removes it). Returns the
   * assets that were not in the project before.
   */
  async add(
    projectId: string,
    workspaceId: string,
    assetIds: string[],
  ): Promise<string[]> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId, {
      writable: true,
    });
    // Same workspace only: the listing constrains the project's tenant, so a
    // foreign asset attached here would leak into it.
    const assets = await this.assetRepo.find({
      where: { id: In(assetIds), target: { workspaceId } },
      select: { id: true },
    });
    const found = new Set(assets.map((asset) => asset.id));
    const missing = assetIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(
        `One or more assets with IDs "${missing.join(', ')}" not found`,
      );
    }

    const rows: Array<{ assetId: string; inserted: boolean }> =
      await this.dataSource.query(
        `INSERT INTO project_assets ("projectId", "assetId", source)
         SELECT $1, id, '${ProjectAssetSource.MANUAL}' FROM unnest($2::uuid[]) AS id
         ON CONFLICT ("projectId", "assetId") DO UPDATE
            SET source = '${ProjectAssetSource.MANUAL}', "scopeRuleId" = NULL, "updatedAt" = now()
          WHERE project_assets.source <> '${ProjectAssetSource.MANUAL}'
         RETURNING "assetId", (xmax = 0) AS inserted`,
        [projectId, assetIds],
      );
    return rows.filter((row) => row.inserted).map((row) => row.assetId);
  }

  /**
   * Removes assets. One the rules still select also gets an exclude rule, so
   * the next rule sync does not add it back.
   */
  async remove(
    projectId: string,
    workspaceId: string,
    assetIds: string[],
  ): Promise<number> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId, {
      writable: true,
    });
    await this.scope.excludeMatchedAssets(projectId, workspaceId, assetIds);
    const result: unknown[] = await this.dataSource.query(
      `DELETE FROM project_assets WHERE "projectId" = $1 AND "assetId" = ANY($2::uuid[]) RETURNING id`,
      [projectId, assetIds],
    );
    return Array.isArray(result[0]) ? (result[0] as unknown[]).length : result.length;
  }

  /**
   * The project's assets with why they are in it, the open vulnerabilities
   * the project found on them, and the project's last run that scanned them.
   */
  async list(
    projectId: string,
    workspaceId: string,
    query: GetProjectAssetsQueryDto,
  ) {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId);
    const { page, limit, sortOrder, search, source } = query;
    const params: unknown[] = [projectId];
    const where: string[] = ['pa."projectId" = $1'];
    if (search) {
      params.push(`%${search}%`);
      where.push(`a.value ILIKE $${params.length}`);
    }
    if (source) {
      params.push(source);
      where.push(`pa.source = $${params.length}`);
    }
    const whereSql = where.join(' AND ');
    const order = ASSET_LIST_SORT[query.sortBy] ?? 'pa."createdAt"';
    const direction = sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';

    const [{ total }]: Array<{ total: number }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM project_assets pa JOIN assets a ON a.id = pa."assetId" WHERE ${whereSql}`,
      params,
    );
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT a.id, a.value, t.id AS "targetId", t.value AS "targetValue", t.type AS "targetType",
              pa.source, pa."createdAt" AS "addedAt",
              r.id AS "ruleId", r.type AS "ruleType", r.value AS "ruleValue",
              COALESCE(rt.value, ra.value, r.value) AS "ruleLabel",
              vc.*, ls.id AS "lastScanRunId", ls."createdAt" AS "lastScanAt"
         FROM project_assets pa
         JOIN assets a ON a.id = pa."assetId"
         JOIN targets t ON t.id = a."targetId"
         LEFT JOIN project_scope_rules r ON r.id = pa."scopeRuleId"
         LEFT JOIN targets rt ON r.type = 'target' AND rt.id::text = r.value
         LEFT JOIN assets ra ON r.type = 'asset' AND ra.id::text = r.value
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER (WHERE v.severity = 'critical')::int AS critical,
                  COUNT(*) FILTER (WHERE v.severity = 'high')::int AS high,
                  COUNT(*) FILTER (WHERE v.severity = 'medium')::int AS medium,
                  COUNT(*) FILTER (WHERE v.severity = 'low')::int AS low,
                  COUNT(*) FILTER (WHERE v.severity = 'info')::int AS info
             FROM project_vulnerabilities pv
             JOIN vulnerabilities v ON v.id = pv."vulnerabilityId"
            WHERE pv."projectId" = pa."projectId" AND v."assetId" = a.id
              AND ${openVulnerabilityCondition('v')}
         ) vc ON true
         LEFT JOIN LATERAL (
           SELECT jh.id, jh."createdAt" FROM job_histories jh
            WHERE jh."projectId" = pa."projectId" AND jh.scope -> 'assetIds' ? a.id::text
            ORDER BY jh."createdAt" DESC LIMIT 1
         ) ls ON true
        WHERE ${whereSql}
        ORDER BY ${order} ${direction}, a.id
        LIMIT ${Number(limit)} OFFSET ${(Number(page) - 1) * Number(limit)}`,
      params,
    );

    const data: ProjectAssetDto[] = rows.map((row) => ({
      id: row.id as string,
      value: row.value as string,
      targetId: row.targetId as string,
      targetValue: row.targetValue as string,
      targetType: row.targetType as ProjectAssetDto['targetType'],
      source: row.source as ProjectAssetSource,
      rule: row.ruleId
        ? {
            id: row.ruleId as string,
            type: row.ruleType as NonNullable<ProjectAssetDto['rule']>['type'],
            value: row.ruleValue as string,
            label: row.ruleLabel as string,
          }
        : null,
      addedAt: row.addedAt as Date,
      vulnerabilities: {
        critical: Number(row.critical ?? 0),
        high: Number(row.high ?? 0),
        medium: Number(row.medium ?? 0),
        low: Number(row.low ?? 0),
        info: Number(row.info ?? 0),
      },
      lastScan: row.lastScanRunId
        ? {
            runId: row.lastScanRunId as string,
            createdAt: row.lastScanAt as Date,
          }
        : null,
    }));
    return getManyResponse({ query, data, total });
  }

  /** Assets of the workspace not in the project, for the add dialog. */
  async candidates(
    projectId: string,
    workspaceId: string,
    query: GetManyBaseQueryParams,
  ) {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId);
    const { page, limit, sortBy, sortOrder, search } = query;
    const queryBuilder = this.assetRepo
      .createQueryBuilder('asset')
      .leftJoin(
        'project_assets',
        'pa',
        'pa."assetId" = asset.id AND pa."projectId" = :projectId',
        { projectId },
      )
      .innerJoin(
        'targets',
        'target',
        'target.id = asset."targetId" AND target."workspaceId" = :workspaceId',
        { workspaceId },
      )
      .where('pa."assetId" IS NULL');

    if (search) {
      queryBuilder.andWhere('asset.value ILIKE :search', {
        search: `%${search}%`,
      });
    }

    const safeSortBy = (ALLOWED_ASSET_SORT_FIELDS as readonly string[]).includes(
      sortBy,
    )
      ? sortBy
      : 'createdAt';
    const [data, total] = await queryBuilder
      .orderBy(`asset.${safeSortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return getManyResponse({ query, data, total });
  }
}
