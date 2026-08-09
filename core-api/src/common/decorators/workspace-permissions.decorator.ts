import { Reflector } from '@nestjs/core';

/**
 * Declares the workspace permission keys required to invoke a handler.
 * Combined with {@link WorkspacePermissionGuard} via `@UseGuards`.
 *
 * @example @WorkspacePermissions(['member.write', 'invitation.write'])
 */
export const WorkspacePermissions = Reflector.createDecorator<string[]>();
