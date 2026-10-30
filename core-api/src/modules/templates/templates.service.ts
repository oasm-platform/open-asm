import {
  ArtifactSource,
  ArtifactStatus,
  AuditActorType,
  JobRunType,
} from '@/common/enums/enum';
import type { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import type { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as yaml from 'js-yaml';
import { In, Repository } from 'typeorm';
import { ArtifactFoldersService } from '../artifacts/artifact-folders.service';
import { ArtifactsService } from '../artifacts/artifacts.service';
import type { ArtifactDto } from '../artifacts/dto/artifacts.dto';
import { Artifact } from '../artifacts/entities/artifact.entity';
import { AssetGroupAsset } from '../asset-group/entities/asset-groups-assets.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { StorageService } from '../storage/storage.service';
import { ToolsService } from '../tools/tools.service';
import type {
  CreateTemplateDto,
  GetTemplatesQueryDto,
  RenameTemplateDto,
  RunTemplatesDto,
  SaveTemplateContentDto,
  TemplateContentDto,
} from './dto/templates.dto';

export const MAX_TEMPLATE_BYTES = 256 * 1024;
const SORTABLE = new Set(['createdAt', 'updatedAt', 'name']);

/** Trust boundary for template names and content; throws 400/413. */
export function validateTemplate(name?: string, content?: string): void {
  if (name !== undefined) {
    if (!name || name.length > 200 || !/\.ya?ml$/i.test(name)) {
      throw new BadRequestException(
        'Template name must be 1-200 characters and end in .yaml or .yml',
      );
    }
  }
  if (content === undefined) return;
  if (Buffer.byteLength(content, 'utf8') > MAX_TEMPLATE_BYTES) {
    throw new PayloadTooLargeException('Template exceeds 256 KB');
  }
  // js-yaml ships no types here (same pattern as workflow-template.service).
  /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  let doc: unknown;
  try {
    doc = yaml.load(content);
  } catch (error) {
    const e = error as { mark?: { line?: number }; reason?: string };
    const line = e.mark?.line;
    throw new BadRequestException(
      `Invalid YAML${line !== undefined ? ` at line ${line + 1}` : ''}: ${e.reason ?? 'parse error'}`,
    );
  }
  /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  const id = (doc as { id?: unknown } | null)?.id;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || typeof id !== 'string' || !id) {
    throw new BadRequestException(
      'Template must be a YAML mapping with a string "id"',
    );
  }
}

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(Artifact)
    private readonly artifactRepo: Repository<Artifact>,
    private readonly artifacts: ArtifactsService,
    private readonly folders: ArtifactFoldersService,
    private readonly storage: StorageService,
    @InjectRepository(AssetGroupAsset)
    private readonly groupAssetRepo: Repository<AssetGroupAsset>,
    private readonly tools: ToolsService,
    private readonly jobs: JobsRegistryService,
  ) {}

  async getMany(
    workspaceId: string,
    userId: string,
    query: GetTemplatesQueryDto,
  ): Promise<GetManyBaseResponseDto<ArtifactDto>> {
    const { page, limit, search, sortOrder, scope } = query;
    const sortBy = SORTABLE.has(query.sortBy) ? query.sortBy : 'createdAt';
    const folder = await this.folders.ensureTemplatesFolder(workspaceId);

    const qb = this.artifactRepo
      .createQueryBuilder('artifact')
      .leftJoinAndSelect('artifact.createdBy', 'createdBy')
      .where('artifact.workspaceId = :workspaceId', { workspaceId })
      .andWhere('artifact.parentFolderId = :folderId', { folderId: folder.id })
      .andWhere('artifact.status = :status', { status: ArtifactStatus.READY });

    if (scope === 'shared') {
      qb.andWhere(
        '(artifact.createdByUserId IS NULL OR artifact.createdByUserId != :userId)',
        { userId },
      ).andWhere(
        `(artifact.shareType = 'public' OR (artifact.shareType = 'shared' AND EXISTS (SELECT 1 FROM artifact_shares s WHERE s."artifactId" = artifact.id AND s."userId" = :userId)))`,
      );
    } else {
      qb.andWhere('artifact.createdByUserId = :userId', { userId });
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
      data: rows.map((row) => this.artifacts.toDto(row, userId)),
      total,
    });
  }

  async getContent(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<TemplateContentDto> {
    const artifact = await this.findTemplate(workspaceId, userId, id);
    const { file } = await this.storage.getFile(artifact.objectKey, artifact.bucket);
    const chunks: Buffer[] = [];
    for await (const chunk of file.getStream()) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    return {
      artifact: this.artifacts.toDto(artifact, userId),
      content: Buffer.concat(chunks).toString('utf8'),
    };
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateTemplateDto,
  ): Promise<ArtifactDto> {
    const name = dto.name.trim();
    validateTemplate(name, dto.content);
    const folder = await this.folders.ensureTemplatesFolder(workspaceId);
    return this.artifacts.createFromBuffer({
      workspaceId,
      userId,
      source: ArtifactSource.TEMPLATE,
      name,
      mimeType: 'application/yaml',
      buffer: Buffer.from(dto.content, 'utf8'),
      parentFolderId: folder.id,
      actorType: AuditActorType.User,
    });
  }

  async saveContent(
    workspaceId: string,
    userId: string,
    id: string,
    dto: SaveTemplateContentDto,
  ): Promise<ArtifactDto> {
    validateTemplate(undefined, dto.content);
    await this.findTemplate(workspaceId, userId, id);
    return this.artifacts.replaceContent(
      workspaceId,
      userId,
      id,
      Buffer.from(dto.content, 'utf8'),
    );
  }

  async rename(
    workspaceId: string,
    userId: string,
    id: string,
    dto: RenameTemplateDto,
  ): Promise<ArtifactDto> {
    const name = dto.name.trim();
    validateTemplate(name);
    await this.findTemplate(workspaceId, userId, id);
    return this.artifacts.update(workspaceId, userId, id, { name });
  }

  /**
   * Scans the chosen targets, assets or asset groups with nuclei running only
   * these templates. Jobs carry template ids; the registry presigns them when a
   * worker claims the job, so edits saved before then are what runs.
   */
  async run(
    workspaceId: string,
    userId: string,
    dto: RunTemplatesDto,
  ): Promise<DefaultMessageResponseDto> {
    const { targetIds, assetIds, assetGroupIds } = dto;
    // findAssetsForJob ANDs targetIds with assetIds, and treats an empty list
    // as "no filter" — so exactly one non-empty scope, never zero.
    const scopes = [targetIds, assetIds, assetGroupIds].filter((ids) => ids?.length);
    if (scopes.length !== 1) {
      throw new BadRequestException(
        'Choose exactly one of targetIds, assetIds or assetGroupIds',
      );
    }
    const templateIds = [...new Set(dto.templateIds)];
    const templates = await this.findTemplates(workspaceId, userId, templateIds);

    const scopedAssetIds = assetGroupIds?.length
      ? await this.groupAssetIds(workspaceId, assetGroupIds)
      : assetIds;
    if (assetGroupIds?.length && !scopedAssetIds?.length) {
      throw new BadRequestException('The selected asset groups have no assets');
    }

    const [nuclei] = await this.tools.getToolByNames({ names: ['nuclei'] });
    if (!nuclei) {
      throw new NotFoundException('Nuclei is not available');
    }
    const jobs = await this.jobs.createNewJob({
      tool: nuclei,
      workspaceId,
      targetIds: targetIds?.length ? targetIds : undefined,
      assetIds: scopedAssetIds?.length ? scopedAssetIds : undefined,
      priority: nuclei.priority,
      jobName:
        templates.length === 1
          ? templates[0].name
          : `${templates.length} custom templates`,
      jobRunType: JobRunType.MANUAL,
      customTemplateIds: templateIds,
    });
    if (jobs.length === 0) {
      throw new BadRequestException(
        'Nothing to scan: custom templates run on enabled domain, IP and CIDR assets',
      );
    }
    return {
      message: `Running ${templates.length} template(s) on ${jobs.length} asset(s)`,
    };
  }

  private async groupAssetIds(workspaceId: string, groupIds: string[]): Promise<string[]> {
    const rows = await this.groupAssetRepo.find({
      where: { assetGroup: { id: In(groupIds), workspace: { id: workspaceId } } },
      relations: { asset: true },
      select: { id: true, asset: { id: true } },
    });
    return [...new Set(rows.map((row) => row.asset.id))];
  }

  /** 404 unless the id is a ready, readable artifact in the workspace templates folder. */
  private async findTemplate(workspaceId: string, userId: string, id: string): Promise<Artifact> {
    const [artifact] = await this.findTemplates(workspaceId, userId, [id]);
    return artifact;
  }

  /** 404 unless every id is a ready, readable artifact in the workspace templates folder. */
  private async findTemplates(
    workspaceId: string,
    userId: string,
    ids: string[],
  ): Promise<Artifact[]> {
    const folder = await this.folders.ensureTemplatesFolder(workspaceId);
    const rows = await this.artifactRepo.find({
      where: {
        id: In(ids),
        workspaceId,
        status: ArtifactStatus.READY,
      },
      relations: { createdBy: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return Promise.all(
      ids.map(async (id) => {
        const artifact = byId.get(id);
        if (
          !artifact ||
          artifact.parentFolderId !== folder.id ||
          !(await this.artifacts.canRead(artifact, userId))
        ) {
          throw new NotFoundException('Template not found');
        }
        return artifact;
      }),
    );
  }
}
