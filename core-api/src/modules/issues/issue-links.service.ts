import { IssueLinkResourceType } from '@/common/enums/enum';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  IssueLinkInputDto,
  IssueLinkResourceSummaryDto,
} from './dto/issue-link.dto';

type Row = Record<string, unknown> & { id: string };

/**
 * Per kind of linkable resource: how to find rows of a workspace by id and
 * how to summarise them. Every query is scoped to the workspace, so a link
 * cannot point at — or reveal — another tenant's resource.
 */
const RESOURCE_QUERIES: Record<
  IssueLinkResourceType,
  { sql: string; summarize: (row: Row) => IssueLinkResourceSummaryDto }
> = {
  [IssueLinkResourceType.VULNERABILITY]: {
    sql: `SELECT v."id", v."name", v."severity", v."detectionStatus",
                 v."reviewStatus", v."dueAt", a."value" AS "assetValue",
                 EXISTS (
                   SELECT 1 FROM "vulnerability_dismissals" d
                    WHERE d."vulnerabilityId" = v."id"
                      AND (d."expiresAt" IS NULL OR d."expiresAt" > now())
                 ) AS "dismissed"
            FROM "vulnerabilities" v
            JOIN "assets" a ON a."id" = v."assetId"
            JOIN "targets" t ON t."id" = a."targetId"
           WHERE v."id" = ANY($1::uuid[]) AND t."workspaceId" = $2`,
    summarize: (row) => ({
      name: row.name as string,
      severity: row.severity as IssueLinkResourceSummaryDto['severity'],
      detectionStatus:
        row.detectionStatus as IssueLinkResourceSummaryDto['detectionStatus'],
      reviewStatus:
        row.reviewStatus as IssueLinkResourceSummaryDto['reviewStatus'],
      assetValue: row.assetValue as string,
      dueAt: (row.dueAt as Date | null) ?? null,
      dismissed: Boolean(row.dismissed),
    }),
  },
  [IssueLinkResourceType.ASSET]: {
    sql: `SELECT a."id", a."value"
            FROM "assets" a
            JOIN "targets" t ON t."id" = a."targetId"
           WHERE a."id" = ANY($1::uuid[]) AND t."workspaceId" = $2`,
    summarize: (row) => ({ value: row.value as string }),
  },
  [IssueLinkResourceType.TARGET]: {
    sql: `SELECT t."id", t."value"
            FROM "targets" t
           WHERE t."id" = ANY($1::uuid[]) AND t."workspaceId" = $2`,
    summarize: (row) => ({ value: row.value as string }),
  },
  [IssueLinkResourceType.PROJECT]: {
    sql: `SELECT p."id", p."name"
            FROM "projects" p
           WHERE p."id" = ANY($1::uuid[]) AND p."workspaceId" = $2`,
    summarize: (row) => ({ name: row.name as string }),
  },
  [IssueLinkResourceType.JOB_HISTORY]: {
    // A run belongs to a workspace through its workflow, or its project.
    sql: `SELECT jh."id", jh."isCompleted", jh."createdAt"
            FROM "job_histories" jh
            LEFT JOIN "workflows" wf ON wf."id" = jh."workflowId"
            LEFT JOIN "projects" p ON p."id" = jh."projectId"
           WHERE jh."id" = ANY($1::uuid[])
             AND (wf."workspaceId" = $2 OR p."workspaceId" = $2)`,
    summarize: (row) => ({
      status: row.isCompleted ? 'completed' : 'running',
      createdAt: row.createdAt as Date,
    }),
  },
};

@Injectable()
export class IssueLinksService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Summaries of the resources of one kind that exist in the workspace. */
  async findInWorkspace(
    resourceType: IssueLinkResourceType,
    ids: string[],
    workspaceId: string,
  ): Promise<Map<string, IssueLinkResourceSummaryDto>> {
    const found = new Map<string, IssueLinkResourceSummaryDto>();
    const query = RESOURCE_QUERIES[resourceType];
    const unique = [...new Set(ids)];
    if (!query || unique.length === 0) return found;
    const rows: Row[] = await this.dataSource.query(query.sql, [
      unique,
      workspaceId,
    ]);
    for (const row of rows) found.set(row.id, query.summarize(row));
    return found;
  }

  /** Throws 404 naming every resource that is not in the workspace. */
  async assertInWorkspace(
    links: IssueLinkInputDto[],
    workspaceId: string,
  ): Promise<void> {
    const missing: string[] = [];
    for (const [type, ids] of groupByType(links)) {
      const found = await this.findInWorkspace(type, ids, workspaceId);
      for (const id of ids) {
        if (!found.has(id)) missing.push(`${type}:${id}`);
      }
    }
    if (missing.length > 0) {
      throw new NotFoundException(
        `Resources not found in this workspace: ${[...new Set(missing)].join(', ')}`,
      );
    }
  }

  /** Summary per link, `{ missing: true }` for a deleted resource. */
  async summarize(
    links: { resourceType: IssueLinkResourceType; resourceId: string }[],
    workspaceId: string,
  ): Promise<IssueLinkResourceSummaryDto[]> {
    const found = new Map<IssueLinkResourceType, Map<string, IssueLinkResourceSummaryDto>>();
    for (const [type, ids] of groupByType(links)) {
      found.set(type, await this.findInWorkspace(type, ids, workspaceId));
    }
    return links.map(
      (link) =>
        found.get(link.resourceType)?.get(link.resourceId) ?? { missing: true },
    );
  }
}

function groupByType(
  links: { resourceType: IssueLinkResourceType; resourceId: string }[],
): Map<IssueLinkResourceType, string[]> {
  const byType = new Map<IssueLinkResourceType, string[]>();
  for (const link of links) {
    byType.set(link.resourceType, [
      ...(byType.get(link.resourceType) ?? []),
      link.resourceId,
    ]);
  }
  return byType;
}
