import type { WrapperType } from '@/common/types/app.types';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { ToolCategory, WorkerScope, WorkerType } from '@/common/enums/enum';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  FindOperator,
  FindOptionsWhere,
} from 'typeorm';
import { And, ILike, In, Not, Raw, Repository } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { WorkersService } from '../workers/workers.service';
import { CreateToolDto } from './dto/create-tool.dto';
import { GetInstalledToolsDto } from './dto/get-installed-tools.dto';
import { InstallToolDto } from './dto/install-tool.dto';
import { ToolsQueryDto } from './dto/tools-query.dto';
import { AddToolToWorkspaceDto } from './dto/tools.dto';
import { Tool } from './entities/tools.entity';
import { ToolConfigProfile } from './entities/tool-config-profiles.entity';
import { WorkspaceTool } from './entities/workspace_tools.entity';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { DEFAULT_TOOL_TARGET_TYPES } from './tool-target-types';

/** WHERE fragment: the tool declares `category` among its categories. */
const hasCategory = (category: ToolCategory) =>
  Raw((alias) => `${alias} @> :categoryFilter::jsonb`, {
    categoryFilter: JSON.stringify([{ name: category }]),
  });

// Search input is trimmed and capped to keep ILIKE patterns cheap and bounded.
const MAX_SEARCH_LENGTH = 100;
// DTO-level default sortBy — treated as "not passed" so the legacy tools-list
// ordering (name ASC) is preserved when the client does not override it.
const DEFAULT_SORT_FIELD = 'createdAt';
// Whitelist of sortable columns; anything else falls back to the default order.
const ALLOWED_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'category',
  'type',
] as const;

/** One OR-branch of the agentTool filter (see buildAgentToolWhere). */
type AgentToolWhere = {
  id?: FindOperator<string>;
  name?: FindOperator<string>;
  type?: WorkerType | FindOperator<WorkerType>;
};

@Injectable()
export class ToolsService {
  constructor(
    @InjectRepository(Tool)
    private readonly toolsRepository: Repository<Tool>,

    @InjectRepository(WorkspaceTool)
    private readonly workspaceToolRepository: Repository<WorkspaceTool>,

    @InjectRepository(Asset)
    public readonly assetRepo: Repository<Asset>,

    @InjectRepository(Vulnerability)
    public readonly vulnerabilityRepo: Repository<Vulnerability>,

    @Inject(forwardRef(() => WorkersService))
    private readonly workersService: WrapperType<WorkersService>,

    @InjectRepository(ToolConfigProfile)
    private readonly profilesRepo: Repository<ToolConfigProfile>,

    private readonly connectorRegistry: ConnectorRegistryService,
  ) {}

  /**
   * Count available BUILT_IN-type workers for a workspace.
   * All built-in tools share the same worker pool, so the count is computed
   * once per page instead of once per tool.
   * @param workspaceId The workspace ID to filter workspace-scoped workers.
   * @returns The number of available BUILT_IN workers.
   */
  private async countBuiltInWorkers(workspaceId: string): Promise<number> {
    return this.workersService.repo
      .createQueryBuilder('w')
      .where('(w."workspaceId" = :workspaceId OR w."scope" = :cloudScope)', {
        workspaceId,
        cloudScope: WorkerScope.CLOUD,
      })
      .andWhere('w.type = :type', { type: WorkerType.BUILT_IN })
      .getCount();
  }

  /**
   * Count available workers per tool id in a single grouped query.
   * Batch variant of the per-tool worker count (N+1): PROVIDER workers are
   * always CLOUD-scoped (see determineWorkerTypeAndScope), so they're
   * available globally regardless of per-workspace installation status.
   * @param workspaceId The workspace ID to filter workspace-scoped workers.
   * @param toolIds The tool ids to count workers for.
   * @returns Map of toolId → available worker count.
   */
  private async countAvailableWorkersBatch(
    workspaceId: string,
    toolIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (toolIds.length === 0) return counts;

    const rows: Array<{ toolId: string | null; count: string }> =
      await this.workersService.repo
        .createQueryBuilder('w')
        .select('w."toolId"', 'toolId')
        .addSelect('COUNT(*)', 'count')
        .where('(w."workspaceId" = :workspaceId OR w."scope" = :cloudScope)', {
          workspaceId,
          cloudScope: WorkerScope.CLOUD,
        })
        .andWhere('w."toolId" IN (:...toolIds)', { toolIds })
        .groupBy('w."toolId"')
        .getRawMany();

    for (const row of rows) {
      if (row.toolId) counts.set(row.toolId, Number(row.count));
    }
    return counts;
  }

