import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { Repository } from 'typeorm';
import { Workflow } from './entities/workflow.entity';

@Injectable()
export class WorkflowsService implements OnModuleInit {
  constructor(
    @InjectRepository(Workflow)
    private workflowRepository: Repository<Workflow>,
  ) {}

  private readonly logger = new Logger(WorkflowsService.name);
  private readonly templatesPath = path.join(__dirname, 'templates');

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
  public listTemplates(): string[] {
    if (!fs.existsSync(this.templatesPath)) {
      return [];
    }

    const files = fs.readdirSync(this.templatesPath);

    const yamlFiles = files.filter((file) => file.endsWith('.yaml'));

    return yamlFiles;
  }

  /**
   * Normalize the on property of the workflow
   * @param obj Workflow object
   * @returns Normalized workflow object
   */

  private normalizeOn(obj: Record<string, any>): Record<string, any> {
    if (!obj.on) return obj;

    for (const key of Object.keys(obj.on)) {
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

  async onModuleInit() {
    try {
      const yamlFiles = this.listTemplates();

      for (const fileName of yamlFiles) {
        try {
          const filePath = path.join(this.templatesPath, fileName);
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const parsed = yaml.load(fileContent) as Record<string, any>;

          const normalized = this.normalizeOn(parsed);

          await this.workflowRepository.upsert(
            {
              name: fileName,
              content: normalized,
              filePath: fileName,
            },
            ['filePath'],
          );

          this.logger.log(`Successfully processed workflow: ${fileName}`);
        } catch (error) {
          this.logger.error(
            `Error processing workflow ${fileName}: ${error.message}`,
            error.stack,
          );
        }
      }
    } catch (error) {
      this.logger.error('Error initializing workflows:', error);
    }
  }

  /**
   * Parse a YAML file to object
   * @param fileName Name of the YAML file
   * @returns Parsed YAML object
   */
  public parseTemplate(fileName: string): any {
    const filePath = path.join(this.templatesPath, fileName);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Template file ${fileName} not found`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(fileContent);
    return parsed as any;
  }
}
