import type { ExecutionContext } from '@nestjs/common';
import { BadRequestException, createParamDecorator } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { IncomingHttpHeaders } from 'http';

export const WorkspaceId = createParamDecorator<string | undefined>(
  (_data: unknown, context: ExecutionContext) => {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: IncomingHttpHeaders }>();
    const rawHeader = request.headers['x-workspace-id'];

    if (Array.isArray(rawHeader)) {
      return rawHeader[0];
    }

    if (typeof rawHeader === 'string' && isUUID(rawHeader)) {
      return rawHeader;
    }

    throw new BadRequestException('Workspace id null or invalid');
  },
);
