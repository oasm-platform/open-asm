import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserContext } from 'src/common/decorators/app.decorator';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { CreateWorkspaceDto } from './dto/workspaces.dto';
import { WorkspacesService } from './workspaces.service';

@ApiTags('Workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  public createWorkspace(
    @Body() dto: CreateWorkspaceDto,
    @UserContext() user: UserContextPayload,
  ) {
    console.log('user', user);
    return user;
  }
}
