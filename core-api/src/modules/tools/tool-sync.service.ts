import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { In, Repository } from 'typeorm';
import { Lock } from '@/services/redis/lock.decorator';
import { WorkerType } from '@/common/enums/enum';
import { JobPriority } from '@/common/enums/enum';
import { Tool } from './entities/tools.entity';
import { WorkspaceTool } from './entities/workspace_tools.entity';
import { StorageService } from '../storage/storage.service';
import { DataSource } from 'typeorm';
import { parseManifestCategories, sameCategories } from './tool-categories';
import { builtInTools } from './tools-provider/built-in-tools';

/** The manifest fields an existing tool row is overridden with. */
type ConnectorOverride = {
  insert: Pick<
    Tool,
    | 'name'
    | 'isOfficialSupport'
    | 'description'
    | 'categories'
    | 'version'
    | 'logoUrl'
    | 'priority'
  >;
  logoBase64?: string;
};

/**
 * Handles all startup synchronization of tool data:
 * - Built-in tools upsert & orphan cleanup
 * - Connector tools sync from manifest.json
 * - Legacy PROVIDER tool cleanup
 *
 * Extracted from ToolsService to isolate the init-heavy sync logic.
 * Registered as provider (not exported) — only invoked via OnModuleInit.
 */
@Injectable()
export class ToolSyncService implements OnModuleInit {
  private readonly logger = new Logger(ToolSyncService.name);

  constructor(
    @InjectRepository(Tool)
    private readonly toolsRepository: Repository<Tool>,

    @InjectRepository(WorkspaceTool)
    private readonly workspaceToolRepository: Repository<WorkspaceTool>,

    private readonly storageService: StorageService,

    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    try {
      await this.syncAll();
    } catch {
      // Startup sync is best-effort; failures must not block module init.
    }
  }

  private async syncAll() {
    // Column-only type for insert (strips relation properties from Tool)
    type ToolInsert = Omit<
      Tool,
      | 'workspaceTools'
      | 'jobs'
      | 'vulnerabilities'
      | 'assetTags'
      | 'provider'
      | 'apiKey'
      | 'workers'
      | 'parser'
      | 'isInstalled'
      | 'availableWorkersCount'
    >;

    // Convert builtInTools to Tool entities
    const builtInToolsToInsert = builtInTools.map(
      (tool): ToolInsert => ({
        ...tool,
        id: randomUUID(),
        isBuiltIn: true,
        isOfficialSupport: true,
        type: WorkerType.BUILT_IN,
      }),
    );

    // Insert built-in tools — unique is now (name) only, so we handle
    // upsert manually to avoid overwriting an existing CONNECTOR with same name.
    // Connector data has priority, so we only create/update BUILT_IN rows.
    const existingForBuiltIn = await this.toolsRepository.find({
      where: { name: In(builtInTools.map((t) => t.name)) },
    });
    const existingBuiltInMap = new Map<string, Tool>();
    for (const t of existingForBuiltIn) {
      if (t.name) existingBuiltInMap.set(t.name, t);
    }
    const builtInToUpsert: ToolInsert[] = [];
    for (const tool of builtInToolsToInsert) {
      const existing = existingBuiltInMap.get(tool.name);
      if (!existing) {
        builtInToUpsert.push(tool);
        continue;
      }
      // Only update if existing is still BUILT_IN; do not overwrite a CONNECTOR
      if (existing.type !== WorkerType.BUILT_IN) continue;
      const needsUpdate =
        existing.description !== tool.description ||
        existing.logoUrl !== tool.logoUrl ||
        existing.version !== tool.version ||
        existing.priority !== tool.priority ||
        !sameCategories(existing.categories, tool.categories);
      if (needsUpdate) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        builtInToUpsert.push({ ...tool, id: existing.id! } as ToolInsert);
      }
    }
    if (builtInToUpsert.length > 0) {
      await this.toolsRepository
        .createQueryBuilder()
        .insert()
        .orUpdate({
          conflict_target: ['name'],
          overwrite: ['description', 'logoUrl', 'version', 'priority', 'categories', 'type', 'isBuiltIn', 'isOfficialSupport'],
        })
        .values(builtInToUpsert)
        .execute();
    }

    // Remove built-in tools no longer declared — wrapped in distributed
    // lock so only one replica runs cleanup across a multi-instance cluster.
    await this.removeOrphanBuiltInTools();

