import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { Repository } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { Template } from './entities/templates.entity';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async createTemplate(
    workspaceId: string,
    userContext: UserContextPayload,
    template: Template,
  ): Promise<Template> {
    const workspace = await this.workspacesService.getWorkspaceById(
      workspaceId,
      userContext,
    );

    if (!workspace) throw new NotFoundException('Cannot find the workspace');

    template.workspace = workspace;

    return this.templateRepo.save(template);
  }
}
