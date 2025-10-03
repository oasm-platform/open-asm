import type { ExecutionContext } from '@nestjs/common';
import { BadRequestException, createParamDecorator } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { IncomingHttpHeaders } from 'http';

/**
 * Get workspace id from request header [x-workspace-id]
 * @param _data - Not used
 * @param context - The execution context of the current request
 * @returns The workspace id from the request headers
 */
export const WorkspaceId = createParamDecorator<string | undefined>(
  (_data: unknown, context: ExecutionContext) => {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: IncomingHttpHeaders }>();
    const rawHeader = request.headers['x-workspace-id'];

    if (Array.isArray(rawHeader)) {
      return rawHeader[0];
    }

    if (typeof rawHeader === 'string' && isUUID(rawHeader, 7)) {
      return rawHeader;
    }

    throw new BadRequestException('Workspace id null or invalid');
  },
);
