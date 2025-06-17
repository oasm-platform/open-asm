import { Controller, Post } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { ApiTags } from '@nestjs/swagger';
import { UserContext } from 'src/common/decorators/app.decorator';

@ApiTags('Workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  public createWorkspace(@UserContext() user: any) {
    console.log('user', user);
    return user;
  }
}
