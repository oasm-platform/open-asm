import { ArtifactStatus } from '@/common/enums/enum';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { ArtifactsService, TEMPLATES_FOLDER_NAME } from './artifacts.service';
import type {
  ArtifactFolderDetailDto,
  ArtifactFolderDto,
  CreateArtifactFolderDto,
  UpdateArtifactFolderDto,
} from './dto/artifacts.dto';
import { ArtifactFolder } from './entities/artifact-folder.entity';
import { Artifact } from './entities/artifact.entity';

/** A user root folder with this name would be mistaken for the templates folder once its owner is deleted. */
function assertNotReservedRoot(name: string, parentFolderId: string | null | undefined): void {
  if (!parentFolderId && name === TEMPLATES_FOLDER_NAME) {
    throw new BadRequestException(`"${TEMPLATES_FOLDER_NAME}" is reserved at the root`);
  }
}

/** Guards the recursive walks against a corrupted (cyclic) tree. */
const MAX_FOLDER_DEPTH = 100;

/**
 * Personal folders in a workspace's Files tree. Only the creator sees or
 * changes a folder, and only their own files can be placed in it.
 */
@Injectable()
export class ArtifactFoldersService {
  constructor(
    @InjectRepository(ArtifactFolder)
    private readonly folderRepo: Repository<ArtifactFolder>,
    private readonly dataSource: DataSource,
    private readonly artifactsService: ArtifactsService,
  ) {}

  async getMany(
    workspaceId: string,
    userId: string,
    parentFolderId?: string,
  ): Promise<ArtifactFolderDto[]> {
    if (parentFolderId) {
      await this.artifactsService.findReadableFolder(workspaceId, userId, parentFolderId);
    }
    const own = {
      workspaceId,
      createdByUserId: userId,
      parentFolderId: parentFolderId ?? IsNull(),
    };
    if (!parentFolderId) await this.ensureTemplatesFolder(workspaceId);
    const folders = await this.folderRepo.find({
      where: parentFolderId
        ? own
        : [own, { workspaceId, parentFolderId: IsNull(), createdByUserId: IsNull(), name: TEMPLATES_FOLDER_NAME }],
      order: { name: 'ASC' },
    });
    return folders.map((folder) => this.toDto(folder));
  }

  async getById(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<ArtifactFolderDetailDto> {
    const folder = await this.artifactsService.findReadableFolder(workspaceId, userId, id);
    const path = await this.dataSource.query<{ id: string; name: string }[]>(
      `WITH RECURSIVE path AS (
         SELECT id, name, "parentFolderId", 0 AS depth FROM artifact_folders WHERE id = $1
         UNION ALL
         SELECT f.id, f.name, f."parentFolderId", p.depth + 1
         FROM artifact_folders f JOIN path p ON f.id = p."parentFolderId"
         WHERE p.depth < $2
       )
       SELECT id, name FROM path ORDER BY depth DESC`,
      [id, MAX_FOLDER_DEPTH],
    );
    return { ...this.toDto(folder), path };
  }

  /** The workspace-owned root folder for custom templates; created on first use. */
  async ensureTemplatesFolder(workspaceId: string): Promise<ArtifactFolder> {
    const where = {
      workspaceId,
      parentFolderId: IsNull(),
      createdByUserId: IsNull(),
      name: TEMPLATES_FOLDER_NAME,
    };
    const order = { createdAt: 'ASC' } as const;
    // Lock-free fast path; only a miss pays for the transaction + advisory lock.
    const found = await this.folderRepo.findOne({ where, order });
    if (found) return found;
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `artifact-folders:templates:${workspaceId}`,
      ]);
      const existing = await manager.findOne(ArtifactFolder, { where, order });
      if (existing) return existing;
      return manager.save(
        this.folderRepo.create({
          workspaceId,
          createdByUserId: null,
          parentFolderId: null,
          name: TEMPLATES_FOLDER_NAME,
        }),
      );
    });
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateArtifactFolderDto,
  ): Promise<ArtifactFolderDto> {
    assertNotReservedRoot(dto.name, dto.parentFolderId);
    if (dto.parentFolderId) {
      await this.artifactsService.findOwnedFolder(workspaceId, userId, dto.parentFolderId);
    }
    const folder = await this.folderRepo.save(
      this.folderRepo.create({
        workspaceId,
        createdByUserId: userId,
        name: dto.name,
        parentFolderId: dto.parentFolderId ?? null,
      }),
    );
    return this.toDto(folder);
  }

  /** Renames and/or moves a folder; refuses moving it into its own subtree. */
  async update(
    workspaceId: string,
    userId: string,
    id: string,
    dto: UpdateArtifactFolderDto,
  ): Promise<ArtifactFolderDto> {
    const folder = await this.artifactsService.findOwnedFolder(workspaceId, userId, id);
    const target = dto.parentFolderId;
    if (dto.name !== undefined) folder.name = dto.name;
    if (target !== undefined) folder.parentFolderId = target;
    assertNotReservedRoot(folder.name, folder.parentFolderId);

    if (!target) {
      return this.toDto(await this.folderRepo.save(folder));
    }

    await this.artifactsService.findOwnedFolder(workspaceId, userId, target);
    const saved = await this.dataSource.transaction(async (manager) => {
      // One move per user at a time: concurrent moves (A into B, B into A)
      // would each pass the subtree check and together form a cycle.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `artifact-folders:${workspaceId}:${userId}`,
      ]);
      if ((await this.subtreeIds(id, manager)).includes(target)) {
        throw new BadRequestException('Cannot move a folder into itself');
      }
      return manager.save(folder);
    });
    return this.toDto(saved);
  }

  /**
   * Deletes the folder, its subfolders and every file in them. Files are
   * marked deleted and detached in one transaction; the sweep then purges
   * them and releases their quota.
   */
  async remove(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<{ message: string }> {
    await this.artifactsService.findOwnedFolder(workspaceId, userId, id);
    const folderIds = await this.subtreeIds(id);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Artifact,
        { parentFolderId: In(folderIds), status: ArtifactStatus.READY },
        { status: ArtifactStatus.DELETED, parentFolderId: null },
      );
      // In-flight uploads land in the root instead of blocking the delete.
      await manager.update(
        Artifact,
        { parentFolderId: In(folderIds) },
        { parentFolderId: null },
      );
      await manager.delete(ArtifactFolder, { id: In(folderIds) });
    });
    return { message: 'Folder deleted' };
  }

  /** The folder and all of its descendants. */
  private async subtreeIds(
    id: string,
    runner: Pick<EntityManager, 'query'> = this.dataSource,
  ): Promise<string[]> {
    const rows = await runner.query<{ id: string }[]>(
      `WITH RECURSIVE tree AS (
         SELECT id, 0 AS depth FROM artifact_folders WHERE id = $1
         UNION ALL
         SELECT f.id, t.depth + 1
         FROM artifact_folders f JOIN tree t ON f."parentFolderId" = t.id
         WHERE t.depth < $2
       )
       SELECT id FROM tree`,
      [id, MAX_FOLDER_DEPTH],
    );
    return rows.map((row) => row.id);
  }

  private toDto(folder: ArtifactFolder): ArtifactFolderDto {
    return {
      id: folder.id,
      name: folder.name,
      parentFolderId: folder.parentFolderId ?? null,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  }
}
