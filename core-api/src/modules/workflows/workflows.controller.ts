import { Doc } from '@/common/doc/doc.decorator';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
}