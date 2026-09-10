import { GetManyBaseResponseDto } from '@/common/dtos/get-many-base.dto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow } from './entities/workflow.entity';
import { User } from '../auth/entities/user.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { GetManyWorkflowsQueryDto } from './dto/get-many-workflows.dto';

const ALLOWED_WORKFLOW_SORT_FIELDS = ['createdAt', 'updatedAt', 'name'] as const;

@Injectable()
export class WorkflowsService {
  constructor(
    @InjectRepository(Workflow)
    public workflowRepository: Repository<Workflow>,
  ) {}

  private readonly logger = new Logger(WorkflowsService.name);

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
    workflow.filePath =
      filePath || `${name.toLowerCase().replace(/\s+/g, '-')}.yaml`;
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
  async getWorkspaceWorkflow(
    id: string,
    workspace: { id: string },
  ): Promise<Workflow> {
    const workflow = await this.workflowRepository.findOne({
      where: {
        id,
        workspace: { id: workspace.id },
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
  async updateWorkflow(
    id: string,
    updateData: Partial<CreateWorkflowDto>,
    workspace: { id: string },
  ): Promise<Workflow> {
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
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'ASC',
      name,
    } = query;

    const queryBuilder = this.workflowRepository
      .createQueryBuilder('workflow')
      .leftJoinAndSelect('workflow.createdBy', 'createdBy')
      .leftJoinAndSelect('workflow.workspace', 'workspace')
      .where('workflow.workspaceId = :workspaceId', { workspaceId });

    // Apply filters
    if (name) {
      queryBuilder.andWhere('workflow.name LIKE :name', { name: `%${name}%` });
    }

    // Apply sorting with whitelist to prevent SQL injection
    const safeSortBy = (ALLOWED_WORKFLOW_SORT_FIELDS as readonly string[]).includes(sortBy)
      ? sortBy
      : 'createdAt';
    queryBuilder.orderBy(`workflow.${safeSortBy}`, sortOrder);

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
}
