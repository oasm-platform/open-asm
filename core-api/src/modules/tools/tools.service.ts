import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { ToolCategory, WorkerType } from 'src/common/enums/enum';
import { getManyResponse } from 'src/utils/getManyResponse';
import { In, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { builtInTools } from './built-in-tools';
import { CreateToolDto } from './dto/create-tool.dto';
import { GetInstalledToolsDto } from './dto/get-installed-tools.dto';
import { InstallToolDto } from './dto/install-tool.dto';
import { ToolsQueryDto } from './dto/tools-query.dto';
import { AddToolToWorkspaceDto } from './dto/tools.dto';
import { Tool } from './entities/tools.entity';
import { WorkspaceTool } from './entities/workspace_tools.entity';
@Injectable()
export class ToolsService implements OnModuleInit {
  constructor(
    @InjectRepository(Tool)
    public readonly toolsRepository: Repository<Tool>,
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
          overwrite: ['description', 'logoUrl', 'version', 'uniqueName'],
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
      where: {
        tool: { id: dto.toolId },
        workspace: { id: dto.workspaceId },
      },
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
   * Install a tool to a workspace, checking for duplicates before insertion.
   * @throws BadRequestException if the tool already exists in this workspace.
   * @returns The newly created workspace-tool entry.
   */
  async installTool(dto: InstallToolDto): Promise<WorkspaceTool> {
    // Check if the tool already exists in this workspace
    const existingEntry = await this.workspaceToolRepository.findOne({
      where: {
        tool: { id: dto.toolId },
        workspace: { id: dto.workspaceId },
      },
    });

    if (existingEntry) {
      throw new BadRequestException(
        'Tool already installed in this workspace.',
      );
    }

    // Create and save the new workspace-tool entry
    const newWorkspaceTool = this.workspaceToolRepository.create({
      tool: { id: dto.toolId },
      workspace: { id: dto.workspaceId },
    });
    return this.workspaceToolRepository.save(newWorkspaceTool);
  }

  /**
   * Uninstall a tool from a workspace by removing the record from workspace_tools table.
   * @param dto The uninstall tool data containing toolId and workspaceId.
   * @returns A boolean indicating success.
   */
  async uninstallTool(dto: InstallToolDto): Promise<DefaultMessageResponseDto> {
    const existingEntry = await this.workspaceToolRepository.findOne({
      where: {
        tool: { id: dto.toolId },
        workspace: { id: dto.workspaceId },
      },
    });

    if (!existingEntry) {
      throw new BadRequestException('Tool is not installed in this workspace.');
    }

    await this.workspaceToolRepository.remove(existingEntry);
    return {
      message: 'Tool uninstalled successfully.',
    };
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

    // If workspaceId is provided, we need to check which tools are installed
    if (query.workspaceId) {
      const [data, total] = await this.toolsRepository.findAndCount({
        where: Object.keys(where).length ? where : undefined,
        take: limit,
        skip: skip,
        order: {
          name: 'ASC',
        },
      });

      // Get installed tools for this workspace
      const installedTools = await this.workspaceToolRepository.find({
        where: {
          workspace: { id: query.workspaceId },
        },
        relations: ['tool'],
      });

      // Add isInstalled flag to each tool
      const toolsWithInstalledFlag = data.map((tool) => {
        const isInstalled = installedTools.some((wt) => wt.tool.id === tool.id);
        return {
          ...tool,
          isInstalled,
        };
      });

      return getManyResponse({ query, data: toolsWithInstalledFlag, total });
    } else {
      // Original behavior when no workspaceId is provided
      const [data, total] = await this.toolsRepository.findAndCount({
        where: Object.keys(where).length ? where : undefined,
        take: limit,
        skip: skip,
        relations: {
          workspaceTools: true,
        },
        order: {
          name: 'ASC',
        },
      });
      return getManyResponse({ query, data, total });
    }
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

  /**
   * Get a tool by its ID.
   * @param {string} id - The ID of the tool.
   * @param {string} workspaceId - Optional workspace ID to check if tool is installed.
   * @returns {Promise<Tool>} The tool with the specified ID.
   * @throws {NotFoundException} If no tool is found with the provided ID.
   */
  async getToolById(id: string, workspaceId?: string): Promise<Tool> {
    const tool = await this.toolsRepository.findOne({
      where: { id },
    });

    if (!tool) {
      throw new NotFoundException(`Tool with ID "${id}" not found.`);
    }

    // If tool is built-in, it's always considered installed
    if (tool.type === WorkerType.BUILT_IN) {
      tool.isInstalled = true;
      return tool;
    }

    // If workspaceId is provided, check if the tool is installed in that workspace
    if (workspaceId) {
      const workspaceTool = await this.workspaceToolRepository.findOne({
        where: {
          tool: { id: tool.id },
          workspace: { id: workspaceId },
        },
      });

      // Add isInstalled flag to the tool
      tool.isInstalled = !!workspaceTool;
    }

    return tool;
  }

  /**
   * Create a new tool.
   * @param {CreateToolDto} dto - The tool creation data.
   * @returns {Promise<Tool>} The created tool.
   */
  async createTool(dto: CreateToolDto): Promise<Tool> {
    // Check if a tool with the same name already exists
    const existingTool = await this.toolsRepository.findOne({
      where: { name: dto.name },
    });

    if (existingTool) {
      throw new BadRequestException(
        `A tool with the name "${dto.name}" already exists.`,
      );
    }

    const tool = this.toolsRepository.create({
      name: dto.name,
      description: dto.description,
      category: dto.category,
      // Set default values for other required fields
      type: WorkerType.PROVIDER, // or another appropriate default
      isOfficialSupport: false,
      version: dto.version,
      logoUrl: dto.logoUrl,
    });

    return this.toolsRepository.save(tool);
  }

  /**
   * Get tools by names.
   * @param {string[]} names - The names of the tools.
   * @returns {Promise<Tool[]>} The tools with the specified names.
   */
  public getToolByNames(names: string[]) {
    return this.toolsRepository.find({
      where: {
        name: In(names),
      },
    });
  }
}
