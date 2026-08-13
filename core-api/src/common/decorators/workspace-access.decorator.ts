import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import {
  WORKSPACE_ROUTE_PARAM,
  WorkspacePermissionGuard,
} from '@/common/guards/workspace-permission.guard';
import { WorkspacePermissions } from './workspace-permissions.decorator';

export interface WorkspaceAccessOptions {
  /** Route param holding the workspace id. Takes precedence over the X-Workspace-Id header / wid cookie (used on /workspaces/:id routes where :id IS the target workspace). */
  workspaceParam?: string;
}

/**
 * Guards a workspace-scoped handler: resolves the workspace from the route
 * `:id` param or the X-Workspace-Id header/cookie, loads the member's
 * permission keys, and allows the request only when every listed permission
 * is held (or the member holds the "*" wildcard). An empty argument list
 * allows any authenticated workspace member.
 *
 * When the trailing options object sets `workspaceParam` (e.g. `'id'`), that
 * route param takes precedence over the header/cookie — required on
 * `/workspaces/:id` routes where `:id` IS the target workspace.
 *
 * @example
 * @WorkspaceAccess('workflow.read', 'workflow.write')
 * @WorkspaceAccess('workspace.delete', { workspaceParam: 'id' })
 */
export const WorkspaceAccess = (
  ...args: (string | WorkspaceAccessOptions)[]
) => {
  const hasOptions =
    args.length > 0 && typeof args[args.length - 1] === 'object';
  const options = hasOptions
    ? (args[args.length - 1] as WorkspaceAccessOptions)
    : undefined;
  const permissions = (hasOptions ? args.slice(0, -1) : args) as string[];
  return applyDecorators(
    UseGuards(WorkspacePermissionGuard),
    WorkspacePermissions(permissions),
    ...(options?.workspaceParam
      ? [SetMetadata(WORKSPACE_ROUTE_PARAM, options.workspaceParam)]
      : []),
  );
};
