import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';

/**
 * Parameter decorator that extracts the workspace ID from the X-Workspace-Id header.
 * Provides easy access to the workspace ID in controller methods.
 */
export const WorkspaceId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
    }>();
    return request.headers['x-workspace-id'];
  },
);
