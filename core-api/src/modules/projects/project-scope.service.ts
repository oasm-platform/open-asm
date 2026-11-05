import {
  ProjectAssetSource,
  ProjectScopeRuleMode,
  ProjectScopeRuleType,
} from '@/common/enums/enum';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type {
  ProjectScopeDto,
  ScopePreviewResultDto,
  ScopeRuleDto,
  ScopeRuleInputDto,
} from './dto/project-scope.dto';
import { Project } from './entities/project.entity';
import { ProjectScopeRule } from './entities/project-scope-rule.entity';
import { findProjectOrFail } from './project-access';
import {
  normalizeScopeRuleValue,
  type ScopeRuleLike,
  scopeRuleMatchSql,
  scopeRulesSql,
  SqlParams,
} from './scope-rules';

/** Assets of the workspace (alias `a`), the workspace id in parameter `ws`. */
const workspaceAssets = (ws: string) =>
  `FROM assets a JOIN targets t ON t.id = a."targetId" WHERE t."workspaceId" = ${ws}`;
const WORKSPACE_ASSETS = workspaceAssets('$2');

export interface ScopeSyncResult {
  /** Assets the rules added to the project. */
  added: string[];
  /** Rule-added assets the rules no longer select. */
  removed: number;
}

/**
 * Rule-based project scope. Include rules add matching assets with
 * `source = rule`; exclude rules keep matches out. Hand-picked assets are never
 * touched by a rule: they leave the project only when removed by hand.
 */
