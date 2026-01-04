import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { GetManyWorkflowsQueryDto } from './dto/get-many-workflows.dto';
import { Workflow } from './entities/workflow.entity';

@Injectable()
export class WorkflowsService implements OnModuleInit {
  constructor(
    @InjectRepository(Workflow)
    private workflowRepository: Repository<Workflow>,
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
  ) { }

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

    const yamlFiles = files.filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'));

    return yamlFiles;
  }

  /**
   * Normalize the on property of the workflow
   * @param obj Workflow object
   * @returns Normalized workflow object
   */

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
      const yamlFiles = this.listTemplates();

      for (const fileName of yamlFiles) {
        try {
          const filePath = path.join(this.templatesPath, fileName);
          const fileContent = fs.readFileSync(filePath, 'utf8');
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          const parsed = yaml.load(fileContent) as Record<string, unknown>;

          const newContent = this.normalizeOn(parsed);

          const baseName = fileName.replace(/\.(yaml|yml)$/, '');
          const normalizedName = baseName
            .replace(/[-_]/g, ' ')
            .split(' ')
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          const workflowName = `[Default] ${normalizedName}`;

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
              workspace: { id: workspaceId } as Workspace,
              isCanDelete: false,
              isCanEdit: false,
            });
            this.logger.log(
              `Inserted new workflow: ${workflowName} for workspace: ${workspaceId}`,
            );
          } else if (
            JSON.stringify(newContent) !== JSON.stringify(existing.content) ||
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
   * Parse a YAML file to object
   * @param fileName Name of the YAML file
   * @returns Parsed YAML object
   */
  public parseTemplate(fileName: string): unknown {
    const filePath = path.join(this.templatesPath, fileName);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Template file ${fileName} not found`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const parsed = yaml.load(fileContent);
    return parsed as unknown;
  }

  /**
   * Creates a new workflow in the specified workspace
   * @param createWorkflowDto The data transfer object containing workflow details
   * @param createdBy The user creating the workflow
   * @param workspace The workspace where the workflow will be created
   * @returns The created Workflow entity
   */
  async createWorkflow(
    createWorkflowDto: CreateWorkflowDto,
    createdBy: { id: string },
    workspace: { id: string },
  ): Promise<Workflow> {
    const { name, content, filePath } = createWorkflowDto;

    const workflow = new Workflow();
    workflow.name = name;
    workflow.content = content;
    workflow.filePath = filePath || `${name.toLowerCase().replace(/\s+/g, '-')}.yaml`;
    workflow.createdBy = { id: createdBy.id } as User;
    workflow.workspace = { id: workspace.id } as Workspace;

    return await this.workflowRepository.save(workflow);
  }

  /**
   * Retrieves a specific workflow by its ID within a workspace
   * @param id The ID of the workflow to retrieve
   * @param workspace The workspace containing the workflow
   * @returns The Workflow entity if found
   * @throws Error if workflow is not found in the workspace
   */
  async getWorkspaceWorkflow(id: string, workspace: { id: string }): Promise<Workflow> {
    const workflow = await this.workflowRepository.findOne({
      where: {
        id, workspace: { id: workspace.id },
      },
      relations: ['createdBy', 'workspace'],
    });

    if (!workflow) {
      throw new Error('Workflow not found in this workspace');
    }

    return workflow;
  }

  /**
   * Updates an existing workflow with new data
   * @param id The ID of the workflow to update
   * @param updateData The partial data to update
   * @param workspace The workspace containing the workflow
   * @returns The updated Workflow entity
   * @throws Error if workflow is not found in the workspace
   */
  async updateWorkflow(id: string, updateData: Partial<CreateWorkflowDto>, workspace: { id: string }): Promise<Workflow> {
    const workflow = await this.getWorkspaceWorkflow(id, workspace);

    if (updateData.name) workflow.name = updateData.name;
    if (updateData.content) workflow.content = updateData.content;
    if (updateData.filePath) workflow.filePath = updateData.filePath;

    return await this.workflowRepository.save(workflow);
  }

  /**
   * Deletes a workflow by its ID from the specified workspace
   * @param id The ID of the workflow to delete
   * @param workspace The workspace containing the workflow
   * @throws Error if workflow is not found in the workspace
   */
  async deleteWorkflow(id: string, workspace: { id: string }): Promise<void> {
    const workflow = await this.getWorkspaceWorkflow(id, workspace);
    await this.workflowRepository.remove(workflow);
  }

  /**
   * Retrieves many workflows with pagination and filtering
   * @param query Query parameters for pagination, sorting, and filtering
   * @param workspaceId The workspace ID to filter workflows
   * @returns Paginated response with workflows data
   */
  async getManyWorkflows(
    query: GetManyWorkflowsQueryDto,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<Workflow>> {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'ASC', name } = query;

    const queryBuilder = this.workflowRepository
      .createQueryBuilder('workflow')
      .leftJoinAndSelect('workflow.createdBy', 'createdBy')
      .leftJoinAndSelect('workflow.workspace', 'workspace')
      .where('workflow.workspaceId = :workspaceId', { workspaceId });

    // Apply filters
    if (name) {
      queryBuilder.andWhere('workflow.name LIKE :name', { name: `%${name}%` });
    }

    // Apply sorting
    queryBuilder.orderBy(`workflow.${sortBy}`, sortOrder);

    // Apply pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Execute query
    const [data, total] = await queryBuilder.getManyAndCount();

    const pageCount = Math.ceil(total / limit);
    const hasNextPage = page < pageCount;

    return {
      data,
      total,
      page,
      limit,
      pageCount,
      hasNextPage,
    };
  }

  /**
   * Retrieves all workflows within a specific workspace
   * @param workspace The workspace to retrieve workflows from
   * @returns Array of Workflow entities in the workspace
   */
  async getWorkflowsByWorkspace(workspace: { id: string }): Promise<Workflow[]> {
    return await this.workflowRepository.find({
      where: {
        workspace: { id: workspace.id },
      },
      relations: ['createdBy', 'workspace'],
    });
  }
}
