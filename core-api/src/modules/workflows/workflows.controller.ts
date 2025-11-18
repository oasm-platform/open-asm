import { Doc } from '@/common/doc/doc.decorator';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserContext, WorkspaceId } from '../../common/decorators/app.decorator';
import { UserContextPayload } from '../../common/interfaces/app.interface';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
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
}