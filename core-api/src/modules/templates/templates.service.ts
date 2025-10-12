import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { Job } from '../jobs-registry/entities/job.entity';
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

  /**
   * Creates a new template in the specified workspace
   * @param workspaceId The ID of the workspace where the template will be created
   * @param userContext User context containing user information
   * @param dto Data transfer object containing template creation details
   * @returns Promise<Template> The created template object
   * @throws NotFoundException if the workspace is not found
   * @throws BadRequestException if a template with the same filename already exists
   */
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

  /**
   * Uploads file content for a specific template
   * @param templateId The ID of the template to upload file for
   * @param fileContent The content of the file as a string
   * @returns Promise containing the upload result
   * @throws BadRequestException if the template is not found
   */
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

  /**
   * Renames an existing template file in the specified workspace
   * @param templateId The ID of the template to rename
   * @param workspaceId The ID of the workspace containing the template
   * @param userContext User context containing user information
   * @param dto Data transfer object containing the new filename
   * @returns Promise<Template> The renamed template object
   * @throws NotFoundException if the workspace or template is not found
   * @throws BadRequestException if the template doesn't belong to the workspace or filename is already taken
   */
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

  /**
   * Retrieves a template by its ID from the specified workspace
   * @param templateId The ID of the template to retrieve
   * @param workspaceId The ID of the workspace containing the template
   * @param userContext User context containing user information
   * @returns Promise<Template> The requested template object
   * @throws NotFoundException if the workspace or template is not found
   * @throws BadRequestException if the template doesn't belong to the workspace
   */
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

  /**
   * Deletes a template by its ID from the specified workspace
   * @param templateId The ID of the template to delete
   * @param workspaceId The ID of the workspace containing the template
   * @param userContext User context containing user information
   * @returns Promise<void> Resolves when deletion is complete
   * @throws NotFoundException if the template is not found
   * @throws BadRequestException if the template doesn't belong to the workspace
   */
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

  /**
   * Retrieves all templates for the specified workspace with pagination and filtering
   * @param query Query parameters for pagination and filtering
   * @param workspaceId The ID of the workspace containing the templates
   * @param userContext User context containing user information
   * @returns Promise<GetManyBaseResponseDto<Template>> Paginated response containing templates
   * @throws NotFoundException if the workspace is not found
   */
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

  /**
   * Extracts bucket name and file path from a full path string
   * @param path The full path string in format "bucket/file-path"
   * @returns [bucket, path] An array containing the bucket name and file path
   * @throws BadRequestException if the path format is invalid
   */
  private getFileAndBucket(path: string) {
    const parts = path.split('/', 2);
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      throw new BadRequestException(
        'Invalid path format. Expected "bucket/path".',
      );
    }
    return [parts[0], parts[1]];
  }

  /**
   * Runs a template scan on a specified asset
   * @param dto Data transfer object containing run template details including asset ID
   * @param workspaceId The ID of the workspace where the scan will run
   * @returns Promise<Job> The created job object for the scan
   * @throws NotFoundException if the Nuclei tool is not available
   */
  public async runTemplate(
    dto: RunTemplateDto,
    workspaceId: string,
  ): Promise<Job> {
    const { assetId } = dto;
    const [nuclei] = await this.toolService.getToolByNames(['nuclei']);

    if (!nuclei) {
      throw new NotFoundException('Nuclei tool is not available');
    }

    const job = await this.jobService.createNewJob({
      tool: nuclei,
      assetIds: [assetId],
      workspaceId,
      priority: 0,
      isSaveRawResult: true,
      isSaveData: false
    });

    return job[0];
  }
}
