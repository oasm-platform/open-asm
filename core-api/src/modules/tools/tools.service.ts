import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddToolToWorkspaceDto } from './dto/tools.dto';
import { Tool } from './entities/tools.entity';
import { WorkspaceTool } from './entities/workspace_tools.entity';

@Injectable()
export class ToolsService {
  constructor(
    @InjectRepository(Tool)
    private readonly toolsRepository: Repository<Tool>,
    @InjectRepository(WorkspaceTool)
    private readonly workspaceToolRepository: Repository<WorkspaceTool>,
  ) {}

  /**
   * Add a tool to a workspace.
   * @throws BadRequestException if the tool already exists in this workspace.
   * @returns The newly created workspace-tool entry.
   */
  async addToolToWorkspace(dto: AddToolToWorkspaceDto): Promise<WorkspaceTool> {
    const existingEntry = await this.workspaceToolRepository.findOne({
      where: { isEnabled: true },
    });

    if (existingEntry) {
      throw new BadRequestException('Tool already exists in this workspace.');
    }

    const newWorkspaceTool = this.workspaceToolRepository.create({
      tool: { id: dto.toolId },
      workspace: { id: dto.workspaceId },
    });
    return this.workspaceToolRepository.save(newWorkspaceTool);
  }
}
