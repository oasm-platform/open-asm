import { ArtifactStatus } from '@/common/enums/enum';
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { ArtifactsService } from './artifacts.service';
import type {
  ArtifactFolderDetailDto,
  ArtifactFolderDto,
  CreateArtifactFolderDto,
  UpdateArtifactFolderDto,
} from './dto/artifacts.dto';
import { ArtifactFolder } from './entities/artifact-folder.entity';
import { Artifact } from './entities/artifact.entity';

/** Guards the recursive walks against a corrupted (cyclic) tree. */
const MAX_FOLDER_DEPTH = 100;

/**
 * Personal folders in a workspace's Files tree. Only the creator sees or
 * changes a folder, and only their own files can be placed in it.
 */
@Injectable()
export class ArtifactFoldersService {
  private readonly logger = new Logger(ArtifactFoldersService.name);

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
      await this.artifactsService.findOwnedFolder(workspaceId, userId, parentFolderId);
    }
    const folders = await this.folderRepo.find({
      where: {
        workspaceId,
        createdByUserId: userId,
        parentFolderId: parentFolderId ?? IsNull(),
      },
      order: { name: 'ASC' },
    });
    return folders.map((folder) => this.toDto(folder));
  }

  async getById(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<ArtifactFolderDetailDto> {
    const folder = await this.artifactsService.findOwnedFolder(workspaceId, userId, id);
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

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateArtifactFolderDto,
  ): Promise<ArtifactFolderDto> {
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

    if (dto.parentFolderId) {
      await this.artifactsService.findOwnedFolder(workspaceId, userId, dto.parentFolderId);
      if ((await this.subtreeIds(id)).includes(dto.parentFolderId)) {
        throw new BadRequestException('Cannot move a folder into itself');
      }
    }

    if (dto.name !== undefined) folder.name = dto.name;
    if (dto.parentFolderId !== undefined) folder.parentFolderId = dto.parentFolderId;
    return this.toDto(await this.folderRepo.save(folder));
  }

  /**
   * Deletes the folder, its subfolders and every file in them. Files are
   * marked deleted and detached in one transaction, then purged so their
   * quota is released; a failed purge is retried by the sweep.
   */
  async remove(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<{ message: string }> {
    await this.artifactsService.findOwnedFolder(workspaceId, userId, id);
    const folderIds = await this.subtreeIds(id);

    const fileIds = await this.dataSource.transaction(async (manager) => {
      const files = await manager.find(Artifact, {
        select: { id: true },
        where: { parentFolderId: In(folderIds), status: ArtifactStatus.READY },
      });
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
      return files.map((file) => file.id);
    });

    for (const fileId of fileIds) {
      await this.artifactsService.purge(fileId).catch((error: unknown) =>
        this.logger.warn(`Deferred purge of artifact ${fileId}: ${String(error)}`),
      );
    }
    return { message: 'Folder deleted' };
  }

  /** The folder and all of its descendants. */
  private async subtreeIds(id: string): Promise<string[]> {
    const rows = await this.dataSource.query<{ id: string }[]>(
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
