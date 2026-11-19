import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Asset, type RepositoryAssetMetadata } from './entities/assets.entity';

/** Rows per insert statement. */
const ASSET_WRITE_CHUNK = 200;

/** One repository as an asset of its GIT_ORG target. */
export interface RepositoryAssetRow {
  value: string;
  isEnabled: boolean;
  metadata: RepositoryAssetMetadata;
}

/** The writes a repository sync decided on (`planRepositorySync`). */
export interface RepositoryAssetChanges {
  /** Unmatched rows moved aside so a live repository can take their value. */
  renames: Array<{ id: string; value: string }>;
  updates: Array<RepositoryAssetRow & { id: string }>;
  inserts: RepositoryAssetRow[];
  /** Rows whose repository is gone: disabled, never deleted. */
  disableIds: string[];
}

/**
 * Repository metadata as the jsonb column value. TypeORM's deep-partial
 * typing rejects `null` members of a `Record<string, unknown>` column even
 * though jsonb stores them fine.
 */
const asJson = (
  metadata: RepositoryAssetMetadata,
): QueryDeepPartialEntity<Asset>['metadata'] =>
  ({ ...metadata }) as unknown as QueryDeepPartialEntity<Asset>['metadata'];

/**
 * The repository assets of GIT_ORG targets, read and written for the
 * integrations module's repository sync, so that module does not write the
 * `assets` table itself.
 */
@Injectable()
export class RepositoryAssetsService {
  constructor(
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
  ) {}

  /** The target's assets, with the fields a sync compares. */
  list(targetId: string): Promise<Asset[]> {
    return this.assetRepo.find({
      where: { targetId },
      select: { id: true, value: true, isEnabled: true, metadata: true },
    });
  }

  /**
   * Applies a sync in one transaction. The order is what keeps the
   * `(value, targetId)` unique constraint satisfied: move stale rows aside,
   * then rename/refresh matched rows, then insert new ones, then disable.
   */
  async apply(
    targetId: string,
    workspaceId: string,
    changes: RepositoryAssetChanges,
  ): Promise<void> {
    await this.assetRepo.manager.transaction(async (manager) => {
      const assets = manager.getRepository(Asset);
      for (const { id, value } of changes.renames) {
        await assets.update(id, { value });
      }
      for (const update of changes.updates) {
        await assets.update(update.id, {
          value: update.value,
          isEnabled: update.isEnabled,
          metadata: asJson(update.metadata),
        });
      }
      for (let i = 0; i < changes.inserts.length; i += ASSET_WRITE_CHUNK) {
        await assets.insert(
          changes.inserts.slice(i, i + ASSET_WRITE_CHUNK).map((planned) => ({
            value: planned.value,
            isEnabled: planned.isEnabled,
            isPrimary: false,
            metadata: asJson(planned.metadata),
            targetId,
            workspaceId,
          })),
        );
      }
      if (changes.disableIds.length > 0) {
        await assets.update({ id: In(changes.disableIds) }, { isEnabled: false });
      }
    });
  }
}
