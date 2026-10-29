import {
  ArtifactListScope,
  ArtifactShareType,
  ArtifactSource,
  ArtifactStatus,
  AuditActorType,
  AuditOutcome,
} from '@/common/enums/enum';
import { getManyResponse } from '@/utils/getManyResponse';
import type { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { StorageService } from '@/modules/storage/storage.service';
import { WorkspaceMembers } from '@/modules/workspaces/entities/workspace-members.entity';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import type { EventEnvelopeData } from '../event-bridge/contracts/event-envelope';
import { EventBridgeService } from '../event-bridge/publishing/event-bridge.service';
import { ArtifactQuotaService } from './artifact-quota.service';
import type {
  ArtifactDownloadDto,
  ArtifactDto,
  ArtifactUserDto,
  GetArtifactsQueryDto,
  PresignArtifactDto,
  PresignArtifactResponseDto,
  ShareArtifactResponseDto,
  UpdateArtifactDto,
} from './dto/artifacts.dto';
import { ArtifactFolder } from './entities/artifact-folder.entity';
import { ArtifactShare } from './entities/artifact-share.entity';
import { Artifact } from './entities/artifact.entity';

export const ARTIFACTS_BUCKET = 'artifacts';
export const ARTIFACT_MANAGE_PERMISSION = 'artifact.manage';
export const ARTIFACT_WRITE_PERMISSION = 'artifact.write';
/** Upload window for a presigned POST; the reservation lives as long. */
export const PENDING_UPLOAD_TTL_SECONDS = 15 * 60;
/** Extra time after `expiresAt` before the sweep purges a pending or deleted row. */
export const PENDING_PURGE_GRACE_MS = 15 * 60 * 1000;
const DOWNLOAD_TTL_SECONDS = 5 * 60;
const SWEEP_BATCH_SIZE = 200;
const SORTABLE_COLUMNS = new Set(['createdAt', 'updatedAt', 'name', 'sizeBytes']);

export interface CreateArtifactFromBufferInput {
  workspaceId: string;
  userId: string;
  source: ArtifactSource;
  name: string;
  mimeType: string;
  buffer: Buffer;
  metadata?: Record<string, unknown>;
}

const workspacePrefix = (workspaceId: string) => `workspaces/${workspaceId}/`;

/** Keeps object keys predictable; the display name stays in the DB row. */
export function toObjectKey(workspaceId: string, id: string, name: string) {
  const safe = name
    .replace(/[^A-Za-z0-9._-]/g, '_')
    // Storage rejects any key containing '..'
    .replace(/\.{2,}/g, '.')
    .replace(/^[._]+/, '');
  return `${workspacePrefix(workspaceId)}${id}/${safe.slice(0, 200) || 'file'}`;
}

const hasPermission = (permissions: string[], key: string) =>
  permissions.includes('*') || permissions.includes(key);

const canManage = (permissions: string[]) =>
  hasPermission(permissions, ARTIFACT_MANAGE_PERMISSION);

@Injectable()
export class ArtifactsService {
  private readonly logger = new Logger(ArtifactsService.name);

  constructor(
    @InjectRepository(Artifact)
    private readonly artifactRepo: Repository<Artifact>,
    @InjectRepository(ArtifactShare)
    private readonly shareRepo: Repository<ArtifactShare>,
    @InjectRepository(ArtifactFolder)
    private readonly folderRepo: Repository<ArtifactFolder>,
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly quota: ArtifactQuotaService,
    private readonly eventBridge: EventBridgeService,
  ) {}

  /** Reserves quota, records a pending artifact and returns a size-pinned POST. */
  async presignUpload(
    workspaceId: string,
    userId: string,
    dto: PresignArtifactDto,
  ): Promise<PresignArtifactResponseDto> {
    if (dto.parentFolderId) {
      await this.findOwnedFolder(workspaceId, userId, dto.parentFolderId);
    }
    const artifact = await this.createPending({
      workspaceId,
      userId,
      source: ArtifactSource.UPLOAD,
      name: dto.fileName,
      mimeType: dto.contentType,
      sizeBytes: dto.sizeBytes,
      parentFolderId: dto.parentFolderId ?? null,
    });

    const upload = await this.storageService.getPresignedPost({
      bucket: artifact.bucket,
      key: artifact.objectKey,
      contentType: artifact.mimeType,
      sizeBytes: artifact.sizeBytes,
      expiresIn: PENDING_UPLOAD_TTL_SECONDS,
    });

    return { artifact: this.toDto(artifact, userId), upload };
  }

  /** Verifies the uploaded object and turns the reservation into usage. */
  async completeUpload(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<ArtifactDto> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const artifact = await manager.findOne(Artifact, {
        where: { id, workspaceId, createdByUserId: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!artifact || artifact.status === ArtifactStatus.DELETED) {
        throw new NotFoundException('File not found');
      }
      if (artifact.status === ArtifactStatus.READY) {
        return { artifact };
      }

      let contentLength: number;
      try {
        ({ contentLength } = await this.storageService.headObject(
          artifact.bucket,
          artifact.objectKey,
        ));
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw new BadRequestException('File has not been uploaded yet');
        }
        throw error;
      }

      // The POST policy already pins the size; this guards a store that ignores it.
      if (contentLength !== artifact.sizeBytes) {
        await this.purgeLocked(manager, artifact);
        return { mismatch: true as const };
      }

      await this.markReady(manager, artifact);
      return { artifact };
    });

    if ('mismatch' in outcome) {
      throw new ConflictException('Uploaded size does not match the declared size');
    }
    return this.getById(workspaceId, userId, outcome.artifact.id, []);
  }

  /** Server-side upload (agents): same quota path, no presign round-trip. */
  async createFromBuffer(input: CreateArtifactFromBufferInput): Promise<ArtifactDto> {
    const artifact = await this.createPending({
      ...input,
      sizeBytes: input.buffer.length,
    });

    try {
      await this.storageService.uploadFile(
        artifact.objectKey,
        input.buffer,
        artifact.bucket,
        artifact.mimeType,
      );
      await this.dataSource.transaction((manager) =>
        this.markReady(manager, artifact),
      );
    } catch (error) {
      await this.purge(artifact.id).catch((purgeError: unknown) =>
        this.logger.warn(`Purge after failed upload: ${String(purgeError)}`),
      );
      // The row may already be gone with its workspace, leaving purge
      // nothing to find, so the object is deleted here as well.
      await this.storageService
        .deleteFile(artifact.objectKey, artifact.bucket)
        .catch(() => undefined);
      throw error;
    }

    await this.publishCreated(artifact);
    return this.toDto(artifact, input.userId);
  }

  async getMany(
    workspaceId: string,
    userId: string,
    query: GetArtifactsQueryDto,
    permissions: string[],
  ): Promise<GetManyBaseResponseDto<ArtifactDto>> {
    const { page, limit, search, sortOrder, scope } = query;
    const sortBy = SORTABLE_COLUMNS.has(query.sortBy) ? query.sortBy : 'createdAt';

    const qb = this.artifactRepo
      .createQueryBuilder('artifact')
      .leftJoinAndSelect('artifact.createdBy', 'createdBy')
      .where('artifact.workspaceId = :workspaceId', { workspaceId })
      .andWhere('artifact.status = :status', { status: ArtifactStatus.READY });

    if (scope === ArtifactListScope.ALL) {
      if (!canManage(permissions)) {
        throw new ForbiddenException('Requires artifact.manage');
      }
    } else if (scope === ArtifactListScope.SHARED) {
      qb.andWhere('artifact.shareType IN (:...shareTypes)', {
        shareTypes: [ArtifactShareType.SHARED, ArtifactShareType.PUBLIC],
      }).andWhere(
        'EXISTS (SELECT 1 FROM artifact_shares s WHERE s."artifactId" = artifact.id AND s."userId" = :userId)',
        { userId },
      );
    } else {
      qb.andWhere('artifact.createdByUserId = :userId', { userId });
      // Browsing one folder (root when unset); a search spans all of them.
      if (!search) {
        qb.andWhere(
          query.parentFolderId
            ? 'artifact.parentFolderId = :parentFolderId'
            : 'artifact.parentFolderId IS NULL',
          { parentFolderId: query.parentFolderId },
        );
      }
    }

    if (search) {
      qb.andWhere('artifact.name ILIKE :search', { search: `%${search}%` });
    }

    const [rows, total] = await qb
      .orderBy(`artifact.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return getManyResponse({
      query,
      data: rows.map((row) => this.toDto(row, userId)),
      total,
    });
  }

  async getById(
    workspaceId: string,
    userId: string,
    id: string,
    permissions: string[],
  ): Promise<ArtifactDto> {
    const artifact = await this.findVisible(workspaceId, userId, id, permissions);
    return this.toDto(artifact, userId);
  }

  async getDownloadUrl(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<ArtifactDownloadDto> {
    // Managers see metadata only; content needs real read access.
    const artifact = await this.findVisible(workspaceId, userId, id, []);
    return this.presignDownload(artifact);
  }

  /** Anonymous link: 404 for anything not public so existence never leaks. */
  async getPublicDownloadUrl(id: string): Promise<ArtifactDownloadDto> {
    const artifact = await this.artifactRepo.findOneBy({
      id,
      status: ArtifactStatus.READY,
      shareType: ArtifactShareType.PUBLIC,
    });
    if (!artifact) {
      throw new NotFoundException('File not found');
    }
    return this.presignDownload(artifact);
  }

  async update(
    workspaceId: string,
    userId: string,
    id: string,
    dto: UpdateArtifactDto,
  ): Promise<ArtifactDto> {
    const artifact = await this.findOwned(workspaceId, userId, id);
    if (dto.parentFolderId) {
      await this.findOwnedFolder(workspaceId, userId, dto.parentFolderId);
    }
    await this.artifactRepo.update(artifact.id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.shareType !== undefined ? { shareType: dto.shareType } : {}),
      // null moves the file to the root
      ...(dto.parentFolderId !== undefined
        ? { parentFolderId: dto.parentFolderId }
        : {}),
    });
    return this.getById(workspaceId, userId, id, []);
  }

  /**
   * Soft-deletes, then purges; a purge that fails or must wait for the
   * upload form to expire is done by the sweep. The owner needs
   * artifact.write, anyone else artifact.manage.
   */
  async remove(
    workspaceId: string,
    userId: string,
    id: string,
    permissions: string[],
  ): Promise<{ message: string }> {
    const artifact = await this.findVisible(workspaceId, userId, id, permissions);
    const isOwner = artifact.createdByUserId === userId;
    if (
      !canManage(permissions) &&
      !(isOwner && hasPermission(permissions, ARTIFACT_WRITE_PERMISSION))
    ) {
      throw new ForbiddenException(
        isOwner
          ? 'Requires artifact.write'
          : 'Only the owner can delete this file',
      );
    }

    await this.artifactRepo.update(
      { id: artifact.id, status: ArtifactStatus.READY },
      { status: ArtifactStatus.DELETED },
    );
    try {
      await this.purge(artifact.id);
    } catch (error) {
      this.logger.warn(`Deferred purge of artifact ${artifact.id}: ${String(error)}`);
    }
    return { message: 'File deleted' };
  }

  async getShares(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<ArtifactUserDto[]> {
    const artifact = await this.findOwned(workspaceId, userId, id);
    const shares = await this.shareRepo.find({
      where: { artifactId: artifact.id },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    return shares.map((share) => this.toUserDto(share.user));
  }

  /**
   * Adds members to the share list (idempotent). Emails resolve only to
   * members of the same workspace; anything else (unknown, outsider, the
   * owner) counts as skipped.
   */
  async addShares(
    workspaceId: string,
    userId: string,
    id: string,
    emails: string[],
  ): Promise<ShareArtifactResponseDto> {
    const artifact = await this.findOwned(workspaceId, userId, id);
    const normalized = [...new Set(emails.map((email) => email.trim().toLowerCase()))];

    const members = normalized.length
      ? await this.dataSource.getRepository(WorkspaceMembers).find({
          where: { workspace: { id: workspaceId }, user: { email: In(normalized) } },
          relations: { user: true },
        })
      : [];
    const recipientIds = [
      ...new Set(members.map((member) => member.user.id)),
    ].filter((memberId) => memberId !== userId);

    if (recipientIds.length) {
      await this.shareRepo
        .createQueryBuilder()
        .insert()
        .values(
          recipientIds.map((recipientId) => ({
            artifactId: artifact.id,
            userId: recipientId,
          })),
        )
        .orIgnore()
        .execute();
    }

    return {
      shared: recipientIds.length,
      skipped: normalized.length - recipientIds.length,
    };
  }

  async removeShare(
    workspaceId: string,
    userId: string,
    id: string,
    targetUserId: string,
  ): Promise<{ message: string }> {
    const artifact = await this.findOwned(workspaceId, userId, id);
    await this.shareRepo.delete({ artifactId: artifact.id, userId: targetUserId });
    return { message: 'Share removed' };
  }

  /** Folders are personal: 404 unless the caller created it in this workspace. */
  async findOwnedFolder(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<ArtifactFolder> {
    const folder = await this.folderRepo.findOneBy({
      id,
      workspaceId,
      createdByUserId: userId,
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    return folder;
  }

  /** Purges expired pending uploads and deleted rows whose upload form expired. */
  async purgeStale(): Promise<number> {
    const rows = await this.artifactRepo
      .createQueryBuilder('artifact')
      .select('artifact.id')
      .where('artifact.status IN (:...statuses)', {
        statuses: [ArtifactStatus.PENDING, ArtifactStatus.DELETED],
      })
      .andWhere(
        '(artifact.expiresAt IS NULL OR artifact.expiresAt < :cutoff OR (artifact.status = :deleted AND artifact.source != :upload))',
        {
          cutoff: new Date(Date.now() - PENDING_PURGE_GRACE_MS),
          deleted: ArtifactStatus.DELETED,
          upload: ArtifactSource.UPLOAD,
        },
      )
      .orderBy('artifact.updatedAt', 'ASC')
      .limit(SWEEP_BATCH_SIZE)
      .getMany();

    let purged = 0;
    for (const { id } of rows) {
      try {
        await this.purge(id);
        purged++;
      } catch (error) {
        this.logger.warn(`Purge of artifact ${id} failed: ${String(error)}`);
        // Back of the queue, so rows that keep failing cannot fill every batch.
        await this.artifactRepo.update(id, { updatedAt: () => 'now()' });
      }
    }
    return purged;
  }

  /**
   * Deletes every object under a deleted workspace's prefix. Runs after its
   * rows are gone, so an agent upload that landed meanwhile goes too. Never
   * throws: nothing is left to retry it, so failures are only logged.
   */
  async deleteWorkspaceObjects(workspaceId: string): Promise<void> {
    try {
      const { failed } = await this.storageService.deleteByPrefix(
        ARTIFACTS_BUCKET,
        workspacePrefix(workspaceId),
      );
      if (failed) {
        this.logger.warn(`${failed} object(s) of workspace ${workspaceId} were not deleted`);
      }
    } catch (error) {
      this.logger.warn(`Delete of workspace ${workspaceId} objects failed: ${String(error)}`);
    }
  }

  /**
   * Deletes the object, releases its quota and drops the row, under a row
   * lock so it cannot race `completeUpload`. A READY row is left alone, and
   * so is a DELETED upload whose form is still valid: replaying the form
   * would otherwise recreate the object with no row and no quota charged.
   * Server-side files never had a form, so they free their quota at once.
   */
  async purge(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const artifact = await manager.findOne(Artifact, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!artifact || artifact.status === ArtifactStatus.READY) {
        return;
      }
      if (
        artifact.status === ArtifactStatus.DELETED &&
        artifact.source === ArtifactSource.UPLOAD &&
        artifact.expiresAt &&
        artifact.expiresAt.getTime() + PENDING_PURGE_GRACE_MS > Date.now()
      ) {
        return;
      }
      await this.purgeLocked(manager, artifact);
    });
  }

  private async purgeLocked(manager: EntityManager, artifact: Artifact) {
    try {
      await this.storageService.deleteFile(artifact.objectKey, artifact.bucket);
    } catch (error) {
      // Already gone is fine; anything else keeps the row so the sweep retries.
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
    }
    if (artifact.status === ArtifactStatus.PENDING) {
      await this.quota.releaseReserved(manager, artifact.workspaceId, artifact.sizeBytes);
    } else {
      await this.quota.releaseUsed(manager, artifact.workspaceId, artifact.sizeBytes);
    }
    await manager.delete(Artifact, { id: artifact.id });
  }

  private async createPending(input: {
    workspaceId: string;
    userId: string;
    source: ArtifactSource;
    name: string;
    mimeType: string;
    sizeBytes: number;
    metadata?: Record<string, unknown>;
    parentFolderId?: string | null;
  }): Promise<Artifact> {
    this.quota.assertFileSize(input.sizeBytes);
    const id = randomUUID();

    return this.dataSource.transaction(async (manager) => {
      await this.quota.reserve(manager, input.workspaceId, input.sizeBytes);
      return manager.save(
        manager.create(Artifact, {
          id,
          workspaceId: input.workspaceId,
          createdByUserId: input.userId,
          source: input.source,
          name: input.name,
          bucket: ARTIFACTS_BUCKET,
          objectKey: toObjectKey(input.workspaceId, id, input.name),
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          metadata: input.metadata ?? {},
          parentFolderId: input.parentFolderId ?? null,
          status: ArtifactStatus.PENDING,
          expiresAt: new Date(Date.now() + PENDING_UPLOAD_TTL_SECONDS * 1000),
        }),
      );
    });
  }

  /** Turns the reservation into usage; fails if the row went away meanwhile. */
  private async markReady(manager: EntityManager, artifact: Artifact) {
    // `expiresAt` stays: `purge` keeps a deleted row until the form expires.
    const { affected } = await manager.update(
      Artifact,
      { id: artifact.id, status: ArtifactStatus.PENDING },
      { status: ArtifactStatus.READY },
    );
    if (!affected) {
      throw new NotFoundException('File was removed during upload');
    }
    await this.quota.commit(manager, artifact.workspaceId, artifact.sizeBytes);
    artifact.status = ArtifactStatus.READY;
  }

  private async publishCreated(artifact: Artifact): Promise<void> {
    await this.eventBridge.publishSafely(
      EVENT_CATALOG.artifact.created,
      {
        workspaceId: artifact.workspaceId,
        actor: {
          type: AuditActorType.Agent,
          ...(artifact.createdByUserId ? { id: artifact.createdByUserId } : {}),
        },
        outcome: AuditOutcome.Success,
        resourceType: 'artifact',
        resourceId: artifact.id,
        metadata: {
          source: artifact.source,
          sizeBytes: artifact.sizeBytes,
          mimeType: artifact.mimeType,
        },
      } satisfies EventEnvelopeData,
      { subject: `workspace:${artifact.workspaceId}/artifact:${artifact.id}` },
    );
  }

  private presignDownload(artifact: Artifact): Promise<ArtifactDownloadDto> {
    return this.storageService.getPresignedDownloadUrl({
      bucket: artifact.bucket,
      key: artifact.objectKey,
      fileName: artifact.name,
      // Never the stored type: storage is proxied on the app origin, so a
      // file served as a script or stylesheet could be loaded by a page.
      contentType: 'application/octet-stream',
      expiresIn: DOWNLOAD_TTL_SECONDS,
    });
  }

  /** 404 unless the user may read it (or, with `artifact.manage`, see it). */
  private async findVisible(
    workspaceId: string,
    userId: string,
    id: string,
    permissions: string[],
  ): Promise<Artifact> {
    const artifact = await this.artifactRepo.findOne({
      where: { id, workspaceId, status: ArtifactStatus.READY },
      relations: { createdBy: true },
    });
    if (
      !artifact ||
      !((await this.canRead(artifact, userId)) || canManage(permissions))
    ) {
      throw new NotFoundException('File not found');
    }
    return artifact;
  }

  private async findOwned(workspaceId: string, userId: string, id: string) {
    const artifact = await this.findVisible(workspaceId, userId, id, []);
    if (artifact.createdByUserId !== userId) {
      throw new ForbiddenException('Only the owner can change this file');
    }
    return artifact;
  }

  private async canRead(artifact: Artifact, userId: string): Promise<boolean> {
    switch (artifact.shareType) {
      case ArtifactShareType.PUBLIC:
        return true;
      case ArtifactShareType.SHARED:
        return (
          artifact.createdByUserId === userId ||
          this.shareRepo.existsBy({ artifactId: artifact.id, userId })
        );
      default:
        return artifact.createdByUserId === userId;
    }
  }

  private toUserDto(user: { id: string; name: string; image?: string | null }) {
    return { id: user.id, name: user.name, image: user.image ?? null };
  }

  private toDto(artifact: Artifact, userId: string): ArtifactDto {
    return {
      id: artifact.id,
      name: artifact.name,
      mimeType: artifact.mimeType,
      sizeBytes: artifact.sizeBytes,
      source: artifact.source,
      shareType: artifact.shareType,
      status: artifact.status,
      createdBy: artifact.createdBy ? this.toUserDto(artifact.createdBy) : null,
      parentFolderId: artifact.parentFolderId ?? null,
      isOwner: artifact.createdByUserId === userId,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    };
  }
}
