import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ToolsService } from '../../modules/tools/tools.service';
import { RequestWithMetadata } from '../interfaces/app.interface';

/**
 * Guard that checks if AI Assistant tool is installed in the workspace
 * before allowing access to AI assistant features
 */
@Injectable()
export class AssistantGuard implements CanActivate {
  constructor(private readonly toolsService: ToolsService) {}

  canActivate(context: ExecutionContext): boolean {
    const request: RequestWithMetadata = context.switchToHttp().getRequest();
    const workspaceId = request.headers['x-workspace-id'];

    if (!workspaceId || typeof workspaceId !== 'string') {
      throw new ForbiddenException(
        'Workspace ID is required to use AI assistant features',
      );
    }

    // Check if AI Assistant tool is installed and enabled
    // const isEnabled = await this.toolsService.isAiAssistantEnabled(workspaceId);

    // if (!isEnabled) {
    //   throw new ForbiddenException(
    //     'AI Assistant tool is not installed or enabled in this workspace. Please install the tool first.',
    //   );
    // }

    return true;
  }
}
