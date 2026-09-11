import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { Repository } from 'typeorm';
import { Workflow } from './entities/workflow.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';

@Injectable()
export class WorkflowTemplateService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowTemplateService.name);
  private readonly templatesPath = path.join(__dirname, 'templates');

  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
  ) {}

  async onModuleInit() {
    try {
      const workspaces = await this.workspaceRepository.find();

      for (const workspace of workspaces) {
        await this.createDefaultWorkflows(workspace.id);
      }
    } catch (error) {
      this.logger.error('Error initializing workflows:', error);
    }
  }

  /**
   * Create or update default workflows for a specific workspace
   * @param workspaceId ID of the workspace
   */
  public async createDefaultWorkflows(workspaceId: string) {
    try {
      const yamlFiles = await this.listTemplates();

      for (const fileName of yamlFiles) {
        try {
          const filePath = path.join(this.templatesPath, fileName);
          const fileContent = await fs.promises.readFile(filePath, 'utf8');
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          const parsed = yaml.load(fileContent) as Record<string, unknown>;

          const newContent = this.normalizeOn(parsed);

          const baseName = fileName.replace(/\.(yaml|yml)$/, '');
          const normalizedName = baseName
            .replace(/[-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const workflowName =
            normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1);

          // Check current workflow for this workspace
          const existing = await this.workflowRepository.findOne({
            where: {
              filePath: fileName,
              workspace: { id: workspaceId },
            },
          });

          if (!existing) {
            // Insert new workflow for this workspace
            await this.workflowRepository.insert({
              name: workflowName,
              content: newContent,
              filePath: fileName,
              workspace: { id: workspaceId },
              isCanDelete: false,
              isCanEdit: false,
            });
          } else if (
            this.hasContentChanged(newContent, existing.content as unknown as Record<string, unknown>) ||
            existing.name !== workflowName
          ) {
            await this.workflowRepository.update(
              { id: existing.id },
              { content: newContent, name: workflowName },
            );
          }
        } catch (error) {
          this.logger.error(
            `Error processing workflow ${fileName} for workspace ${workspaceId}: ${(error as Error).message}`,
            (error as Error).stack,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error creating default workflows for workspace ${workspaceId}:`,
        error,
      );
    }
  }

  /**
   * Get a template by name
   * @param name Name of the template
   * @returns Workflow object containing the template
   * @throws Error if template is not found
   */
  public async getTemplate(name: string): Promise<Workflow> {
    const template = await this.workflowRepository.findOne({
      where: { name },
    });

    if (!template) {
      throw new Error(`Template ${name} not found`);
    }

    return template;
  }

  /**
   * List all YAML template files in the templates directory
   * @returns Array of YAML file names
   */
  public async listTemplates(): Promise<string[]> {
    try {
      const files = await fs.promises.readdir(this.templatesPath);
      return files.filter(
        (file) => file.endsWith('.yaml') || file.endsWith('.yml'),
      );
    } catch {
      return [];
    }
  }

  /**
   * Parse a YAML file to object
   * @param fileName Name of the YAML file
   * @returns Parsed YAML object
   */
  public async parseTemplate(fileName: string): Promise<unknown> {
    const filePath = path.join(this.templatesPath, fileName);

    try {
      const fileContent = await fs.promises.readFile(filePath, 'utf8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const parsed = yaml.load(fileContent);
      return parsed as unknown;
    } catch {
      throw new Error(`Template file ${fileName} not found`);
    }
  }

  /**
   * Normalize the on property of the workflow
   * @param obj Workflow object
   * @returns Normalized workflow object
   */

  private hasContentChanged(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
  ): boolean {
    if (a.name !== b.name) return true;
    const aJobs = a.jobs as unknown[] | undefined;
    const bJobs = b.jobs as unknown[] | undefined;
    if ((aJobs?.length ?? 0) !== (bJobs?.length ?? 0)) return true;
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  private normalizeOn(obj: Record<string, unknown>): Record<string, unknown> {
    if (!obj.on) return obj;

    for (const key of Object.keys(obj.on)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const value = obj.on[key];
      if (Array.isArray(value)) {
        obj.on[key] = value.map(String);
      } else if (typeof value === 'string') {
        obj.on[key] = [value];
      } else {
        throw new Error(
          `Invalid type for on.${key}, must be string or array of string`,
        );
      }
    }
    return obj;
  }
}
