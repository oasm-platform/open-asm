import { ArtifactStatus } from '@/common/enums/enum';
import { ArtifactsService } from '@/modules/artifacts/artifacts.service';
import { Artifact } from '@/modules/artifacts/entities/artifact.entity';
import { StorageService } from '@/modules/storage/storage.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  PresignProjectFileDto,
  PresignProjectFileResponseDto,
  ProjectFileDto,
} from './dto/project-files.dto';
import { ProjectArtifact } from './entities/project-artifact.entity';
import { Project } from './entities/project.entity';
import { findProjectOrFail } from './project-access';

export const PROJECT_FILE_LIMIT = 5;
export const PROJECT_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** Text formats an agent reads as they are; the type is set from the extension. */
const PROJECT_FILE_TYPES: Readonly<Record<string, string>> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
};

/** What a chat about the project reads up front; the rest is paged by a tool. */
export interface ProjectFileText {
  id: string;
  name: string;
  content: string;
  totalChars: number;
}

const extensionOf = (fileName: string) =>
  fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';

/**
 * Files attached to a project as chat context. They are workspace artifacts:
 * uploaded through the artifact presign flow, counted in the workspace quota
 * and listed on the Files page; a project holds at most PROJECT_FILE_LIMIT.
 */
@Injectable()
export class ProjectFilesService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectArtifact)
    private readonly linkRepo: Repository<ProjectArtifact>,
    private readonly dataSource: DataSource,
    private readonly artifacts: ArtifactsService,
    private readonly storage: StorageService,
  ) {}

  async list(projectId: string, workspaceId: string): Promise<ProjectFileDto[]> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId);
    return this.listLinked(projectId);
  }

  /** Reserves the upload (quota, pending artifact) once the type, size and count fit. */
  async presign(
    projectId: string,
    workspaceId: string,
    userId: string,
    dto: PresignProjectFileDto,
  ): Promise<PresignProjectFileResponseDto> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId, {
      writable: true,
    });
    const contentType = PROJECT_FILE_TYPES[extensionOf(dto.fileName)];
    if (!contentType) {
      throw new BadRequestException('Only .md, .txt and .csv files can be attached');
    }
    if (dto.sizeBytes > PROJECT_FILE_MAX_BYTES) {
      throw new PayloadTooLargeException('A project file can be at most 10 MB');
    }
    await this.assertRoom(projectId);
    return this.artifacts.presignUpload(workspaceId, userId, {
      fileName: dto.fileName,
      sizeBytes: dto.sizeBytes,
      contentType,
    });
  }

  /** Finishes the upload and attaches the file, unless the project filled up meanwhile. */
  async complete(
    projectId: string,
    workspaceId: string,
    userId: string,
    artifactId: string,
  ): Promise<ProjectFileDto[]> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId, {
      writable: true,
    });
    await this.artifacts.completeUpload(workspaceId, userId, artifactId);
    await this.dataSource.transaction(async (manager) => {
      // One attach at a time per project, so two uploads cannot both take the last slot
      await manager.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [
        projectId,
      ]);
      const count = await manager.count(ProjectArtifact, {
        where: { projectId, artifact: { status: ArtifactStatus.READY } },
      });
      if (count >= PROJECT_FILE_LIMIT) {
        throw new BadRequestException(
          `A project can have at most ${PROJECT_FILE_LIMIT} files; the upload stays in Files`,
        );
      }
      await manager
        .createQueryBuilder()
        .insert()
        .into(ProjectArtifact)
        .values({ projectId, artifactId })
        .orIgnore()
        .execute();
    });
    return this.listLinked(projectId);
  }

  /** Detaches the file; it stays in the workspace Files. */
  async remove(
    projectId: string,
    workspaceId: string,
    artifactId: string,
  ): Promise<ProjectFileDto[]> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId, {
      writable: true,
    });
    await this.linkRepo.delete({ projectId, artifactId });
    return this.listLinked(projectId);
  }

  /** Full text of one attached file. */
  async readText(
    projectId: string,
    workspaceId: string,
    artifactId: string,
  ): Promise<ProjectFileText> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId);
    const link = await this.linkRepo.findOne({
      where: { projectId, artifactId, artifact: { status: ArtifactStatus.READY } },
      relations: { artifact: true },
    });
    if (!link) throw new NotFoundException('File not found in this project');
    return this.textOf(link.artifact);
  }

  /**
   * Every attached file for a chat prompt: each cut to `perFile` characters
   * and all of them to `total`. A file that does not fit is listed empty, so
   * the agent still knows to page it in.
   */
  async contextFiles(
    projectId: string,
    opts: { perFile: number; total: number },
  ): Promise<ProjectFileText[]> {
    const links = await this.linkRepo.find({
      where: { projectId, artifact: { status: ArtifactStatus.READY } },
      relations: { artifact: true },
      order: { createdAt: 'ASC' },
    });
    let budget = opts.total;
    const files: ProjectFileText[] = [];
    for (const link of links) {
      const file = await this.textOf(link.artifact).catch(() => null);
      if (!file) continue;
      const content = file.content.slice(0, Math.min(opts.perFile, budget));
      budget -= content.length;
      files.push({ ...file, content });
    }
    return files;
  }

  private async assertRoom(projectId: string) {
    const count = await this.linkRepo.count({
      where: { projectId, artifact: { status: ArtifactStatus.READY } },
    });
    if (count >= PROJECT_FILE_LIMIT) {
      throw new BadRequestException(
        `A project can have at most ${PROJECT_FILE_LIMIT} files`,
      );
    }
  }

  private async textOf(artifact: Artifact): Promise<ProjectFileText> {
    const { file } = await this.storage.getFile(artifact.objectKey, artifact.bucket);
    const chunks: Buffer[] = [];
    for await (const chunk of file.getStream()) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    const content = Buffer.concat(chunks).toString('utf8');
    return {
      id: artifact.id,
      name: artifact.name,
      content,
      totalChars: content.length,
    };
  }

  private async listLinked(projectId: string): Promise<ProjectFileDto[]> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT a.id, a.name, a."mimeType", a."sizeBytes", u.name AS "createdByName",
              pa."createdAt" AS "attachedAt"
         FROM project_artifacts pa
         JOIN artifacts a ON a.id = pa."artifactId"
         LEFT JOIN users u ON u.id = a."createdByUserId"
        WHERE pa."projectId" = $1 AND a.status = $2
        ORDER BY pa."createdAt" ASC`,
      [projectId, ArtifactStatus.READY],
    );
    return rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      mimeType: row.mimeType as string,
      sizeBytes: Number(row.sizeBytes),
      createdByName: (row.createdByName as string | null) ?? null,
      attachedAt: row.attachedAt as Date,
    }));
  }
}