  /**
   * Whether the tool counts as an AI agent tool. Built-in tools always do;
   * any other tool needs the `agentTool` flag on its connector manifest entry.
   */
  private isAgentTool(tool: Pick<Tool, 'name' | 'type'>): boolean {
    return (
      tool.type === WorkerType.BUILT_IN ||
      this.connectorRegistry.getConnector(tool.name)?.agentTool === true
    );
  }

  /**
   * Where branches (OR-ed) for the agentTool filter — the query-side mirror of
   * isAgentTool. `type` is the caller's own type filter: a branch only pins
   * `type` where that cannot contradict it.
   */
  private buildAgentToolWhere(
    agentTool: boolean,
    type?: WorkerType,
  ): AgentToolWhere[] {
    const agentSlugs = this.connectorRegistry
      .getAllConnectors()
      .filter((entry) => entry.agentTool === true)
      .map((entry) => entry.slug);

    if (agentTool) {
      const byManifest: AgentToolWhere = { name: In(agentSlugs) };
      return type && type !== WorkerType.BUILT_IN
        ? [byManifest]
        : [{ type: WorkerType.BUILT_IN }, byManifest];
    }
    if (type === WorkerType.BUILT_IN) {
      // Every built-in is an agent tool → match nothing (In([]) renders 0=1).
      return [{ id: In([]) }];
    }
    return [
      {
        ...(!type && { type: Not(WorkerType.BUILT_IN) }),
        name: Not(In(agentSlugs)),
      },
    ];
  }

  /**
   * Checks whether at least one ToolConfigProfile exists for a workspace+tool pair.
   */
  async hasProfile(workspaceId: string, toolId: string): Promise<boolean> {
    const profile = await this.profilesRepo.findOne({
      where: {
        workspace: { id: workspaceId },
        tool: { id: toolId },
      },
    });
    return !!profile;
  }

  /**
   * Returns the set of tool ids that have at least one ToolConfigProfile
   * for the given workspace. Batch variant of hasProfile — a single query
   * with an In-operator instead of one findOne per tool (N+1, #4).
   */
  async getProfileToolIds(
    workspaceId: string,
    toolIds: string[],
  ): Promise<Set<string>> {
    if (!toolIds || toolIds.length === 0) return new Set<string>();
    const profiles = await this.profilesRepo.find({
      where: {
        workspace: { id: workspaceId },
        tool: { id: In(toolIds) },
      },
      relations: ['tool'],
    });
    return new Set(
      profiles
        .map((p) => p.tool.id)
        .filter((id): id is string => Boolean(id)),
    );
  }

  /**
   * Resolves the effective schema for a tool (connector or built-in).
   * Returns { schema, source } or throws if tool not found / unknown connector.
   */
  async getToolSchema(
    toolId: string,
    workspaceId?: string,
  ): Promise<{ schema: Record<string, unknown> | null; source: 'configSchema' | null }> {
    const tool = await this.getToolById(toolId, workspaceId);
    // Only an UNKNOWN connector slug (no registry entry at all) is an error.
    // A known connector that merely lacks a schema legitimately has no config.
    if (
      this.connectorRegistry.getConnector(tool.name) === null &&
      tool.type !== WorkerType.BUILT_IN
    ) {
      throw new BadRequestException(
        `Unknown connector slug "${tool.name}"`,
      );
    }
    return this.connectorRegistry.getEffectiveSchema(tool.name);
  }

