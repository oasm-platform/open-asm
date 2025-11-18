import { Doc } from '@/common/doc/doc.decorator';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserContext, WorkspaceId } from '../../common/decorators/app.decorator';
import { WorkspaceOwnerGuard } from '../../common/guards/workspace-owner.guard';
import { UserContextPayload } from '../../common/interfaces/app.interface';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { Workflow } from './entities/workflow.entity';
import { WorkflowsService } from './workflows.service';

@ApiTags('workflows')
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) { }

  @Doc({
    summary: 'Get all workflow templates',
    description: 'Retrieves a list of all available workflow templates in YAML format.',
    response: {
      serialization: GetManyResponseDto(String),
      description: 'List of workflow template filenames',
    },
  })
  @Get('templates')
  listTemplates() {
    return this.workflowsService.listTemplates();
  }

  @Doc({
    summary: 'Create workflow',
    description: 'Creates a new workflow with the provided data.',
    response: {
      serialization: Workflow,
      description: 'Created workflow object',
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @UseGuards(WorkspaceOwnerGuard)
  @Post()
  async createWorkflow(
    @Body() createWorkflowDto: CreateWorkflowDto,
    @UserContext() userContextPayload: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.workflowsService.createWorkflow(
      createWorkflowDto,
      { id: userContextPayload.userId },
      { id: workspaceId },
    );
  }

  @Doc({
    summary: 'Get workflow by ID',
    description: 'Retrieves a specific workflow by its ID within the specified workspace.',
    response: {
      serialization: Workflow,
      description: 'Workflow object',
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @UseGuards(WorkspaceOwnerGuard)
  @Get(':id')
  async getWorkspaceWorkflow(
    @Param('id') id: string,
    @UserContext() userContextPayload: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.workflowsService.getWorkspaceWorkflow(id, { id: workspaceId });
  }

  @Doc({
    summary: 'Update workflow',
    description: 'Updates an existing workflow with the provided data.',
    response: {
      serialization: Workflow,
      description: 'Updated workflow object',
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @UseGuards(WorkspaceOwnerGuard)
  @Patch(':id')
  async updateWorkflow(
    @Param('id') id: string,
    @Body() updateWorkflowDto: UpdateWorkflowDto,
    @UserContext() userContextPayload: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.workflowsService.updateWorkflow(id, updateWorkflowDto, { id: workspaceId });
  }

  @Doc({
    summary: 'Delete workflow',
    description: 'Deletes a workflow by its ID.',
    response: {
      description: 'Workflow deleted successfully',
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @UseGuards(WorkspaceOwnerGuard)
  @Delete(':id')
  async deleteWorkflow(
    @Param('id') id: string,
    @UserContext() userContextPayload: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    await this.workflowsService.deleteWorkflow(id, { id: workspaceId });
    return { message: 'Workflow deleted successfully' };
  }
}
