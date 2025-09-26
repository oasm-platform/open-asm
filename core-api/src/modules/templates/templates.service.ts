import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { GetManyBaseResponseDto } from 'src/common/dtos/get-many-base.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { getManyResponse } from 'src/utils/getManyResponse';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { StorageService } from '../storage/storage.service';
import { ToolsService } from '../tools/tools.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateTemplateDTO } from './dto/createTemplate.dto';
import { GetManyTemplatesQueryDTO } from './dto/get-many-template-query';
import { RenameTemplateDTO } from './dto/renameTemplate.dto';
import { RunTemplateDto } from './dto/run-template.dto';
import { Template } from './entities/templates.entity';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    private readonly workspacesService: WorkspacesService,
    private readonly storageService: StorageService,
    private jobService: JobsRegistryService,
    private toolService: ToolsService
  ) { }

  public async createTemplate(
    workspaceId: string,
    userContext: UserContextPayload,
    dto: CreateTemplateDTO,
  ): Promise<Template> {
    const workspace = await this.workspacesService.getWorkspaceById(
      workspaceId,
      userContext,
    );

    if (!workspace) throw new NotFoundException('Workspace not found');

    const template = await this.templateRepo.findOneBy({
      fileName: dto.fileName,
      workspace: { id: workspaceId },
    });

    if (template) throw new BadRequestException('File name was already taken');

    const newTemplate = new Template();
    newTemplate.fileName = dto.fileName;
    newTemplate.workspace = workspace;
    return this.templateRepo.save(newTemplate);
  }

  public async uploadFile(templateId: string, fileContent: string) {
    const template = await this.templateRepo.findOneBy({ id: templateId });

    if (!template) {
      throw new BadRequestException('Invalid upload request');
    }

    const fileBuffer = Buffer.from(fileContent, 'utf-8');

    const result = this.storageService.uploadFile(
      `${templateId}.yaml`,
      fileBuffer,
      'nuclei-templates',
    );

    if (!template.path) {
      await this.templateRepo.update({ id: templateId }, { path: result.path });
    }

    return result;
  }

  public async renameFile(
    templateId: string,
    workspaceId: string,
    userContext: UserContextPayload,
    dto: RenameTemplateDTO,
  ): Promise<Template> {
    const workspace = await this.workspacesService.getWorkspaceById(
      workspaceId,
      userContext,
    );

    if (!workspace) throw new NotFoundException('Cannot find the workspace');

    const template = await this.templateRepo.findOne({
      where: { id: templateId },
      relations: ['workspace'],
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.workspace.id !== workspaceId) {
      throw new BadRequestException(
        'Template does not belong to this workspace',
      );
    }

    const templateByFileName = await this.templateRepo.findOneBy({
      fileName: dto.fileName,
      workspace: { id: workspaceId },
    });

    if (templateByFileName)
      throw new BadRequestException('File name was already taken');

    template.fileName = dto.fileName;
    return this.templateRepo.save(template);
  }

  async getTemplateById(
    templateId: string,
    workspaceId: string,
    userContext: UserContextPayload,
  ): Promise<Template> {
    const workspace = await this.workspacesService.getWorkspaceById(
      workspaceId,
      userContext,
    );

    if (!workspace) throw new NotFoundException('Cannot find the workspace');

    const template = await this.templateRepo.findOne({
      where: { id: templateId },
      relations: ['workspace'],
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.workspace.id !== workspaceId) {
      throw new BadRequestException(
        'Template does not belong to this workspace',
      );
    }

    return template;
  }

  async deleteTemplate(
    templateId: string,
    workspaceId: string,
    userContext: UserContextPayload,
  ): Promise<void> {
    const template = await this.getTemplateById(
      templateId,
      workspaceId,
      userContext,
    );

    if (template.path) {
      const [bucket, path] = this.getFileAndBucket(template.path);
      try {
        this.storageService.deleteFile(path, bucket);
      } catch (error) {
        // Log error but don't fail the operation
        this.logger.warn('Failed to delete file from storage:', error);
      }
    }

    // Delete template from database
    await this.templateRepo.remove(template);
  }

  async getAllTemplates(
    query: GetManyTemplatesQueryDTO,
    workspaceId: string,
    userContext: UserContextPayload,
  ): Promise<GetManyBaseResponseDto<Template>> {
    const workspace = await this.workspacesService.getWorkspaceById(
      workspaceId,
      userContext,
    );

    if (!workspace) throw new NotFoundException('Cannot find the workspace');

    const where: FindOptionsWhere<Template> = {
      workspace: { id: workspaceId },
    };

    if (query.value) {
      where.fileName = ILike(`%${query.value}%`);
    }

    const [data, total] = await this.templateRepo.findAndCount({
      where,
      order: {
        createdAt: 'ASC',
      },
      take: query.limit,
      skip: query.limit * (query.page - 1),
      relations: ['workspace'],
    });

    return getManyResponse({ query, data, total });
  }

  private getFileAndBucket(path: string) {
    const parts = path.split('/', 2);
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      throw new BadRequestException(
        'Invalid path format. Expected "bucket/path".',
      );
    }
    return [parts[0], parts[1]];
  }

  public async runTemplate(
    dto: RunTemplateDto,
    workspaceId: string,
  ): Promise<DefaultMessageResponseDto> {
    const { assetIds, targetIds } = dto;
    const [nuclei] = await this.toolService.getToolByNames(['nuclei']);

    if (!nuclei) {
      throw new NotFoundException('Nuclei tool is not available');
    }

    await this.jobService.createNewJob({
      tool: nuclei,
      targetIds: targetIds || [],
      assetIds: assetIds || [],
      workspaceId,
      priority: 0,
      isSaveRawResult: true,
      isSaveData: false
    });

    return {
      message: 'Template run successfully',
    };
  }
}
