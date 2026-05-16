import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { tool } from 'ai';
import { z } from 'zod';
import { AgentSkill } from './entities/agent-skill.entity';
import { SkillStatus } from './enums/agent.enums';

@Injectable()
export class AgentsSkillsService {
  private readonly logger = new Logger(AgentsSkillsService.name);

  constructor(
    @InjectRepository(AgentSkill)
    private readonly skillRepository: Repository<AgentSkill>,
  ) {}

  /**
   * Builds a skills discovery prompt with only title + one-line summary.
   * Full description stays out of context until loadSkill is called.
   */
  async buildSkillsPrompt(workspaceId: string): Promise<string> {
    const skills = await this.skillRepository.find({
      where: { workspaceId, status: SkillStatus.ACTIVE },
      select: ['title', 'description'],
      order: { updatedAt: 'DESC' },
    });

    if (skills.length === 0) return '';

    const list = skills
      .map((s) => {
        const summary =
          s.description
            .split('\n')
            .find((l) => l.trim() && !l.startsWith('#'))
            ?.trim()
            .slice(0, 120) ?? s.title;
        return `- ${s.title}: ${summary}`;
      })
      .join('\n');

    return `## Skills

Use the \`loadSkill\` tool to load a skill when the user's request would benefit from specialized instructions.

Available skills:
${list}`;
  }

  /**
   * Returns the loadSkill tool scoped to the given workspace.
   * The LLM calls this when it decides a skill's full content is needed.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTools(workspaceId: string): Record<string, any> {
    const skillRepository = this.skillRepository;
    const logger = this.logger;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loadSkillConfig: any = {
      description:
        "Load a skill's full instructions into context. Call this when the user's request matches a skill's purpose.",
      parameters: z.object({
        title: z.string().describe('The exact skill title to load'),
      }),
      execute: async ({ title }: { title: string }) => {
        try {
          const skill = await skillRepository.findOne({
            where: { workspaceId, title },
          });

          if (!skill) {
            const available = await skillRepository.find({
              where: { workspaceId },
              select: ['title'],
            });
            return {
              error: `Skill '${title}' not found`,
              availableSkills: available.map((s) => s.title),
            };
          }

          return {
            title: skill.title,
            content: skill.description,
          };
        } catch (e) {
          logger.error(`Failed to load skill ${title}:`, e);
          return { error: `Failed to load skill '${title}'` };
        }
      },
    };

    return { loadSkill: tool(loadSkillConfig) };
  }
}
