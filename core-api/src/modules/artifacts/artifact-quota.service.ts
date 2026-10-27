import { ArtifactStatus } from '@/common/enums/enum';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import type { ArtifactsConfig } from './artifacts.config';
import { parseArtifactsConfig } from './artifacts.config';
import type { ArtifactUsageDto, WorkspaceStorageQuotaDto } from './dto/artifacts.dto';
import { Artifact } from './entities/artifact.entity';
import { WorkspaceStorageUsage } from './entities/workspace-storage-usage.entity';

export const STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED';

/**
 * Owns `workspace_storage_usage`. Every write is a single conditional UPDATE,
 * so concurrent uploads can never push a workspace past its quota.
 */
@Injectable()
export class ArtifactQuotaService {
  private readonly config: ArtifactsConfig;

  constructor(
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.config = parseArtifactsConfig(configService);
  }

  get maxFileBytes(): number {
    return this.config.maxFileBytes;
  }

  assertFileSize(sizeBytes: number): void {
    if (sizeBytes > this.config.maxFileBytes) {
      throw new PayloadTooLargeException(
        `File exceeds the ${this.config.maxFileBytes} byte limit`,
      );
    }
  }

  /** Holds `bytes` for an in-flight upload; 409 when the quota would overflow. */
  async reserve(
    manager: EntityManager,
    workspaceId: string,
    bytes: number,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(WorkspaceStorageUsage)
      .values({ workspaceId })
      .orIgnore()
      .execute();

    const result = await manager
      .createQueryBuilder()
      .update(WorkspaceStorageUsage)
      .set({ reservedBytes: () => '"reservedBytes" + :bytes' })
      .where('"workspaceId" = :workspaceId')
      .andWhere(
        '"usedBytes" + "reservedBytes" + :bytes <= COALESCE("quotaBytes", :defaultQuota)',
      )
      .setParameters({
        workspaceId,
        bytes,
        defaultQuota: this.config.workspaceQuotaBytes,
      })
      .execute();

    if (!result.affected) {
      throw new ConflictException({
        code: STORAGE_QUOTA_EXCEEDED,
        message: 'Workspace storage quota exceeded',
      });
    }
  }

  /** Moves a finished upload from reserved to used. */
  commit(manager: EntityManager, workspaceId: string, bytes: number) {
    return this.adjust(manager, workspaceId, { reserved: -bytes, used: bytes });
  }

  releaseReserved(manager: EntityManager, workspaceId: string, bytes: number) {
    return this.adjust(manager, workspaceId, { reserved: -bytes, used: 0 });
  }

  releaseUsed(manager: EntityManager, workspaceId: string, bytes: number) {
    return this.adjust(manager, workspaceId, { reserved: 0, used: -bytes });
  }

  private async adjust(
    manager: EntityManager,
    workspaceId: string,
    delta: { reserved: number; used: number },
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(WorkspaceStorageUsage)
      .set({
        reservedBytes: () => 'GREATEST("reservedBytes" + :reserved, 0)',
        usedBytes: () => 'GREATEST("usedBytes" + :used, 0)',
      })
      .where('"workspaceId" = :workspaceId')
      .setParameters({ workspaceId, ...delta })
      .execute();
  }

  async getUsage(workspaceId: string): Promise<ArtifactUsageDto> {
    const usage = await this.dataSource
      .getRepository(WorkspaceStorageUsage)
      .findOneBy({ workspaceId });

    const ready = () =>
      this.dataSource
        .getRepository(Artifact)
        .createQueryBuilder('artifact')
        .select('SUM(artifact.sizeBytes)', 'bytes')
        .where('artifact.workspaceId = :workspaceId', { workspaceId })
        .andWhere('artifact.status = :status', { status: ArtifactStatus.READY });

    const [bySource, byUser] = await Promise.all([
      ready()
        .addSelect('artifact.source', 'source')
        .groupBy('artifact.source')
        .getRawMany<{ source: ArtifactUsageDto['bySource'][number]['source']; bytes: string }>(),
      ready()
        .leftJoin('artifact.createdBy', 'user')
        .addSelect(['user.id AS "userId"', 'user.name AS "userName"', 'user.image AS "userImage"'])
        .groupBy('user.id')
        .orderBy('bytes', 'DESC')
        .getRawMany<{
          userId: string | null;
          userName: string | null;
          userImage: string | null;
          bytes: string;
        }>(),
    ]);

    return {
      quotaBytes: usage?.quotaBytes ?? this.config.workspaceQuotaBytes,
      usedBytes: usage?.usedBytes ?? 0,
      reservedBytes: usage?.reservedBytes ?? 0,
      maxFileBytes: this.config.maxFileBytes,
      bySource: bySource.map((row) => ({
        source: row.source,
        bytes: Number(row.bytes),
      })),
      byUser: byUser.map((row) => ({
        user: row.userId
          ? { id: row.userId, name: row.userName ?? '', image: row.userImage }
          : null,
        bytes: Number(row.bytes),
      })),
    };
  }

  /** Platform-admin override; `null` falls back to the configured default. */
  async setQuota(
    workspaceId: string,
    quotaBytes: number | null,
  ): Promise<WorkspaceStorageQuotaDto> {
    const exists = await this.dataSource
      .getRepository(Workspace)
      .existsBy({ id: workspaceId });
    if (!exists) {
      throw new NotFoundException('Workspace not found');
    }

    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(WorkspaceStorageUsage)
      .values({ workspaceId, quotaBytes })
      .orUpdate(['quotaBytes', 'updatedAt'], ['workspaceId'])
      .execute();

    return { workspaceId, quotaBytes };
  }
}
