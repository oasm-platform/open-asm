import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { ToolCategory, WorkerType } from 'src/common/enums/enum';
import { getManyResponse } from 'src/utils/getManyResponse';
import { Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { builtInTools } from './built-in-tools';
import { GetInstalledToolsDto } from './dto/get-installed-tools.dto';
import { ToolsQueryDto } from './dto/tools-query.dto';
import { AddToolToWorkspaceDto } from './dto/tools.dto';
import { Tool } from './entities/tools.entity';
import { WorkspaceTool } from './entities/workspace_tools.entity';
@Injectable()
export class ToolsService implements OnModuleInit {
  constructor(
    @InjectRepository(Tool)
    private readonly toolsRepository: Repository<Tool>,
    @InjectRepository(WorkspaceTool)
    private readonly workspaceToolRepository: Repository<WorkspaceTool>,

    @InjectRepository(Asset)
    public readonly assetRepo: Repository<Asset>,

    @InjectRepository(Vulnerability)
    public readonly vulnerabilityRepo: Repository<Vulnerability>,
  ) {}

  async onModuleInit() {
    try {
      // Convert builtInTools to Tool entities
      const toolsToInsert = builtInTools.map((tool) => ({
        id: randomUUID(),
        name: tool.name,
        category: tool.category,
        description: tool.description,
        logoUrl: tool.logoUrl,
        command: tool.command,
        version: tool.version,
        isBuiltIn: true,
        isOfficialSupport: true,
        type: WorkerType.BUILT_IN,
      }));

      // Insert tools using upsert to avoid duplicates
      await this.toolsRepository
        .createQueryBuilder()
        .insert()
        .orUpdate({
          conflict_target: ['name'],
          overwrite: ['description', 'logoUrl', 'version'],
        })
        .values(toolsToInsert)
        .execute();
    } catch (error) {
      Logger.error('Error initializing built-in tools:', error);
    }
  }

  /**
   * Get a built-in tool by category.
   * @param {ToolCategory} category - The category of the tool.
   * @returns {Tool | undefined} The built-in tool if found, otherwise undefined.
   */
  public async getBuiltInByCategory(
    category: ToolCategory,
  ): Promise<Tool | null> {
    const tool = await this.toolsRepository.findOne({
      where: { category, type: WorkerType.BUILT_IN },
    });
    return tool;
  }

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

  /**
   * Get all built-in tools.
   * @returns An array of built-in tools.
   */
  async getBuiltInTools() {
    const data = await this.toolsRepository.find({
      where: {
        type: WorkerType.BUILT_IN,
      },
      order: {
        name: 'ASC',
      },
    });

    return {
      data,
    };
  }

  /**
   * Retrieves a list of tools with pagination.
   * @param {ToolsQueryDto} query - The query parameters.
   * @returns {Promise<GetManyBaseResponseDto<Tool>>} The tools.
   */
  async getManyTools(query: ToolsQueryDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, string | number> = {};
    if (query.type) where.type = query.type;
    if (query.category) where.category = query.category;

    const [data, total] = await this.toolsRepository.findAndCount({
      where: Object.keys(where).length ? where : undefined,
      take: limit,
      skip: skip,
      order: {
        name: 'ASC',
      },
    });
    return getManyResponse({ query, data, total });
  }

  async getInstalledTools(dto: GetInstalledToolsDto) {
    const builtInTools = await this.toolsRepository.find({
      where: {
        type: WorkerType.BUILT_IN,
        ...(dto.category && { category: dto.category }),
      },
    });

    const workspaceTools = await this.workspaceToolRepository.find({
      where: {
        workspace: { id: dto.workspaceId },
        ...(dto.category && { tool: { category: dto.category } }),
      },
      relations: ['tool'],
    });

    const installedTools = workspaceTools.map((wt) => wt.tool);

    // Combine built-in and workspace tools, ensuring no duplicates
    const combinedTools = [...builtInTools];
    installedTools.forEach((tool) => {
      if (!combinedTools.some((bt) => bt.id === tool.id)) {
        combinedTools.push(tool);
      }
    });

    return {
      data: combinedTools,
      total: combinedTools.length,
    };
  }
}
