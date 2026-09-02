import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ConnectorRegistryService } from '@/modules/connectors/connector-registry.service';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import { ToolConfigProfile } from './entities/tool-config-profiles.entity';
import { Tool } from './entities/tools.entity';
import {
  decryptProfile,
  encryptProfile,
  getSensitiveFields,
  maskProfile,
} from './validators/tool-config-profiles.crypto';
import { validateProfileOrThrow } from './validators/tool-config-profiles.validator';

@Injectable()
export class ToolConfigProfilesService {
  private readonly logger = new Logger(ToolConfigProfilesService.name);

  constructor(
    @InjectRepository(ToolConfigProfile)
    private readonly profilesRepo: Repository<ToolConfigProfile>,
    @InjectRepository(Tool)
    private readonly toolsRepo: Repository<Tool>,
    private readonly connectorRegistry: ConnectorRegistryService,
    private readonly encryptionService: WorkspaceEncryptionService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Resolves the connector schema for a given tool row.
   * Falls back to inputsSchema when configSchema is absent.
   * Tool.name IS the connector slug (e.g. "nuclei").
   */
  private async resolveConnectorSchema(toolId: string) {
    const tool = await this.toolsRepo.findOne({ where: { id: toolId } });
    if (!tool) {
      throw new BadRequestException(`Tool ${toolId} not found`);
    }
    const entry = this.connectorRegistry.getConnector(tool.name);
    if (!entry) {
      throw new BadRequestException(
        `Unknown tool "${tool.name}" -- cannot validate config`,
      );
    }
    // Fallback: configSchema ?? inputsSchema. A known connector with neither
    // schema needs no config — profile creation stays allowed and validation
    // is skipped (config stored as-is, no sensitive fields to encrypt).
    const schema = entry.configSchema ?? entry.inputsSchema ?? null;
    if (!schema) {
      return {
        tool,
        schema: null,
        sensitiveFields: [],
      };
    }
    return {
      tool,
      schema,
      sensitiveFields: getSensitiveFields(schema),
    };
  }

  /**
   * Encrypts config fields and saves the profile.
   */
  private async encryptAndSave(
    profile: ToolConfigProfile,
    sensitiveFields: string[],
    workspaceId: string,
  ): Promise<ToolConfigProfile> {
    const dek = await this.encryptionService.getDEK(workspaceId);
    const encryptedConfig = encryptProfile(
      profile.config,
      sensitiveFields,
      dek,
    );
    profile.config = encryptedConfig;
    return this.profilesRepo.save(profile);
  }

  /**
   * Masks sensitive fields for API responses.
   */
  private maskConfig(
    profile: ToolConfigProfile,
  ): ToolConfigProfile {
    // Defensive: some callers do not eager-load the tool relation.
    // Without it there is no schema to consult — return unmasked.
    if (!profile.tool) return profile;
    const entry = this.connectorRegistry.getConnector(
      (profile.tool).name,
    );
    if (!entry) return profile;
    // Fallback: configSchema ?? inputsSchema for sensitive field detection
    const schema = entry.configSchema ?? entry.inputsSchema;
    if (!schema) return profile;
    const sensitiveFields = getSensitiveFields(schema);
    if (sensitiveFields.length === 0) return profile;
    const copy = { ...profile, config: maskProfile(profile.config, sensitiveFields) };
    return copy;
  }

  // ── CRUD ─────────────────────────────────────────────────────────────

  async create(
    workspaceId: string,
    toolId: string,
    dto: { name: string; config: Record<string, unknown>; isDefault?: boolean },
  ): Promise<ToolConfigProfile> {
    const { tool, schema, sensitiveFields } =
      await this.resolveConnectorSchema(toolId);

    // Validate config against schema (I3) — skipped for connectors without a
    // config schema (their config is stored as-is, no validation possible).
    if (schema) {
      validateProfileOrThrow(
        this.connectorRegistry,
        tool.name,
        dto.config,
      );
    }

    // Pre-check unique name (I1)
    const existing = await this.profilesRepo.findOne({
      where: {
        workspace: { id: workspaceId },
        tool: { id: toolId },
        name: dto.name,
      },
    });
    if (existing) {
      throw new ConflictException(
        `Profile name "${dto.name}" already exists for this tool`,
      );
    }

    const profile = this.profilesRepo.create({
      workspace: { id: workspaceId },
      tool: { id: toolId },
      name: dto.name,
      config: dto.config,
      isDefault: dto.isDefault ?? false,
    });

    // Encrypt secrets (I4), then persist
    return this.encryptAndSave(profile, sensitiveFields, workspaceId);
  }

  async update(
    workspaceId: string,
    profileId: string,
    dto: {
      name?: string;
      config?: Record<string, unknown>;
      isDefault?: boolean;
    },
  ): Promise<ToolConfigProfile> {
    const profile = await this.findOwned(workspaceId, profileId);

    // Resolve schema via tool's slug
    const toolId = (profile.tool as unknown as { id: string }).id;
    const { tool, schema, sensitiveFields } =
      await this.resolveConnectorSchema(toolId);

    // If name is changing, check uniqueness (I1)
    if (dto.name && dto.name !== profile.name) {
      const dup = await this.profilesRepo.findOne({
        where: {
          workspace: { id: workspaceId },
          tool: { id: toolId },
          name: dto.name,
        },
      });
      if (dup) {
        throw new ConflictException(
          `Profile name "${dto.name}" already exists for this tool`,
        );
      }
      profile.name = dto.name;
    }

    // Validate updated config (I3) — skipped for no-schema connectors
    if (dto.config !== undefined) {
      if (schema) {
        validateProfileOrThrow(this.connectorRegistry, tool.name, dto.config);
      }
      profile.config = dto.config;
    }

    if (dto.isDefault !== undefined) {
      profile.isDefault = dto.isDefault;
    }

    // Re-encrypt (I4) and save
    return this.encryptAndSave(profile, sensitiveFields, workspaceId);
  }

  /**
   * Transactionally switch the default profile (I2).
   * Unsets the previous default, then sets the new one -- single transaction.
   */
  async setDefault(
    workspaceId: string,
    profileId: string,
  ): Promise<ToolConfigProfile> {
    const target = await this.findOwned(workspaceId, profileId);
    const toolId = (target.tool as unknown as { id: string }).id;

    return this.dataSource.transaction(async (manager) => {
      // Find current default for same workspace+tool
      const currentDefault = await manager.findOne(ToolConfigProfile, {
        where: {
          workspace: { id: workspaceId },
          tool: { id: toolId },
          isDefault: true,
        },
      });

      // Unset old default
      if (currentDefault && currentDefault.id !== profileId) {
        currentDefault.isDefault = false;
        await manager.save(currentDefault);
      }

      // Set new default
      target.isDefault = true;
      return manager.save(target);
    });
  }

  async remove(
    workspaceId: string,
    profileId: string,
  ): Promise<void> {
    const profile = await this.findOwned(workspaceId, profileId);
    await this.profilesRepo.remove(profile);
  }

  async list(
    workspaceId: string,
    toolId: string,
  ): Promise<ToolConfigProfile[]> {
    const profiles = await this.profilesRepo.find({
      where: {
        workspace: { id: workspaceId },
        tool: { id: toolId },
      },
      relations: ['tool'],
      order: { createdAt: 'DESC' },
    });

    return profiles.map((p) => this.maskConfig(p));
  }

  async getOne(
    workspaceId: string,
    profileId: string,
  ): Promise<ToolConfigProfile> {
    const profile = await this.findOwned(workspaceId, profileId);
    return this.maskConfig(profile);
  }

  // ── Dispatch helpers ──────────────────────────────────────────────────

  /**
   * Validates that a config profile belongs to the given workspace AND tool.
   * Throws BadRequestException if the profile exists but belongs to a different tool.
   */
  async assertProfileOwnership(
    workspaceId: string,
    profileId: string,
    toolId: string,
  ): Promise<void> {
    const profile = await this.findOwned(workspaceId, profileId);
    const profileToolId = (profile.tool as unknown as { id: string }).id;
    if (profileToolId !== toolId) {
      throw new BadRequestException(
        `Profile ${profileId} does not belong to tool ${toolId}`,
      );
    }
  }

  /**
   * Resolves decrypted config for job dispatch.
   * Priority: explicit profileId → default profile for (workspace, tool) → none.
   * Returns decrypted config or undefined.
   */
  async resolveConfigForDispatch(
    workspaceId: string,
    toolId: string,
    profileId?: string,
  ): Promise<Record<string, unknown> | undefined> {
    let profile: ToolConfigProfile | null = null;

    if (profileId) {
      // Explicit profile — must belong to same workspace AND tool
      profile = await this.profilesRepo.findOne({
        where: { id: profileId },
        relations: ['workspace', 'tool'],
      });
      if (!profile) return undefined;

      const profileWsId = (profile.workspace as unknown as { id: string }).id;
      const profileToolId = (profile.tool as unknown as { id: string }).id;
      if (profileWsId !== workspaceId || profileToolId !== toolId) {
        return undefined;
      }
    } else {
      // Default profile for this workspace + tool
      profile = await this.profilesRepo.findOne({
        where: {
          workspace: { id: workspaceId },
          tool: { id: toolId },
          isDefault: true,
        },
      });
    }

    if (!profile) return undefined;

    // Get tool for schema lookup
    const tool = await this.toolsRepo.findOne({ where: { id: toolId } });
    if (!tool) return undefined;

    const entry = this.connectorRegistry.getConnector(tool.name);
    // Fallback: configSchema ?? inputsSchema
    const schema = entry?.configSchema ?? entry?.inputsSchema;
    if (!schema) return profile.config;

    const sensitiveFields = getSensitiveFields(schema);
    if (sensitiveFields.length === 0) return profile.config;

    const dek = await this.encryptionService.getDEK(workspaceId);
    return decryptProfile(profile.config, sensitiveFields, dek);
  }

  // ── Internals ────────────────────────────────────────────────────────

  private async findOwned(
    workspaceId: string,
    profileId: string,
  ): Promise<ToolConfigProfile> {
    const profile = await this.profilesRepo.findOne({
      where: { id: profileId },
      relations: ['workspace', 'tool'],
    });
    if (!profile) {
      throw new NotFoundException(`Profile ${profileId} not found`);
    }
    const profileWsId = (profile.workspace as unknown as { id: string }).id;
    if (profileWsId !== workspaceId) {
      throw new NotFoundException(`Profile ${profileId} not found`);
    }
    return profile;
  }
}
