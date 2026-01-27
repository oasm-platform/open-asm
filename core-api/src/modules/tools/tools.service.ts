import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { ApiKeyType, ToolCategory, WorkerType } from '@/common/enums/enum';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { Asset } from '../assets/entities/assets.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { CreateToolDto } from './dto/create-tool.dto';
import { GetApiKeyResponseDto } from './dto/get-apikey-response.dto';
import { GetInstalledToolsDto } from './dto/get-installed-tools.dto';
import { InstallToolDto } from './dto/install-tool.dto';
import { ToolsQueryDto } from './dto/tools-query.dto';
import { AddToolToWorkspaceDto } from './dto/tools.dto';
import { Tool } from './entities/tools.entity';
import { WorkspaceTool } from './entities/workspace_tools.entity';
import { builtInTools } from './tools-privider/built-in-tools';
import { officialSupportTools } from './tools-privider/official-support-tools';
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

    private readonly apiKeysService: ApiKeysService,

    @Inject(forwardRef(() => JobsRegistryService))
    private jobRegistryService: JobsRegistryService,
  ) {}

  async onModuleInit() {
    try {
      // Convert builtInTools to Tool entities
      const builtInToolsToInsert = builtInTools.map((tool) => ({
        ...tool,
        id: randomUUID(),
        isBuiltIn: true,
        isOfficialSupport: true,
        type: WorkerType.BUILT_IN,
      }));

      const officialSupportToolsToInsert = officialSupportTools.map((tool) => ({
        ...tool,
        id: randomUUID(),
        isBuiltIn: false,
        isOfficialSupport: true,
        type: WorkerType.PROVIDER,
      }));

      const toolsToInsert = [
        ...builtInToolsToInsert,
        ...officialSupportToolsToInsert,
      ];

      // Insert tools using upsert to avoid duplicates
      await this.toolsRepository
        .createQueryBuilder()
        .insert()
        .orUpdate({
          conflict_target: ['name'],
          overwrite: ['description', 'logoUrl', 'version', 'priority'],
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

    const where: Record<string, string | number | object> = {};
    if (query.type) where.type = query.type;
    if (query.category) where.category = query.category;
    if (query.providerId) where.provider = { id: query.providerId };

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
          provider: true,
        },
        order: {
          name: 'ASC',
        },
      });
      return getManyResponse({ query, data, total });
    }
  }

  async getInstalledTools(dto: GetInstalledToolsDto, workspaceId?: string) {
    const builtInTools = await this.toolsRepository.find({
      where: {
        type: WorkerType.BUILT_IN,
        ...(dto.category && { category: dto.category }),
      },
    });

    const workspaceTools = await this.workspaceToolRepository.find({
      where: {
        workspace: { id: workspaceId },
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
      provider: { id: dto.providerId },
    });

    return this.toolsRepository.save(tool);
  }

  /**
   * Retrieves the API key for a tool.
   * @param toolId The ID of the tool to retrieve the API key for.
   * @returns The API key for the tool.
   */
  public async getToolApiKey(toolId: string): Promise<GetApiKeyResponseDto> {
    const tool = await this.toolsRepository.findOne({
      where: { id: toolId },
    });

    if (!tool) {
      throw new NotFoundException(`Tool with ID "${toolId}" not found.`);
    }

    const apiKey = await this.apiKeysService.getCurrentApiKey(
      ApiKeyType.TOOL,
      toolId,
    );

    if (!apiKey) {
      return this.rotateToolApiKey(toolId);
    }

    return {
      apiKey: apiKey.key,
    };
  }

  /**
   * Regenerates the API key for a tool.
   * @param toolId The ID of the tool to regenerate the API key for.
   * @returns The new API key for the tool.
   */
  public async rotateToolApiKey(toolId: string): Promise<GetApiKeyResponseDto> {
    const tool = await this.toolsRepository.findOne({
      where: { id: toolId },
    });

    if (!tool) {
      throw new NotFoundException(`Tool with ID "${toolId}" not found.`);
    }

    const apiKey = await this.apiKeysService.create({
      name: `API Key for tool ${toolId}`,
      type: ApiKeyType.TOOL,
      ref: toolId,
    });
    await this.toolsRepository.update(toolId, { apiKey });

    return {
      apiKey: apiKey.key,
    };
  }

  /**
   * Get tools by names.
   * @param {string[]} names - The names of the tools.
   * @returns {Promise<Tool[]>} The tools with the specified names.
   */
  public async getToolByNames({
    names,
    isInstalled = false,
  }: {
    names: string[];
    isInstalled?: boolean;
  }): Promise<Tool[]> {
    if (isInstalled) {
      return await this.workspaceToolRepository
        .find({
          where: {
            tool: {
              name: In(names),
            },
          },
          relations: ['tool'],
        })
        .then((res) => res.map((r) => r.tool));
    }

    return await this.toolsRepository.find({
      where: {
        name: In(names),
      },
    });
  }

  /**
   * Check if AI Assistant tool is installed and enabled in a workspace.
   * @param {string} workspaceId - The workspace ID.
   * @returns {Promise<boolean>} True if AI Assistant is installed and enabled.
   */
  public async isAiAssistantEnabled(workspaceId: string): Promise<boolean> {
    // Find the AI Assistant tool
    const aiAssistantTool = await this.toolsRepository.findOne({
      where: {
        name: 'AI Assistant',
        category: ToolCategory.ASSISTANT,
      },
    });

    if (!aiAssistantTool) {
      return false;
    }

    // Check if the tool is installed in the workspace
    const workspaceTool = await this.workspaceToolRepository.findOne({
      where: {
        workspace: { id: workspaceId },
        tool: { id: aiAssistantTool.id },
        isEnabled: true,
      },
    });

    return !!workspaceTool;
  }
}