    // Sync connector tools from manifest.json (logo stored as path, upload base64 after commit)
    // This also handles legacy PROVIDER → CONNECTOR takeover and orphan cleanup.
    // With unique(name), connector data overrides any existing tool with same slug.
    await this.syncConnectorTools();
  }

  /**
   * Sync connector tools from resources/connectors/manifest.json.
   * - logoUrl is stored as path /connectors/<slug>.png (not base64)
   * - After DB commit, returns only tools inserted/updated in this run for logo upload
   * - Uploads base64 logos to StorageService (bucket: system) ensuring files exist when used
   */
  private async syncConnectorTools(): Promise<Tool[]> {
    // Single-writer invariant: manifest read → dedup → override → upsert →
    // orphan cleanup runs under one distributed lock so concurrent replicas of
    // the API cannot interleave reads and writes of the tools table.
    // @Lock releases the lock as soon as the sync completes, so the TTL
    // (120s) only matters if a replica dies mid-sync — generous headroom for
    // manifest fetch, logo uploads and the inner locks.
    return (await this.syncConnectorToolsLocked()) ?? [];
  }

  /**
   * Locked body of syncConnectorTools. Resolves undefined, without syncing,
   * while another replica holds the 'connector-sync' lock.
   */
  @Lock('connector-sync', { ttl: 120_000 })
  private async syncConnectorToolsLocked(): Promise<Tool[] | undefined> {
    const manifestPath = path.resolve(
      process.cwd(),
      'resources',
      'connectors',
      'manifest.json',
    );

    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, 'utf-8');
    } catch {
      return [];
    }

    let manifest: { connectors?: Array<Record<string, unknown>> };
    try {
      manifest = JSON.parse(raw) as { connectors?: Array<Record<string, unknown>> };
    } catch {
      return [];
    }

    const connectors = manifest.connectors;
    if (!Array.isArray(connectors) || connectors.length === 0) {
      return [];
    }

    type ToolInsert = Omit<
      Tool,
      | 'workspaceTools'
      | 'jobs'
      | 'vulnerabilities'
      | 'assetTags'
      | 'provider'
      | 'apiKey'
      | 'workers'
      | 'parser'
      | 'isInstalled'
      | 'availableWorkersCount'
    >;

    const connectorEntries: Array<{ insert: ToolInsert; logoBase64?: string }> = [];
    // Every slug in the manifest, including connectors skipped below: a
    // connector this platform cannot read is not removed, and orphan cleanup
    // must not delete it (that cascades to its config profiles and jobs).
    const manifestSlugs: string[] = [];

    for (const rawEntry of connectors) {
      const slug = String((rawEntry['slug'] as string) ?? (rawEntry['name'] as string) ?? '').toLowerCase();
      if (!slug) continue;
      manifestSlugs.push(slug);
      const name = slug;
      const description =
        (rawEntry['description'] as string) ??
        (rawEntry['shortDescription'] as string) ??
        '';
      const version = (rawEntry['version'] as string) ?? '';
      const logoBase64 = rawEntry['logo'] as string | undefined;
      const { categories, skipped, unknownTargetTypes } = parseManifestCategories(
        rawEntry['capabilities'],
      );
      if (skipped.length > 0) {
        this.logger.warn(`Connector "${slug}": skipped capabilities ${skipped.join(', ')}`);
      }
      if (unknownTargetTypes.length > 0) {
        this.logger.warn(
          `Connector "${slug}" declares target types this platform does not support yet: ${unknownTargetTypes.join(', ')}`,
        );
      }
      if (categories.length === 0) {
        this.logger.warn(`Connector "${slug}" skipped: no supported capability`);
        continue;
      }
      const author = String((rawEntry['author'] as string) ?? '').trim().toLowerCase();
      const isOfficialSupport = author === 'oasm';

      // logoUrl must mirror the manifest's logo presence exactly: a missing/empty
      // logo maps to SQL NULL (never a stale /connectors/<slug>.png path). The
      // value is assigned as `null` explicitly (not omitted) so TypeORM's INSERT
      // and `orUpdate` both write NULL rather than falling back to a DEFAULT.
      const hasLogo = typeof logoBase64 === 'string' && logoBase64.length > 0;
      const logoUrl = (hasLogo ? `/connectors/${name}.png` : null) as unknown as string;

      const insert: ToolInsert = {
        id: randomUUID(),
        name,
        description,
        categories,
        version,
        logoUrl,
        isBuiltIn: false,
        isOfficialSupport,
        type: WorkerType.CONNECTOR,
        priority: JobPriority.MEDIUM,
      };

      connectorEntries.push({ insert, logoBase64 });
    }

    if (connectorEntries.length === 0) return [];

    // With unique(name), connector data overrides any existing tool with same slug,
    // regardless of its current type (BUILT_IN, PROVIDER, CONNECTOR). This handles:
    // - legacy officialSupportTools (nessus as PROVIDER) -> CONNECTOR
    // - leftover duplicates from unique(name,type) era (e.g., nuclei) -> single CONNECTOR
    const allConnectorNames = connectorEntries.map((e) => e.insert.name);

    // Fetch all existing tools that share a slug with manifest (any type)
    const existingTools = await this.toolsRepository.find({
      where: { name: In(allConnectorNames) },
    });
    // Group by name to handle leftover duplicates from unique(name,type) era
    const existingByName = new Map<string, Tool[]>();
    for (const t of existingTools) {
      if (!t.name) continue;
      const arr = existingByName.get(t.name) ?? [];
      arr.push(t);
      existingByName.set(t.name, arr);
    }
    // Deduplicate: keep one per name (prefer CONNECTOR, else first), migrate FKs from dups
    const existingMap =
      (await this.dedupeExistingTools(existingByName)) ?? new Map<string, Tool>();

    // Override existing tools with connector data (priority to manifest)
    await this.overrideExistingTools(connectorEntries, existingMap);

    const toUpsert: ToolInsert[] = [];
    const logoMap = new Map<string, string>();

    for (const { insert, logoBase64 } of connectorEntries) {
      if (logoBase64) {
        logoMap.set(insert.name, logoBase64);
      }
      // Remaining entries are truly new (no existing row)
      toUpsert.push(insert);
    }

    if (toUpsert.length === 0) {
      // Still cleanup orphans (use original manifest names to avoid false orphans after takeover splice)
      await this.removeOrphanConnectorTools(manifestSlugs);
      await this.removeOrphanProviderTools(manifestSlugs);
      return [];
    }

    // Commit to DB — unique is now (name) only, connector overrides any existing name
    await this.toolsRepository
      .createQueryBuilder()
      .insert()
      .orUpdate({
        conflict_target: ['name'],
        overwrite: ['description', 'logoUrl', 'version', 'priority', 'categories', 'type', 'isBuiltIn', 'isOfficialSupport'],
      })
      .values(toUpsert)
      .execute();

    // Fetch the committed rows (only those we just upserted)
    const committedTools = await this.toolsRepository.find({
      where: {
        name: In(toUpsert.map((t) => t.name)),
      },
    });

    // Upload logos only for committed tools that have base64
    const uploads: Promise<unknown>[] = [];
    for (const tool of committedTools) {
      const base64 = logoMap.get(tool.name);
      if (!base64) continue;
      try {
        const buffer = this.decodeLogo(base64);
        if (!buffer) continue;
        const fileName = `connectors/${tool.name}.png`;
        uploads.push(this.storageService.uploadFile(fileName, buffer, 'system').catch(() => undefined));
      } catch {
        // ignore malformed logo payload — DB row already saved
      }
    }

    if (uploads.length > 0) {
      await Promise.allSettled(uploads);
    }

    // Cleanup connector orphans after successful sync (use original manifest names)
    await this.removeOrphanConnectorTools(manifestSlugs);

    // Cleanup legacy PROVIDER official-support tools no longer in manifest
    await this.removeOrphanProviderTools(manifestSlugs);

    return committedTools;
  }

  /**
   * Keeps one row per connector name (prefer CONNECTOR, else first) and
   * migrates FKs from the duplicates. Resolves undefined, without touching
   * anything, while another replica holds the lock.
   */
  @Lock('connector-override-dedup', { ttl: 10_000 })
  private async dedupeExistingTools(
    existingByName: Map<string, Tool[]>,
  ): Promise<Map<string, Tool> | undefined> {
    const existingMap = new Map<string, Tool>();
    for (const [name, rows] of existingByName.entries()) {
      if (rows.length <= 1) {
        existingMap.set(name, rows[0]);
        continue;
      }
      // Keep the row that is already CONNECTOR if exists, otherwise first
      rows.sort((a, b) => {
        if (a.type === WorkerType.CONNECTOR && b.type !== WorkerType.CONNECTOR) return -1;
        if (b.type === WorkerType.CONNECTOR && a.type !== WorkerType.CONNECTOR) return 1;
        return 0;
      });
      const keeper = rows[0];
      existingMap.set(name, keeper);
      const dups = rows.slice(1);
      for (const dup of dups) {
        const dupId = dup.id;
        const keepId = keeper.id;
        if (!dupId || !keepId) continue;
        await this.workspaceToolRepository.manager.query(
          `DELETE FROM workspace_tools WHERE "toolId" = $1 AND "workspaceId" IN (SELECT "workspaceId" FROM workspace_tools WHERE "toolId" = $2)`,
          [dupId, keepId],
        );
        await this.workspaceToolRepository.manager.query(`UPDATE workspace_tools SET "toolId" = $1 WHERE "toolId" = $2`, [keepId, dupId]);
        await this.dataSource.query(`UPDATE workers SET "toolId" = $1 WHERE "toolId" = $2`, [keepId, dupId]);
        await this.workspaceToolRepository.manager.query(
          `DELETE FROM "tool_config_profiles" WHERE "toolId" = $1 AND ("workspaceId", "name") IN (SELECT "workspaceId", "name" FROM "tool_config_profiles" WHERE "toolId" = $2)`,
          [dupId, keepId],
        );
        await this.workspaceToolRepository.manager.query(`UPDATE "tool_config_profiles" SET "toolId" = $1 WHERE "toolId" = $2`, [keepId, dupId]);
        await this.workspaceToolRepository.manager.query(`UPDATE "api_keys" SET "ref" = $1 WHERE "ref" = $2 AND "type" = 'tool'`, [String(keepId), String(dupId)]);
        await this.workspaceToolRepository.manager.query(`UPDATE "jobs" SET "toolId" = $1 WHERE "toolId" = $2`, [keepId, dupId]);
        await this.workspaceToolRepository.manager.query(`UPDATE "vulnerabilities" SET "toolId" = $1 WHERE "toolId" = $2`, [keepId, dupId]);
        await this.workspaceToolRepository.manager.query(`UPDATE "asset_services_tags" SET "toolId" = $1 WHERE "toolId" = $2`, [keepId, dupId]);
        try {
          await this.workspaceToolRepository.manager.query(`UPDATE "asset_tags" SET "toolId" = $1 WHERE "toolId" = $2`, [keepId, dupId]);
        } catch {
          void 0; // ignore if asset_tags table/col not exists (legacy DB)
        }
        await this.toolsRepository.delete(dupId);
      }
    }
    return existingMap;
  }

  /**
   * Overrides existing tools with connector data (priority to manifest) and
   * removes every entry it handles from `connectorEntries`, leaving only the
   * truly new ones to insert.
   */
  @Lock('connector-override', { ttl: 10_000 })
  private async overrideExistingTools(
    connectorEntries: ConnectorOverride[],
    existingMap: Map<string, Tool>,
  ): Promise<void> {
    for (const entry of [...connectorEntries]) {
      const slug = entry.insert.name;
      const existing = existingMap.get(slug);
      if (!existing) continue;
      const needsUpdate =
        existing.type !== WorkerType.CONNECTOR ||
        existing.isBuiltIn !== false ||
        existing.isOfficialSupport !== entry.insert.isOfficialSupport ||
        existing.description !== entry.insert.description ||
        !sameCategories(existing.categories, entry.insert.categories) ||
        existing.version !== entry.insert.version ||
        existing.logoUrl !== entry.insert.logoUrl ||
        existing.priority !== entry.insert.priority;
      if (!needsUpdate) {
        // Already up-to-date, just remove from insert list
        const idx = connectorEntries.findIndex((e) => e.insert.name === slug);
        if (idx !== -1) connectorEntries.splice(idx, 1);
        continue;
      }
      existing.type = WorkerType.CONNECTOR;
      existing.isBuiltIn = false;
      existing.isOfficialSupport = entry.insert.isOfficialSupport;
      existing.description = entry.insert.description;
      existing.categories = entry.insert.categories;
      existing.version = entry.insert.version;
      const staleLogoUrl = existing.logoUrl;
      existing.logoUrl = entry.insert.logoUrl;
      existing.priority = entry.insert.priority;
      await this.toolsRepository.save(existing);
      // Logo removed from the manifest: purge the now-orphaned stored object.
      // Best-effort — a storage failure must not abort the sync.
      if (staleLogoUrl && !entry.logoBase64) {
        await this.storageService.deleteFile(`connectors/${slug}.png`, 'system').catch(() => undefined);
      }
      if (entry.logoBase64) {
        try {
          const buffer = this.decodeLogo(entry.logoBase64);
          if (buffer) {
            await this.storageService.uploadFile(`connectors/${slug}.png`, buffer, 'system').catch(() => undefined);
          }
        } catch {
          // ignore malformed logo payload — DB row already saved
        }
      }
      const idx = connectorEntries.findIndex((e) => e.insert.name === slug);
      if (idx !== -1) connectorEntries.splice(idx, 1);
    }
  }

  /**
   * Decodes a manifest `logo` payload, stripping an optional data-URI prefix.
   * Returns null when the payload holds no bytes, so callers can skip the write
   * instead of storing an empty object.
   */
  private decodeLogo(base64: string): Buffer | null {
    const cleanBase64 = base64.includes(',') ? base64.split(',').pop()! : base64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    return buffer.length > 0 ? buffer : null;
  }

  @Lock('connector-tools-sync', { ttl: 10_000 })
  private async removeOrphanConnectorTools(currentNames: string[]): Promise<void> {
    const dbConnectors = await this.toolsRepository.find({
      where: { type: WorkerType.CONNECTOR },
    });
    const orphans = dbConnectors.filter((t) => !currentNames.includes(t.name));
    if (orphans.length === 0) return;
    const orphanIds = orphans.map((t) => t.id!) .filter(Boolean);
    if (orphanIds.length === 0) return;

    await this.workspaceToolRepository
      .createQueryBuilder()
      .delete()
      .where('"toolId" IN (:...orphanIds)', { orphanIds })
      .execute();

    await this.toolsRepository.delete({ id: In(orphanIds) });
  }

  /**
    * Remove legacy PROVIDER tools with isOfficialSupport=true that are no longer
    * present in the connector manifest. These are leftovers from the old
    * official-support-tools era. Deletes workspace_tools first (FK: NO ACTION),
    * then the tool row. Other FKs (jobs, vulnerabilities, etc.) cascade.
    *
    * This is best-effort cleanup — failure should not block startup, so errors
    * are logged as warn (vs connector orphan which propagates to the outer
    * catch). Runs under a distributed lock.
    */
  @Lock('provider-tools-sync', { ttl: 10_000 })
  private async removeOrphanProviderTools(currentConnectorNames: string[]): Promise<void> {
    const legacyProviders = await this.toolsRepository.find({
      where: {
        type: WorkerType.PROVIDER,
        isOfficialSupport: true,
      },
    });
    const orphans = legacyProviders.filter((t) => !currentConnectorNames.includes(t.name));
    if (orphans.length === 0) return;

    const orphanIds = orphans.map((t) => t.id).filter(Boolean) as string[];
    if (orphanIds.length === 0) return;

    try {
      // Delete workspace_tools first (FK: NO ACTION — blocks tool deletion)
      await this.workspaceToolRepository
        .createQueryBuilder()
        .delete()
        .where('"toolId" IN (:...orphanIds)', { orphanIds })
        .execute();

      // Delete orphaned provider tools (jobs/vulnerabilities/asset_tags cascade)
      await this.toolsRepository.delete({ id: In(orphanIds) });
    } catch {
      // Best-effort legacy cleanup — must not block startup.
    }
  }

  /**
   * Remove built-in tools from the database that are no longer declared
   * in built-in-tools.ts. Deletes associated workspace_tools rows first
   * to avoid FK violations.
   */
  @Lock('built-in-tools-sync', { ttl: 10_000 })
  private async removeOrphanBuiltInTools(): Promise<void> {
    const builtInNames = builtInTools.map((tool) => tool.name);
    const dbBuiltInTools = await this.toolsRepository.find({
      where: { type: WorkerType.BUILT_IN },
    });
    const orphanTools = dbBuiltInTools.filter(
      (tool) => !builtInNames.includes(tool.name),
    );

    if (orphanTools.length === 0) return;

    const orphanIds = orphanTools.map((tool) => tool.id);

    // Delete workspace_tools entries referencing orphaned tools first
    await this.workspaceToolRepository
      .createQueryBuilder()
      .delete()
      .where('"toolId" IN (:...orphanIds)', { orphanIds })
      .execute();

    // Then delete the orphaned tools
    await this.toolsRepository.delete({ id: In(orphanIds) });
  }
}
