import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { Repository } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateTemplateDTO } from './dto/createTemplate.dto';
import { Template } from './entities/templates.entity';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    private readonly workspacesService: WorkspacesService,
    private readonly storageService: StorageService,
  ) {}

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
      workspace,
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
    newFileName: string,
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

    // Check if new filename already exists in workspace
    const existingTemplate = await this.templateRepo.findOne({
      where: {
        fileName: newFileName,
        workspace: { id: workspaceId },
      },
    });

    if (existingTemplate && existingTemplate.id !== templateId) {
      throw new BadRequestException(
        'A template with this filename already exists',
      );
    }

    template.fileName = newFileName;
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

    // Delete file from storage if it exists
    if (template.path) {
      try {
        this.storageService.deleteFile(template.path, 'templates');
      } catch (error) {
        // Log error but don't fail the operation
        this.logger.warn('Failed to delete file from storage:', error);
      }
    }

    // Delete template from database
    await this.templateRepo.remove(template);
  }

  async getAllTemplates(
    workspaceId: string,
    userContext: UserContextPayload,
  ): Promise<Template[]> {
    const workspace = await this.workspacesService.getWorkspaceById(
      workspaceId,
      userContext,
    );

    if (!workspace) throw new NotFoundException('Cannot find the workspace');

    return this.templateRepo.find({
      where: { workspace: { id: workspaceId } },
      relations: ['workspace'],
    });
  }
}
