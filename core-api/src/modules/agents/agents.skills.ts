import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { tool } from 'ai';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { z } from 'zod';

import type { UserContextPayload } from '@/common/interfaces/app.interface';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import type { SkillResponseDto } from './dto/skill.dto';
import { CreateSkillDto, UpdateSkillDto } from './dto/skill.dto';
import { AgentSkill } from './entities/agent-skill.entity';

interface BuiltinSkill {
  name: string;
  description: string;
  content: string;
}

interface LoadSkillResult {
  name: string;
  description: string;
  content: string;
  skillDirectory?: string;
}

@Injectable()
export class AgentsSkillsService {
  private readonly logger = new Logger(AgentsSkillsService.name);
  private readonly builtinSkills = new Map<string, BuiltinSkill>();
  private static readonly SKILLS_DIR = 'skills';
  private static readonly SKILL_FILE = 'SKILL.md';
  private loaded = false;

  constructor(
    @InjectRepository(AgentSkill)
    private readonly skillRepository: Repository<AgentSkill>,
    private readonly workspacesService: WorkspacesService,
  ) {
    this.discoverBuiltinSkills();
  }

  private discoverBuiltinSkills(): void {
    const skillsDir = path.join(__dirname, AgentsSkillsService.SKILLS_DIR);
    try {
      if (!fs.existsSync(skillsDir)) {
        this.logger.warn(`Builtin skills directory not found: ${skillsDir}`);
        this.loaded = true;
        return;
      }

      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillDir = path.join(skillsDir, entry.name);
        const skillFile = path.join(skillDir, AgentsSkillsService.SKILL_FILE);

        try {
          if (!fs.existsSync(skillFile)) continue;

          const content = fs.readFileSync(skillFile, 'utf-8');
          const parsed = this.parseSkillFile(content, skillDir);
          if (parsed) {
            this.builtinSkills.set(parsed.name, parsed);
            this.logger.log(`Discovered builtin skill: ${parsed.name}`);
          }
        } catch (error) {
          this.logger.error(
            `Failed to load builtin skill from ${skillFile}`,
            error,
          );
        }
      }
      this.loaded = true;
    } catch (error) {
      this.logger.error('Failed to discover builtin skills', error);
    }
  }

  private parseSkillFile(
    content: string,
    skillDir: string,
  ): BuiltinSkill | null {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match?.[1]) {
      this.logger.warn(`No frontmatter found in SKILL.md at ${skillDir}`);
      return null;
    }

    const frontmatter = match[1];
    const nameMatch = frontmatter.match(/name:\s*(.+)/);
    const descMatch = frontmatter.match(/description:\s*(.+)/);

    const name = nameMatch?.[1]?.trim();
    const description = descMatch?.[1]?.trim();
    const body = content.slice(match[0].length).trim();

    if (!name || !description) {
      this.logger.warn(
        `Invalid frontmatter in SKILL.md at ${skillDir}: missing name or description`,
      );
      return null;
    }

    return { name, description, content: body };
  }

  async getSkills(workspaceId: string): Promise<SkillResponseDto[]> {
    if (!this.loaded) {
      this.discoverBuiltinSkills();
    }

    const userSkills = await this.skillRepository.find({
      where: { workspaceId },
    });

    const builtinList: SkillResponseDto[] = Array.from(
      this.builtinSkills.values(),
    ).map((s) => ({
      id: `builtin-${s.name}`,
      name: s.name,
      description: s.description,
      content: s.content,
      isEnabled: true,
      isBuiltin: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }));

    const userList: SkillResponseDto[] = userSkills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      content: s.content,
      isEnabled: s.isEnabled,
      isBuiltin: false,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      createdBy: s.createdBy,
    }));

    return [...builtinList, ...userList];
  }

  private async getSkillByName(
    workspaceId: string,
    name: string,
  ): Promise<LoadSkillResult | null> {
    if (!this.loaded) {
      this.discoverBuiltinSkills();
    }

    const builtin = this.builtinSkills.get(name);
    if (builtin) {
      return { ...builtin };
    }

    const userSkill = await this.skillRepository.findOne({
      where: { workspaceId, name, isEnabled: true },
    });
    if (userSkill) {
      return {
        name: userSkill.name,
        description: userSkill.description,
        content: userSkill.content,
      };
    }

    return null;
  }

  createLoadSkillTool(workspaceId: string) {
    const toolConfig = {
      description:
        "Load a skill to get specialized instructions. Call this when the user's request matches a skill description and you need detailed guidance.",
      parameters: z.object({
        name: z.string().describe('The skill name to load'),
      }),
      execute: async ({ name }: { name: string }) => {
        const skill = await this.getSkillByName(workspaceId, name);
        if (!skill) {
          return { error: `Skill '${name}' not found or is disabled` };
        }
        return {
          name: skill.name,
          description: skill.description,
          content: skill.content,
        };
      },
    };
    return tool(toolConfig as unknown as Parameters<typeof tool>[0]);
  }

  async buildSkillsPrompt(workspaceId: string): Promise<string> {
    if (!this.loaded) {
      this.discoverBuiltinSkills();
    }

    const userSkills = await this.skillRepository.find({
      where: { workspaceId, isEnabled: true },
    });

    const totalSkills = this.builtinSkills.size + userSkills.length;
    if (totalSkills === 0) return '';

    const promptLines: string[] = [];

    promptLines.push('## Available Skills');
    promptLines.push('');
    promptLines.push(
      "Use the `load_skill` tool to load a skill when the user's request would benefit from specialized instructions.",
    );
    promptLines.push('');

    if (this.builtinSkills.size > 0) {
      for (const [name, skill] of this.builtinSkills) {
        promptLines.push(`- ${name}: ${skill.description}`);
      }
    }

    if (userSkills.length > 0) {
      for (const skill of userSkills) {
        promptLines.push(`- ${skill.name}: ${skill.description}`);
      }
    }

    return promptLines.join('\n');
  }

  async createUserSkill(
    workspaceId: string,
    userId: string,
    dto: CreateSkillDto,
  ): Promise<SkillResponseDto> {
    await this.workspacesService.getWorkspaceByIdAndOwner(
      workspaceId,
      { id: userId } as UserContextPayload,
    );

    const existing = await this.skillRepository.findOne({
      where: { workspaceId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Skill with name "${dto.name}" already exists in this workspace`,
      );
    }

    const skill = this.skillRepository.create({
      workspaceId,
      createdBy: userId,
      name: dto.name,
      description: dto.description,
      content: dto.content,
      isEnabled: true,
    });

    const saved = await this.skillRepository.save(skill);

    return {
      id: saved.id,
      name: saved.name,
      description: saved.description,
      content: saved.content,
      isEnabled: saved.isEnabled,
      isBuiltin: false,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      createdBy: saved.createdBy,
    };
  }

  async updateUserSkill(
    workspaceId: string,
    skillId: string,
    dto: UpdateSkillDto,
    userId: string,
  ): Promise<SkillResponseDto> {
    await this.workspacesService.getWorkspaceByIdAndOwner(
      workspaceId,
      { id: userId } as UserContextPayload,
    );

    const skill = await this.skillRepository.findOne({
      where: { id: skillId, workspaceId },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    if (dto.name !== undefined && dto.name !== skill.name) {
      const existing = await this.skillRepository.findOne({
        where: { workspaceId, name: dto.name },
      });
      if (existing) {
        throw new ConflictException(
          `Skill with name "${dto.name}" already exists in this workspace`,
        );
      }
      skill.name = dto.name;
    }
    if (dto.description !== undefined) skill.description = dto.description;
    if (dto.content !== undefined) skill.content = dto.content;

    const saved = await this.skillRepository.save(skill);

    return {
      id: saved.id,
      name: saved.name,
      description: saved.description,
      content: saved.content,
      isEnabled: saved.isEnabled,
      isBuiltin: false,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      createdBy: saved.createdBy,
    };
  }

  async deleteUserSkill(
    workspaceId: string,
    skillId: string,
    userId: string,
  ): Promise<void> {
    await this.workspacesService.getWorkspaceByIdAndOwner(
      workspaceId,
      { id: userId } as UserContextPayload,
    );

    const skill = await this.skillRepository.findOne({
      where: { id: skillId, workspaceId },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    await this.skillRepository.remove(skill);
  }

  async toggleUserSkill(
    workspaceId: string,
    skillId: string,
    isEnabled: boolean,
    userId: string,
  ): Promise<SkillResponseDto> {
    await this.workspacesService.getWorkspaceByIdAndOwner(
      workspaceId,
      { id: userId } as UserContextPayload,
    );

    const skill = await this.skillRepository.findOne({
      where: { id: skillId, workspaceId },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    skill.isEnabled = isEnabled;
    const saved = await this.skillRepository.save(skill);

    return {
      id: saved.id,
      name: saved.name,
      description: saved.description,
      content: saved.content,
      isEnabled: saved.isEnabled,
      isBuiltin: false,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      createdBy: saved.createdBy,
    };
  }
}
