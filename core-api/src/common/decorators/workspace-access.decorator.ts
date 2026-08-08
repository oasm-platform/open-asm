import { UseGuards, applyDecorators } from '@nestjs/common';
import { WorkspacePermissionGuard } from '@/common/guards/workspace-permission.guard';
import { WorkspacePermissions } from './workspace-permissions.decorator';

/**
 * Guards a workspace-scoped handler: resolves the workspace from the route
 * `:id` param or the X-Workspace-Id header/cookie, loads the member's
 * permission keys, and allows the request only when every listed permission
 * is held (or the member holds the "*" wildcard). An empty argument list
 * allows any authenticated workspace member.
 *
 * @example
 * @WorkspaceAccess('workflow.read', 'workflow.write')
 */
export const WorkspaceAccess = (...permissions: string[]) =>
  applyDecorators(
    UseGuards(WorkspacePermissionGuard),
    WorkspacePermissions(permissions),
  );