@Injectable()
export class ProjectScopeService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectScopeRule)
    private readonly ruleRepo: Repository<ProjectScopeRule>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Validates the rule values (400 on the first bad one), checks that target
   * and asset ids belong to the workspace, and drops exact duplicates.
   */
  async normalizeRules(
    workspaceId: string,
    rules: ScopeRuleInputDto[],
  ): Promise<ScopeRuleLike[]> {
    const normalized = rules.map((rule) => {
      try {
        return {
          mode: rule.mode,
          type: rule.type,
          value: normalizeScopeRuleValue(rule.type, rule.value),
        };
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
    });

    const idsOf = (type: ProjectScopeRuleType) => [
      ...new Set(normalized.filter((r) => r.type === type).map((r) => r.value)),
    ];
    const targetIds = idsOf(ProjectScopeRuleType.TARGET);
    if (targetIds.length > 0) {
      const found: Array<{ id: string }> = await this.dataSource.query(
        `SELECT id FROM targets WHERE id = ANY($1::uuid[]) AND "workspaceId" = $2`,
        [targetIds, workspaceId],
      );
      const missing = targetIds.filter((id) => !found.some((f) => f.id === id));
      if (missing.length > 0) {
        throw new BadRequestException(`Target "${missing[0]}" not found`);
      }
    }
    const assetIds = idsOf(ProjectScopeRuleType.ASSET);
    if (assetIds.length > 0) {
      const found: Array<{ id: string }> = await this.dataSource.query(
        `SELECT a.id ${workspaceAssets('$1')} AND a.id = ANY($2::uuid[])`,
        [workspaceId, assetIds],
      );
      const missing = assetIds.filter((id) => !found.some((f) => f.id === id));
      if (missing.length > 0) {
        throw new BadRequestException(`Asset "${missing[0]}" not found`);
      }
    }

    const seen = new Set<string>();
    return normalized.filter((rule) => {
      const key = `${rule.mode}|${rule.type}|${rule.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** The project's rules with labels and match counts. */
  async getScope(
    projectId: string,
    workspaceId: string,
  ): Promise<ProjectScopeDto> {
    const project = await findProjectOrFail(
      this.projectRepo,
      projectId,
      workspaceId,
    );
    const rules = await this.ruleRepo.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    });
    const [perRule, labels, counts] = await Promise.all([
      this.countPerRule(workspaceId, rules),
      this.labelsOf(rules),
      this.dataSource.query<Array<{ source: ProjectAssetSource; count: string }>>(
        `SELECT source, COUNT(*)::int AS count FROM project_assets WHERE "projectId" = $1 GROUP BY source`,
        [projectId],
      ),
    ]);
    const countOf = (source: ProjectAssetSource) =>
      Number(counts.find((c) => c.source === source)?.count ?? 0);

    return {
      rules: rules.map(
        (rule, i): ScopeRuleDto => ({
          id: rule.id,
          mode: rule.mode,
          type: rule.type,
          value: rule.value,
          label: labels.get(rule.value) ?? rule.value,
          matched: perRule[i],
        }),
      ),
      autoAddAssets: project.autoAddAssets,
      ruleAssets: countOf(ProjectAssetSource.RULE),
      manualAssets: countOf(ProjectAssetSource.MANUAL),
    };
  }

  /**
   * Replaces the rule set and re-syncs the rule-added assets in one
   * transaction. Returns what joined and how many left.
   */
  async replaceRules(
    projectId: string,
    workspaceId: string,
    input: ScopeRuleInputDto[],
    autoAddAssets?: boolean,
  ): Promise<ScopeSyncResult> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId, {
      writable: true,
    });
    const rules = await this.normalizeRules(workspaceId, input);

    return this.dataSource.transaction(async (manager) => {
      await manager.delete(ProjectScopeRule, { projectId });
      const saved = rules.length
        ? await manager.save(
            rules.map((rule) =>
              manager.create(ProjectScopeRule, { ...rule, projectId }),
            ),
          )
        : [];
      if (autoAddAssets !== undefined) {
        await manager.update(Project, { id: projectId }, { autoAddAssets });
      }
      return this.sync(manager, projectId, workspaceId, saved);
    });
  }

  /**
   * Makes the rule-added assets equal to what the rules select: removes the
   * ones no longer selected, adds the new ones (a hand-picked row for the same
   * asset is left as is) and points kept rows at the include rule that now
   * matches them.
   */
  async sync(
    manager: EntityManager,
    projectId: string,
    workspaceId: string,
    rules: ScopeRuleLike[],
  ): Promise<ScopeSyncResult> {
    const params = new SqlParams([projectId, workspaceId]);
    const built = scopeRulesSql(rules, params);
    if (!built) {
      const removed: unknown[] = await manager.query(
        `DELETE FROM project_assets WHERE "projectId" = $1 AND source = $2 RETURNING id`,
        [projectId, ProjectAssetSource.RULE],
      );
      return { added: [], removed: deletedCount(removed) };
    }

    const desired = `WITH desired AS (SELECT a.id AS "assetId", ${built.ruleIdSql()} AS "ruleId" ${WORKSPACE_ASSETS} AND ${built.where})`;
    const removed: unknown[] = await manager.query(
      `${desired}
       DELETE FROM project_assets pa
        WHERE pa."projectId" = $1 AND pa.source = '${ProjectAssetSource.RULE}'
          AND NOT EXISTS (SELECT 1 FROM desired d WHERE d."assetId" = pa."assetId")
       RETURNING pa.id`,
      params.values,
    );
    await manager.query(
      `${desired}
       UPDATE project_assets pa SET "scopeRuleId" = d."ruleId"
         FROM desired d
        WHERE pa."projectId" = $1 AND pa."assetId" = d."assetId"
          AND pa.source = '${ProjectAssetSource.RULE}'
          AND pa."scopeRuleId" IS DISTINCT FROM d."ruleId"`,
      params.values,
    );
    const added: Array<{ assetId: string }> = await manager.query(
      `${desired}
       INSERT INTO project_assets ("projectId", "assetId", source, "scopeRuleId")
       SELECT $1, d."assetId", '${ProjectAssetSource.RULE}', d."ruleId" FROM desired d
       ON CONFLICT ("projectId", "assetId") DO NOTHING
       RETURNING "assetId"`,
      params.values,
    );
    return {
      added: added.map((row) => row.assetId),
      removed: deletedCount(removed),
    };
  }

  /**
   * Counts what a rule set would select, without saving it. `perRule[i]` is
   * how many assets include rule i matches, or how many of the include
   * matches exclude rule i removes.
   */
  async preview(
    workspaceId: string,
    input: ScopeRuleInputDto[],
    projectId?: string,
  ): Promise<ScopePreviewResultDto> {
    if (projectId) {
      await findProjectOrFail(this.projectRepo, projectId, workspaceId);
    }
    const rules = await this.normalizeRules(workspaceId, input);
    const perRule = await this.countPerRule(workspaceId, rules);

    const params = new SqlParams([projectId ?? null, workspaceId]);
    const built = scopeRulesSql(rules, params);
    const selected = built
      ? `SELECT a.id ${WORKSPACE_ASSETS} AND ${built.where}`
      : `SELECT a.id ${WORKSPACE_ASSETS} AND false`;
    // `$1` is the project (or NULL): its hand-picked assets count too.
    const [row] = await this.dataSource.query<
      Array<{ ruleAssets: number; total: number }>
    >(
      `WITH selected AS (${selected})
       SELECT (SELECT COUNT(*) FROM selected)::int AS "ruleAssets",
              (SELECT COUNT(*) FROM (
                 SELECT id FROM selected
                 UNION
                 SELECT pa."assetId" FROM project_assets pa
                  WHERE pa."projectId" = CAST($1 AS uuid) AND pa.source = '${ProjectAssetSource.MANUAL}'
               ) s)::int AS total`,
      params.values,
    );
    return {
      ruleAssets: row?.ruleAssets ?? 0,
      total: row?.total ?? 0,
      perRule,
    };
  }

  /**
   * Adds newly discovered assets to every project whose rules select them,
   * for projects that auto-add and are not archived. Returns, per project,
   * the assets that actually joined (a redelivered batch adds nothing).
   */
  async addDiscoveredAssets(
    workspaceId: string,
    assetIds: string[],
  ): Promise<Map<string, string[]>> {
    const added = new Map<string, string[]>();
    if (assetIds.length === 0) return added;

    const rules: Array<ScopeRuleLike & { projectId: string }> =
      await this.dataSource.query(
        `SELECT r.id, r."projectId", r.mode, r.type, r.value
           FROM project_scope_rules r
           JOIN projects p ON p.id = r."projectId"
          WHERE p."workspaceId" = $1 AND p."autoAddAssets" AND p."archivedAt" IS NULL
          ORDER BY r."createdAt"`,
        [workspaceId],
      );
    const byProject = new Map<string, ScopeRuleLike[]>();
    for (const rule of rules) {
      byProject.set(rule.projectId, [
        ...(byProject.get(rule.projectId) ?? []),
        rule,
      ]);
    }

    for (const [projectId, projectRules] of byProject) {
      const params = new SqlParams([projectId, workspaceId, assetIds]);
      const built = scopeRulesSql(projectRules, params);
      if (!built) continue;
      const rows: Array<{ assetId: string }> = await this.dataSource.query(
        `INSERT INTO project_assets ("projectId", "assetId", source, "scopeRuleId")
         SELECT $1, a.id, '${ProjectAssetSource.RULE}', ${built.ruleIdSql()}
           ${WORKSPACE_ASSETS} AND a.id = ANY($3::uuid[]) AND ${built.where}
         ON CONFLICT ("projectId", "assetId") DO NOTHING
         RETURNING "assetId"`,
        params.values,
      );
      if (rows.length > 0) {
        added.set(
          projectId,
          rows.map((row) => row.assetId),
        );
      }
    }
    return added;
  }

  /**
   * Keeps removed assets out: each one the include rules still select gets an
   * exclude rule, otherwise the next sync would add it back.
   */
  async excludeMatchedAssets(
    projectId: string,
    workspaceId: string,
    assetIds: string[],
  ): Promise<void> {
    if (assetIds.length === 0) return;
    const rules = await this.ruleRepo.find({ where: { projectId } });
    const params = new SqlParams([assetIds, workspaceId]);
    const built = scopeRulesSql(rules, params);
    if (!built) return;
    const matched: Array<{ id: string }> = await this.dataSource.query(
      `SELECT a.id ${WORKSPACE_ASSETS} AND a.id = ANY($1::uuid[]) AND ${built.where}`,
      params.values,
    );
    if (matched.length === 0) return;
    await this.ruleRepo.save(
      matched.map((row) =>
        this.ruleRepo.create({
          projectId,
          mode: ProjectScopeRuleMode.EXCLUDE,
          type: ProjectScopeRuleType.ASSET,
          value: row.id,
        }),
      ),
    );
  }

  private async countPerRule(
    workspaceId: string,
    rules: ScopeRuleLike[],
  ): Promise<number[]> {
    const includes = rules.filter(
      (r) => r.mode === ProjectScopeRuleMode.INCLUDE,
    );
    return Promise.all(
      rules.map(async (rule) => {
        const params = new SqlParams([workspaceId]);
        let where = scopeRuleMatchSql(rule, params);
        if (rule.mode === ProjectScopeRuleMode.EXCLUDE) {
          const included = scopeRulesSql(includes, params);
          if (!included) return 0;
          where += ` AND ${included.where}`;
        }
        const [row] = await this.dataSource.query<Array<{ count: number }>>(
          `SELECT COUNT(*)::int AS count ${workspaceAssets('$1')} AND ${where}`,
          params.values,
        );
        return row?.count ?? 0;
      }),
    );
  }

  /** Display values for id-based rules: the target or asset value. */
  private async labelsOf(rules: ScopeRuleLike[]): Promise<Map<string, string>> {
    const ids = rules
      .filter(
        (r) =>
          r.type === ProjectScopeRuleType.TARGET ||
          r.type === ProjectScopeRuleType.ASSET,
      )
      .map((r) => r.value);
    if (ids.length === 0) return new Map();
    const rows: Array<{ id: string; value: string }> = await this.dataSource.query(
      `SELECT id::text AS id, value FROM targets WHERE id = ANY($1::uuid[])
       UNION ALL
       SELECT id::text AS id, value FROM assets WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return new Map(rows.map((row) => [row.id, row.value]));
  }
}

/** Row count of a `DELETE … RETURNING` through `manager.query`. */
function deletedCount(result: unknown[]): number {
  // pg returns [rows, rowCount] for DELETE … RETURNING via TypeORM.
  if (Array.isArray(result[0])) return (result[0] as unknown[]).length;
  return result.length;
}
