import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspacePermissions } from '../decorators/workspace-permissions.decorator';
import { getWorkspaceIdFromRequest } from '../decorators/workspace-id.decorator';
import { RequestWithMetadata } from '../interfaces/app.interface';

/**
 * Metadata key for the per-route override declaring which route param holds the
 * target workspace id. Set via `@WorkspaceAccess(..., { workspaceParam })`.
 */
export const WORKSPACE_ROUTE_PARAM = 'workspaceRouteParam';

/**
 * Guards a handler against members lacking the required workspace permission
 * keys. Required keys are declared with `@WorkspacePermissions(...)`.
 *
 * Resolves the workspace id in this order:
 *  1. an explicit `:workspaceId` route param;
 *  2. the route param named by `WORKSPACE_ROUTE_PARAM` metadata
 *     (`@WorkspaceAccess(..., { workspaceParam: 'id' })`) when configured —
 *     used on `/workspaces/:id` routes where `:id` IS the target workspace;
 *  3. the `X-Workspace-ID` header / `wid` cookie;
 *  4. the generic `:id` route param (feature routes use entity ids in `:id`,
 *     so the header/cookie wins for them unless step 2 is set).
 * A member whose permission groups grant `'*'` passes every check.
 */
@Injectable()
export class WorkspacePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithMetadata>();

    const userId = request.user?.id;
    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    const workspaceParam = this.reflector.getAllAndOverride<string | undefined>(
      WORKSPACE_ROUTE_PARAM,
      [context.getHandler(), context.getClass()],
    );

    const workspaceId =
      (request.params?.workspaceId as string | undefined) ??
      (workspaceParam
        ? (request.params?.[workspaceParam] as string | undefined)
        : undefined) ??
      getWorkspaceIdFromRequest(request) ??
      (request.params?.id as string | undefined);
    if (!workspaceId) {
      throw new ForbiddenException('Workspace ID not provided in headers');
    }

    // Publish the resolved id so downstream interceptors (audit log) can
    // attribute the request to the workspace without re-resolving it.
    request.workspaceId = workspaceId;

    let permissionKeys: string[];
    try {
      const resolved = await this.workspacesService.getMembershipWithPermissions(
        workspaceId,
        userId,
      );
      permissionKeys = resolved.permissionKeys;
      request.membership = resolved.membership;
    } catch (error) {
      // Non-members get 403, never revealing whether the workspace exists
      if (error instanceof NotFoundException) {
        throw new ForbiddenException(
          'You do not have permission to perform this action',
        );
      }
      throw error;
    }

    request.permissions = permissionKeys;

    const required = this.reflector.getAllAndOverride(
      WorkspacePermissions,
      [context.getHandler(), context.getClass()],
    );

    if (required && required.length > 0) {
      const hasWildcard = permissionKeys.includes('*');
      const hasAll = required.every((key) => {
        if (permissionKeys.includes(key)) return true;
        // {domain}.write implies {domain}.read
        if (key.endsWith('.read')) {
          const writeKey = `${key.slice(0, -'.read'.length)}.write`;
          return permissionKeys.includes(writeKey);
        }
        return false;
      });
      if (!hasWildcard && !hasAll) {
        throw new ForbiddenException(
          'You do not have permission to perform this action',
        );
      }
    }

    return true;
  }
}
