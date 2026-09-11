import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { In, Repository } from 'typeorm';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { ToolCategory, WorkerType } from '@/common/enums/enum';
import { JobPriority } from '@/common/enums/enum';
import { Tool } from './entities/tools.entity';
import { WorkspaceTool } from './entities/workspace_tools.entity';
import { StorageService } from '../storage/storage.service';
import { DataSource } from 'typeorm';
import { builtInTools } from './tools-provider/built-in-tools';

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

    private readonly redisLockService: RedisLockService,

    private readonly storageService: StorageService,

    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    try {
      await this.syncAll();
    } catch (error) {
      this.logger.error('Error initializing tools:', error);
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
        existing.category !== tool.category;
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
          overwrite: ['description', 'logoUrl', 'version', 'priority', 'category', 'type', 'isBuiltIn', 'isOfficialSupport'],
        })
        .values(builtInToUpsert)
        .execute();
    }

    // Remove built-in tools no longer declared — wrapped in distributed
    // lock so only one replica runs cleanup across a multi-instance cluster.
    await this.redisLockService.withLock(
      'built-in-tools-sync',
      10_000,
      () => this.removeOrphanBuiltInTools(),
    );

    // Sync connector tools from manifest.json (logo stored as path, upload base64 after commit)
    // This also handles legacy PROVIDER → CONNECTOR takeover and orphan cleanup.
    // With unique(name), connector data overrides any existing tool with same slug.
    await this.syncConnectorTools();
  }

  public static mapConnectorCapabilityToCategory(capabilities: string[] | undefined): ToolCategory | undefined {
    if (!capabilities || capabilities.length === 0) return ToolCategory.VULNERABILITIES;
    const cap = capabilities[0]?.toLowerCase();
    switch (cap) {
      case 'subdomains':
        return ToolCategory.SUBDOMAINS;
      case 'http_probe':
        return ToolCategory.HTTP_PROBE;
      case 'ports_scanner':
      case 'port_scanner':
        return ToolCategory.PORTS_SCANNER;
      case 'vulnerabilities':
        return ToolCategory.VULNERABILITIES;
      case 'screenshot':
        return ToolCategory.SCREENSHOT;
      default:
        return ToolCategory.VULNERABILITIES;
    }
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
    // withLock releases the lock as soon as the action completes, so the TTL
    // (120s) only matters if a replica dies mid-sync — generous headroom for
    // manifest fetch, logo uploads and the inner locks.
    const synced = await this.redisLockService.withLock(
      'connector-sync',
      120_000,
      () => this.syncConnectorToolsLocked(),
    );
    if (synced === null) {
      this.logger.warn('Connector tools sync: another instance holds the "connector-sync" lock, skipping');
      return [];
    }
    return synced;
  }

  /**
   * Locked body of syncConnectorTools — must only run under the 'connector-sync'
   * distributed lock acquired by the wrapper above.
   */
  private async syncConnectorToolsLocked(): Promise<Tool[]> {
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
      this.logger.warn(`Connector manifest not found at ${manifestPath} — skipping connector sync`);
      return [];
    }

    let manifest: { connectors?: Array<Record<string, unknown>> };
    try {
      manifest = JSON.parse(raw) as { connectors?: Array<Record<string, unknown>> };
    } catch {
      this.logger.warn(`Connector manifest at ${manifestPath} contains invalid JSON — skipping connector sync`);
      return [];
    }

    const connectors = manifest.connectors;
    if (!Array.isArray(connectors) || connectors.length === 0) {
      this.logger.warn(`Connector manifest at ${manifestPath} has no connectors — skipping`);
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

    for (const rawEntry of connectors) {
      const slug = String((rawEntry['slug'] as string) ?? (rawEntry['name'] as string) ?? '').toLowerCase();
      if (!slug) continue;
      const name = slug;
      const description =
        (rawEntry['description'] as string) ??
        (rawEntry['shortDescription'] as string) ??
        '';
      const version = (rawEntry['version'] as string) ?? '';
      const logoBase64 = rawEntry['logo'] as string | undefined;
      const capabilities = rawEntry['capabilities'] as string[] | undefined;
      const category = ToolSyncService.mapConnectorCapabilityToCategory(capabilities);
      const author = String((rawEntry['author'] as string) ?? '').trim().toLowerCase();
      const isOfficialSupport = author === 'oasm';

      const logoUrl = `/connectors/${name}.png`;

      const insert: ToolInsert = {
        id: randomUUID(),
        name,
        description,
        category,
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
    const existingMap = new Map<string, Tool>();
    await this.redisLockService.withLock('connector-override-dedup', 10_000, async () => {
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
          this.logger.log(`Deduped tool "${name}": kept ${keepId} (${keeper.type}), removed ${dupId} (${dup.type})`);
        }
      }
    });

    // Override existing tools with connector data (priority to manifest)
    await this.redisLockService.withLock('connector-override', 10_000, async () => {
      for (const entry of [...connectorEntries]) {
        const slug = entry.insert.name;
        const existing = existingMap.get(slug);
        if (!existing) continue;
        const needsUpdate =
          existing.type !== WorkerType.CONNECTOR ||
          existing.isBuiltIn !== false ||
          existing.isOfficialSupport !== entry.insert.isOfficialSupport ||
          existing.description !== entry.insert.description ||
          existing.category !== entry.insert.category ||
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
        existing.category = entry.insert.category;
        existing.version = entry.insert.version;
        existing.logoUrl = entry.insert.logoUrl;
        existing.priority = entry.insert.priority;
        await this.toolsRepository.save(existing);
        this.logger.log(`Overrode tool "${slug}" with connector data (id=${existing.id})`);
        if (entry.logoBase64) {
          try {
            const cleanBase64 = entry.logoBase64.includes(',') ? entry.logoBase64.split(',').pop()! : entry.logoBase64;
            const buffer = Buffer.from(cleanBase64, 'base64');
            if (buffer.length > 0) {
              await this.storageService
                .uploadFile(`connectors/${slug}.png`, buffer, 'system')
                .then(() => this.logger.log(`Uploaded connector logo for ${slug} -> connectors/${slug}.png`))
                .catch((err) => this.logger.warn(`Failed to upload connector logo for ${slug}: ${err instanceof Error ? err.message : String(err)}`));
            }
          } catch (err) {
            this.logger.warn(`Failed to decode logo for ${slug}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        const idx = connectorEntries.findIndex((e) => e.insert.name === slug);
        if (idx !== -1) connectorEntries.splice(idx, 1);
      }
    });

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
      this.logger.log('Connector tools sync: no changes detected');
      // Still cleanup orphans (use original manifest names to avoid false orphans after takeover splice)
      await this.redisLockService.withLock('connector-tools-sync', 10_000, () =>
        this.removeOrphanConnectorTools(allConnectorNames),
      );
      await this.redisLockService.withLock('provider-tools-sync', 10_000, () =>
        this.removeOrphanProviderTools(allConnectorNames),
      );
      return [];
    }

    // Commit to DB — unique is now (name) only, connector overrides any existing name
    await this.toolsRepository
      .createQueryBuilder()
      .insert()
      .orUpdate({
        conflict_target: ['name'],
        overwrite: ['description', 'logoUrl', 'version', 'priority', 'category', 'type', 'isBuiltIn', 'isOfficialSupport'],
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
        // Strip data URI prefix if present
        const cleanBase64 = base64.includes(',') ? base64.split(',').pop()! : base64;
        const buffer = Buffer.from(cleanBase64, 'base64');
        if (buffer.length === 0) continue;
        const fileName = `connectors/${tool.name}.png`;
        uploads.push(
          this.storageService
            .uploadFile(fileName, buffer, 'system')
            .then(() => this.logger.log(`Uploaded connector logo for ${tool.name} -> ${fileName}`))
            .catch((err) => this.logger.warn(`Failed to upload connector logo for ${tool.name}: ${err instanceof Error ? err.message : String(err)}`)),
        );
      } catch (err) {
        this.logger.warn(`Failed to decode logo for ${tool.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (uploads.length > 0) {
      await Promise.allSettled(uploads);
    }

    // Cleanup connector orphans after successful sync (use original manifest names)
    await this.redisLockService.withLock('connector-tools-sync', 10_000, () =>
      this.removeOrphanConnectorTools(allConnectorNames),
    );

    // Cleanup legacy PROVIDER official-support tools no longer in manifest
    await this.redisLockService.withLock('provider-tools-sync', 10_000, () =>
      this.removeOrphanProviderTools(allConnectorNames),
    );

    this.logger.log(`Connector tools sync: committed ${committedTools.length} tool(s)`);
    return committedTools;
  }

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

    this.logger.log(
      `Removed ${orphans.length} orphan connector tool(s): ${orphans.map((t) => t.name).join(', ')}`,
    );
  }

  /**
    * Remove legacy PROVIDER tools with isOfficialSupport=true that are no longer
    * present in the connector manifest. These are leftovers from the old
    * official-support-tools era. Deletes workspace_tools first (FK: NO ACTION),
    * then the tool row. Other FKs (jobs, vulnerabilities, etc.) cascade.
    *
    * This is best-effort cleanup — failure should not block startup, so errors
    * are logged as warn (vs connector orphan which propagates to the outer
    * catch). The caller already wraps this in a distributed lock.
    */
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

      this.logger.log(
        `Removed ${orphans.length} orphan provider tool(s): ${orphans.map((t) => t.name).join(', ')}`,
      );
    } catch (err) {
      // Warn, not error — legacy cleanup is non-critical and should not ceil startup
      this.logger.warn(`Failed to remove orphan provider tools: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Remove built-in tools from the database that are no longer declared
   * in built-in-tools.ts. Deletes associated workspace_tools rows first
   * to avoid FK violations.
   */
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

    this.logger.log(
      `Removed ${orphanTools.length} built-in tool(s) no longer declared: ${orphanTools.map((t) => t.name).join(', ')}`,
    );
  }
}
