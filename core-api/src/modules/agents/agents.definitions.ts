import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { Not, QueryFailedError, Repository, type FindOptionsWhere } from 'typeorm';
import {
  AGENT_NAME_MAX_LENGTH,
  AGENT_NAME_PATTERN,
  type AgentDefinitionMetadataDto,
  type AgentDefinitionResponseDto,
  type CreateAgentDefinitionDto,
  type UpdateAgentDefinitionDto,
} from './dto/agent-definition.dto';
import {
  AgentDefinition,
  type AgentDefinitionMetadata,
} from './entities/agent-definition.entity';
import {
  AgentDefinitionMode,
  AgentDefinitionScope,
} from './enums/agent.enums';

const BUILTIN_DIR = 'builtin-agents';
const MODES = new Set<string>(Object.values(AgentDefinitionMode));

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string');

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string } | undefined)?.code === '23505';

/**
 * Parses a built-in agent file: YAML frontmatter (`name`, `title`,
 * `description`, `mode` and the metadata keys) then the system prompt body.
 */
export function parseBuiltinAgentFile(
  content: string,
): AgentDefinitionResponseDto | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const fm = yaml.load(match[1]) as Record<string, unknown> | null;
  if (!fm || typeof fm !== 'object') return null;

  const name = typeof fm.name === 'string' ? fm.name.trim() : '';
  if (name.length > AGENT_NAME_MAX_LENGTH || !AGENT_NAME_PATTERN.test(name)) {
    return null;
  }
  const mode =
    typeof fm.mode === 'string' && MODES.has(fm.mode)
      ? (fm.mode as AgentDefinitionMode)
      : AgentDefinitionMode.ALL;

  const metadata: AgentDefinitionMetadataDto = {};
  if (typeof fm.variant === 'string') metadata.variant = fm.variant;
  if (typeof fm.temperature === 'number') metadata.temperature = fm.temperature;
  if (typeof fm.topP === 'number') metadata.topP = fm.topP;
  if (typeof fm.maxSteps === 'number') metadata.maxSteps = fm.maxSteps;
  if (isStringList(fm.tools)) metadata.tools = fm.tools;
  if (isStringList(fm.skills)) metadata.skills = fm.skills;
  if (isStringList(fm.mcpServers)) metadata.mcpServers = fm.mcpServers;

  return {
    id: `builtin-${name}`,
    name,
    title: typeof fm.title === 'string' ? fm.title : null,
    description: typeof fm.description === 'string' ? fm.description : '',
    mode,
    scope: AgentDefinitionScope.BUILTIN,
    isBuiltin: true,
    canEdit: false,
    systemPrompt: content.slice(match[0].length).trim(),
    metadata,
    createdBy: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

/**
 * Agent personas: built-in ones from `builtin-agents/*.md` plus the custom
 * ones users store, either personal (scope user) or shared with the workspace.
 */
@Injectable()
export class AgentsDefinitionsService {
  private readonly logger = new Logger(AgentsDefinitionsService.name);
  private readonly builtins = new Map<string, AgentDefinitionResponseDto>();

  constructor(
    @InjectRepository(AgentDefinition)
    private readonly repo: Repository<AgentDefinition>,
  ) {
    this.loadBuiltins(path.join(__dirname, BUILTIN_DIR));
  }

  /** Built-in agents, the workspace's shared agents and the user's own. */
  async list(
    workspaceId: string,
    userId: string,
  ): Promise<AgentDefinitionResponseDto[]> {
    const rows = await this.repo.find({
      where: [
        { workspaceId, scope: AgentDefinitionScope.WORKSPACE },
        { workspaceId, scope: AgentDefinitionScope.USER, createdBy: userId },
      ],
      order: { createdAt: 'ASC' },
    });
    return [
      ...this.builtins.values(),
      ...rows.map((row) => this.toResponse(row, userId)),
    ];
  }

  /** Agents the main agent can delegate to: every mode except primary. */
  async listSubagents(
    workspaceId: string,
    userId: string,
  ): Promise<AgentDefinitionResponseDto[]> {
    const all = await this.list(workspaceId, userId);
    return all.filter((d) => d.mode !== AgentDefinitionMode.PRIMARY);
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateAgentDefinitionDto,
  ): Promise<AgentDefinitionResponseDto> {
    await this.assertNameAvailable(workspaceId, userId, dto.name, dto.scope);
    const row = this.repo.create({
      workspaceId,
      createdBy: userId,
      scope: dto.scope,
      name: dto.name,
      title: dto.title?.trim() || null,
      description: dto.description ?? '',
      mode: dto.mode,
      systemPrompt: dto.systemPrompt ?? '',
      metadata: this.cleanMetadata(dto.metadata),
    });
    return this.toResponse(await this.saveUnique(row), userId);
  }

  async update(
    workspaceId: string,
    userId: string,
    id: string,
    dto: UpdateAgentDefinitionDto,
  ): Promise<AgentDefinitionResponseDto> {
    const row = await this.findOwn(workspaceId, userId, id);
    const name = dto.name ?? row.name;
    const scope = dto.scope ?? row.scope;
    if (name !== row.name || scope !== row.scope) {
      await this.assertNameAvailable(workspaceId, userId, name, scope, row.id);
    }
    row.name = name;
    row.scope = scope;
    if (dto.title !== undefined) row.title = dto.title?.trim() || null;
    if (dto.description !== undefined) row.description = dto.description;
    if (dto.mode !== undefined) row.mode = dto.mode;
    if (dto.systemPrompt !== undefined) row.systemPrompt = dto.systemPrompt;
    if (dto.metadata !== undefined) {
      row.metadata = this.cleanMetadata(dto.metadata);
    }
    return this.toResponse(await this.saveUnique(row), userId);
  }

  async delete(workspaceId: string, userId: string, id: string): Promise<void> {
    const row = await this.findOwn(workspaceId, userId, id);
    await this.repo.remove(row);
  }

  /**
   * Keeps `@name` unambiguous for everyone who can see the agent: a built-in
   * name is reserved, a personal agent may not shadow a workspace agent, and a
   * workspace agent may not shadow anyone's personal agent.
   */
  private async assertNameAvailable(
    workspaceId: string,
    userId: string,
    name: string,
    scope: AgentDefinitionScope,
    excludeId?: string,
  ): Promise<void> {
    if (this.builtins.has(name)) {
      throw new ConflictException(`"@${name}" is a built-in agent`);
    }
    const base: FindOptionsWhere<AgentDefinition> = {
      workspaceId,
      name,
      ...(excludeId ? { id: Not(excludeId) } : {}),
    };
    const where: FindOptionsWhere<AgentDefinition>[] =
      scope === AgentDefinitionScope.WORKSPACE
        ? [base]
        : [
            { ...base, scope: AgentDefinitionScope.WORKSPACE },
            { ...base, createdBy: userId },
          ];
    if (await this.repo.exists({ where })) {
      throw new ConflictException(`Agent "@${name}" already exists`);
    }
  }

  /** Lost race against the unique indexes still answers 409. */
  private async saveUnique(row: AgentDefinition): Promise<AgentDefinition> {
    try {
      return await this.repo.save(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Agent "@${row.name}" already exists`);
      }
      throw error;
    }
  }

  /** Only the creator may change or delete a custom agent. */
  private async findOwn(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<AgentDefinition> {
    const row = id.startsWith('builtin-')
      ? null
      : await this.repo.findOne({ where: { id, workspaceId, createdBy: userId } });
    if (!row) throw new NotFoundException('Agent not found');
    return row;
  }

  /** Drops unset keys so jsonb holds only real overrides. */
  private cleanMetadata(
    metadata: AgentDefinitionMetadataDto | undefined,
  ): AgentDefinitionMetadata {
    if (!metadata) return {};
    return Object.fromEntries(
      Object.entries(metadata).filter(([, v]) => v !== undefined && v !== null),
    );
  }

  private toResponse(
    row: AgentDefinition,
    userId: string,
  ): AgentDefinitionResponseDto {
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      description: row.description,
      mode: row.mode,
      scope: row.scope,
      isBuiltin: false,
      canEdit: row.createdBy === userId,
      systemPrompt: row.systemPrompt,
      metadata: row.metadata ?? {},
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private loadBuiltins(dir: string): void {
    if (!fs.existsSync(dir)) {
      this.logger.warn(`Built-in agents directory not found: ${dir}`);
      return;
    }
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.md')) continue;
      try {
        const def = parseBuiltinAgentFile(
          fs.readFileSync(path.join(dir, file), 'utf-8'),
        );
        if (!def) {
          this.logger.warn(`Invalid built-in agent file: ${file}`);
        } else if (!this.builtins.has(def.name)) {
          this.builtins.set(def.name, def);
        }
      } catch (error) {
        this.logger.error(`Failed to load built-in agent ${file}`, error);
      }
    }
    this.logger.log(`Loaded ${this.builtins.size} built-in agent(s)`);
  }
}