  /**
   * Add a tool to a workspace.
   * @throws BadRequestException if the tool already exists in this workspace.
   * @returns The newly created workspace-tool entry.
   */
  async addToolToWorkspace(
    dto: AddToolToWorkspaceDto,
    workspaceId: string,
  ): Promise<WorkspaceTool> {
    const existingEntry = await this.workspaceToolRepository.findOne({
      where: {
        tool: { id: dto.toolId },
        workspace: { id: workspaceId },
      },
    });

    if (existingEntry) {
      throw new BadRequestException('Tool already exists in this workspace.');
    }

    const newWorkspaceTool = this.workspaceToolRepository.create({
      tool: { id: dto.toolId },
      workspace: { id: workspaceId },
    });
    return this.workspaceToolRepository.save(newWorkspaceTool);
  }

  /**
   * Install a tool to a workspace, checking for duplicates before insertion.
   * @throws BadRequestException if the tool already exists in this workspace.
   * @returns The newly created workspace-tool entry.
   */
  async installTool(
    dto: InstallToolDto,
    workspaceId: string,
  ): Promise<WorkspaceTool> {
    // Check if the tool already exists in this workspace
    const existingEntry = await this.workspaceToolRepository.findOne({
      where: {
        tool: { id: dto.toolId },
        workspace: { id: workspaceId },
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
      workspace: { id: workspaceId },
    });
    return this.workspaceToolRepository.save(newWorkspaceTool);
  }

  /**
   * Uninstall a tool from a workspace by removing the record from workspace_tools table.
   * @param dto The uninstall tool data containing toolId and workspaceId.
   * @returns A boolean indicating success.
   */
  async uninstallTool(
    dto: InstallToolDto,
    workspaceId: string,
  ): Promise<DefaultMessageResponseDto> {
    const existingEntry = await this.workspaceToolRepository.findOne({
      where: {
        tool: { id: dto.toolId },
        workspace: { id: workspaceId },
      },
    });

    if (!existingEntry) {
      throw new BadRequestException('Tool is not installed in this workspace.');
    }

    // Remove the workspace_tools row AND cascade its ToolConfigProfile rows
    // atomically. There is no FK from profiles to workspace_tools, so the
    // profile cleanup must be explicit; doing both inside one transaction
    // keeps them atomic.
    await this.workspaceToolRepository.manager.transaction(async (manager) => {
      await manager.remove(existingEntry);
      await manager.delete(ToolConfigProfile, {
        workspace: { id: workspaceId },
        tool: { id: dto.toolId },
      });
    });

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
   * Builds a TypeORM where clause for getManyTools.
   * When search is provided, creates an OR branch matching name OR description
   * (ILIKE, case-insensitive); agentTool adds its own OR branches. Every branch
   * is combined (AND) with type/category/provider filters.
   */
  private buildToolsWhere(
    query: ToolsQueryDto,
  ): FindOptionsWhere<Tool>[] | FindOptionsWhere<Tool> | undefined {
    const base: FindOptionsWhere<Tool> = {};
    if (query.type) base.type = query.type;
    if (query.category) base.categories = hasCategory(query.category);
    if (query.providerId) base.provider = { id: query.providerId };

    const searchTerm = (query.search ?? '').trim().slice(0, MAX_SEARCH_LENGTH);
    // Escape LIKE wildcards so user input is matched literally; ILike()
    // keeps the value parameterized (no SQL injection).
    const pattern = `%${searchTerm.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const searchBranches: { name?: FindOperator<string>; description?: FindOperator<string> }[] =
      searchTerm
        ? [{ name: ILike(pattern) }, { description: ILike(pattern) }]
        : [{}];
    const agentBranches: AgentToolWhere[] =
      query.agentTool === undefined
        ? [{}]
        : this.buildAgentToolWhere(query.agentTool, query.type);

    const branches: FindOptionsWhere<Tool>[] = agentBranches.flatMap((agent) =>
      searchBranches.map((search) => ({
        ...base,
        ...agent,
        ...search,
        // Both constrain the name (agent slugs vs. search pattern) → need both.
        ...(agent.name && search.name && { name: And(agent.name, search.name) }),
      })),
    );
    if (branches.length > 1) return branches;
    return Object.keys(branches[0]).length ? branches[0] : undefined;
  }

  /**
   * Builds a TypeORM order clause for getManyTools.
   * When sortBy/sortOrder are non-default and the field is whitelisted,
   * the client-specified sort is used; otherwise the legacy default (name ASC).
   */
  private buildToolsOrder(query: ToolsQueryDto): Record<string, 'ASC' | 'DESC'> {
    const isDefaultSort =
      (!query.sortBy || query.sortBy === DEFAULT_SORT_FIELD) &&
      (!query.sortOrder || query.sortOrder === SortOrder.ASC);
    if (
      !isDefaultSort &&
      query.sortBy &&
      (ALLOWED_SORT_FIELDS as readonly string[]).includes(query.sortBy)
    ) {
      return { [query.sortBy]: query.sortOrder ?? SortOrder.ASC };
    }
    return { name: 'ASC' };
  }

  /**
   * Retrieves a list of tools with pagination.
   * @param {ToolsQueryDto} query - The query parameters.
   * @returns {Promise<GetManyBaseResponseDto<Tool>>} The tools.
   */
  async getManyTools(query: ToolsQueryDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const where = this.buildToolsWhere(query);
    const order = this.buildToolsOrder(query);

    // If workspaceId is provided, we need to check which tools are installed
    if (query.workspaceId) {
      const workspaceId = query.workspaceId;

      const [data, total] = await this.toolsRepository.findAndCount({
        where,
        take: limit,
        skip,
        order,
      });

      // Get installed tools for this workspace
      const installedTools = await this.workspaceToolRepository.find({
        where: {
          workspace: { id: workspaceId },
        },
        relations: ['tool'],
      });

      // Batch worker counts — one query for the shared built-in pool and one
      // grouped query for all connector/provider tools (replaces N+1).
      const builtInWorkersCount = data.some(
        (t) => t.type === WorkerType.BUILT_IN,
      )
        ? await this.countBuiltInWorkers(workspaceId)
        : 0;

      const nonBuiltInIds = data
        .filter((t) => t.type !== WorkerType.BUILT_IN && t.id)
        .map((t) => t.id!);
      const workersCounts = await this.countAvailableWorkersBatch(
        workspaceId,
        nonBuiltInIds,
      );

      // Add isInstalled flag and availableWorkersCount to each tool
      const toolsWithInstalledFlag = data.map((tool) => {
        // Skip tools without ID or type
        if (!tool.id || !tool.type) {
          return {
            ...tool,
            isInstalled: false,
            availableWorkersCount: 0,
          };
        }

        // Built-in tools are always considered installed
        if (tool.type === WorkerType.BUILT_IN) {
          return {
            ...tool,
            isInstalled: true,
            availableWorkersCount: builtInWorkersCount,
            isReady: true,
          };
        }

        const workspaceTool = installedTools.find(
          (wt) => wt.tool.id === tool.id,
        );
        const isInstalled = !!workspaceTool?.isEnabled;
        return {
          ...tool,
          isInstalled,
          availableWorkersCount: workersCounts.get(tool.id) ?? 0,
        };
      });

      // Batch config-profile lookup for installed connectors (single query
      // with In-operator instead of one findOne per tool, #4)
      const installedConnectorIds = toolsWithInstalledFlag
        .filter(
          (tool) =>
            tool.type !== WorkerType.BUILT_IN && tool.isInstalled,
        )
        .map((tool) => tool.id)
        .filter((id): id is string => Boolean(id));
      const profileToolIds = await this.getProfileToolIds(
        workspaceId,
        installedConnectorIds,
      );

      const toolsWithProfiles = toolsWithInstalledFlag.map((tool) => {
        if (tool.type === WorkerType.BUILT_IN || !tool.isInstalled) {
          return tool;
        }
        const hasConfigProfile = profileToolIds.has(tool.id!);
        // Connector without a config schema needs no config → installed means ready.
        const needsConfig =
          this.connectorRegistry.getConnectorSchema(tool.name) !== null;
        return {
          ...tool,
          hasConfigProfile,
          isReady: needsConfig ? hasConfigProfile : true,
        };
      });

      return getManyResponse({
        query,
        data: toolsWithProfiles.map((tool) => ({
          ...tool,
          agentTool: this.isAgentTool(tool),
        })),
        total,
      });
    } else {
      // No workspaceId — simple paginated query
      const [data, total] = await this.toolsRepository.findAndCount({
        where,
        take: limit,
        skip,
        relations: {
          workspaceTools: true,
          provider: true,
        },
        order,
      });
      for (const tool of data) {
        tool.agentTool = this.isAgentTool(tool);
      }
      return getManyResponse({ query, data, total });
    }
  }

  async getInstalledTools(dto: GetInstalledToolsDto, workspaceId?: string) {
    const builtInTools = await this.toolsRepository.find({
      where: {
        type: WorkerType.BUILT_IN,
        ...(dto.category && { categories: hasCategory(dto.category) }),
      },
    });

    const workspaceTools = await this.workspaceToolRepository.find({
      where: {
        workspace: { id: workspaceId },
        ...(dto.category && { tool: { categories: hasCategory(dto.category) } }),
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

    // Enrich with readiness flags (batched profile lookup, #4)
    const profileToolIds = workspaceId
      ? await this.getProfileToolIds(
          workspaceId,
          combinedTools
            .filter((tool) => tool.type !== WorkerType.BUILT_IN)
            .map((tool) => tool.id!)
            .filter(Boolean),
        )
      : new Set<string>();

    const enrichedTools = combinedTools.map((tool) => {
      const agentTool = this.isAgentTool(tool);
      if (tool.type === WorkerType.BUILT_IN) {
        return { ...tool, isReady: true, agentTool };
      }
      const hasConfigProfile = workspaceId
        ? profileToolIds.has(tool.id!)
        : false;
      // Connector without a config schema needs no config → installed means ready.
      const needsConfig =
        this.connectorRegistry.getConnectorSchema(tool.name) !== null;
      return {
        ...tool,
        hasConfigProfile,
        isReady: needsConfig ? hasConfigProfile : true,
        agentTool,
      };
    });

    return {
      data: enrichedTools,
      total: enrichedTools.length,
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

    tool.agentTool = this.isAgentTool(tool);

    // If tool is built-in, it's always considered installed and ready
    if (tool.type === WorkerType.BUILT_IN) {
      tool.isInstalled = true;
      tool.isReady = true;
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

      // A disabled workspace tool is not installed, as in the tool listing.
      tool.isInstalled = !!workspaceTool?.isEnabled;

      // Add hasConfigProfile and isReady flags
      const hasConfigProfile = await this.hasProfile(workspaceId, tool.id!);
      tool.hasConfigProfile = hasConfigProfile;
      // Connector without a config schema needs no config → installed means ready.
      const needsConfig =
        this.connectorRegistry.getConnectorSchema(tool.name) !== null;
      tool.isReady = tool.isInstalled && (needsConfig ? hasConfigProfile : true);
    } else {
      // Without workspaceId, profile status is unknown
      tool.hasConfigProfile = null;
      tool.isReady = false;
    }

    return tool;
  }

  /**
    * Create a new tool.
    * @param {CreateToolDto} dto - The tool creation data.
    * @returns {Promise<Tool>} The created tool.
    */
  async createTool(dto: CreateToolDto): Promise<Tool> {
    // Check if a tool with the same name + type already exists (unique is name+type since connector support)
    const existingTool = await this.toolsRepository.findOne({
      where: { name: dto.name, type: WorkerType.PROVIDER },
    });

    if (existingTool) {
      throw new BadRequestException(
        `A tool with the name "${dto.name}" already exists.`,
      );
    }

    const tool = this.toolsRepository.create({
      name: dto.name,
      description: dto.description,
      categories: dto.categories.map((name) => ({
        name,
        targetTypes: [...DEFAULT_TOOL_TARGET_TYPES],
      })),
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
    if (!isInstalled) {
      return await this.toolsRepository.find({
        where: {
          name: In(names),
        },
      });
    }

    return await this.toolsRepository.find({
      where: [
        {
          name: In(names),
          type: WorkerType.BUILT_IN,
        },
        {
          workspaceTools: {
            tool: {
              name: In(names),
            },
          },
        },
      ],
    });
  }
}
