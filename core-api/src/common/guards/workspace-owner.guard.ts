import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { getWorkspaceIdFromRequest } from '../decorators/workspace-id.decorator';
import {
  RequestWithMetadata,
  UserContextPayload,
} from '../interfaces/app.interface';

/**
 * Guard to check if the authenticated user is the owner of the specified workspace
 * Reads workspaceId from header and userId from session, then verifies ownership
 */
@Injectable()
export class WorkspaceOwnerGuard implements CanActivate {
  constructor(private readonly workspacesService: WorkspacesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithMetadata>();

    // Get userId from session (attached by AuthGuard)
    const userId = request.user?.id;
    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    const workspaceId = getWorkspaceIdFromRequest(request);
    if (!workspaceId) {
      throw new ForbiddenException('Workspace ID not provided in headers');
    }

    try {
      // Check if user is the owner of the workspace
      // Use type assertion to bypass the conflicting interface definitions
      await this.workspacesService.getWorkspaceByIdAndOwner(
        workspaceId,
        request.user as unknown as UserContextPayload,
      );
      return true;
    } catch {
      // If workspace not found or user is not owner, throw ForbiddenException
      throw new ForbiddenException('You are not the owner of this workspace');
    }
  }
}
