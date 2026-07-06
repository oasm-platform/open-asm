import type { ExecutionContext } from '@nestjs/common';
import { BadRequestException, createParamDecorator } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { WORKSPACE_HEADER_NAME } from '../constants/app.constants';

function parseWorkspaceId(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'string' && isUUID(raw)) {
    return raw;
  }
  throw new BadRequestException('Workspace id null or invalid');
}

export const WorkspaceId = createParamDecorator<string | undefined>(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<Request>();

    const workspaceId = getWorkspaceIdFromRequest(request);
    if (workspaceId !== undefined) {
      return parseWorkspaceId(workspaceId);
    }

    throw new BadRequestException('Workspace id null or invalid');
  },
);

export function getWorkspaceIdFromRequest(req: Request): string | undefined {
  return (
    (req.headers[WORKSPACE_HEADER_NAME] as string) ||
    (req.cookies?.wid as string | undefined)
  );
}
