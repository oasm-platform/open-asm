import { Body, Controller, Post } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { WorkspaceId } from 'src/common/decorators/workspace-id.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { Template } from './entities/templates.entity';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { UserContext } from 'src/common/decorators/app.decorator';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templateService: TemplatesService) {}

  @Doc({
    summary: 'Create a new templates',
    description: 'Create a new template with file stored in the storage',
    response: { serialization: Template },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post()
  createTemplate(
    @WorkspaceId() workspaceId: string,
    @UserContext() userContext: UserContextPayload,
    @Body() template: Template,
  ) {
    return this.templateService.createTemplate(
      workspaceId,
      userContext,
      template,
    );
  }
}
