import { UserContext } from '@/common/decorators/app.decorator';
import { WORKSPACE_HEADER_NAME } from '@/common/constants/app.constants';
import { Doc } from '@/common/doc/doc.decorator';
import { AuthGuard } from '@/common/guards/auth.guard';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import type { MessageEvent } from '@nestjs/common';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  NotFoundException,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { EventsService } from './events.service';

@ApiTags('Events')
@Controller('events')
@UseGuards(AuthGuard)
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  @Sse('stream')
  @Doc({
    summary: 'Subscribe to live events',
    description:
      'Server-Sent Events stream of the current user\'s notification pushes ' +
      'plus, when the X-Workspace-Id header is sent, the allowlisted events ' +
      'of that workspace. Each message is a JSON ClientEvent ' +
      '`{ id, type, time, resourceType, resourceId }`; a `ping` event is ' +
      'sent periodically as a heartbeat.',
    request: { getWorkspaceId: true },
  })
  async stream(
    @Req() req: Request,
    @UserContext() user: UserContextPayload,
  ): Promise<Observable<MessageEvent>> {
    const workspaceId = await this.resolveWorkspace(req, user.id);
    return this.eventsService.stream(workspaceId, user.id);
  }

  /**
   * The header only — deliberately NOT the `wid` cookie fallback other routes
   * use: the cookie is shared by every tab, so a reconnecting stream would
   * follow whichever workspace another tab selected last. No header means a
   * notifications-only stream (a user with no workspace yet).
   */
  private async resolveWorkspace(
    req: Request,
    userId: string,
  ): Promise<string | undefined> {
    const header = req.headers[WORKSPACE_HEADER_NAME.toLowerCase()];
    const workspaceId = Array.isArray(header) ? header[0] : header;
    if (!workspaceId) return undefined;
    if (!isUUID(workspaceId)) {
      throw new BadRequestException('Workspace id null or invalid');
    }

    try {
      await this.workspacesService.getMembershipWithPermissions(
        workspaceId,
        userId,
      );
    } catch (error) {
      // Non-members get 403, never revealing whether the workspace exists.
      if (error instanceof NotFoundException) {
        throw new ForbiddenException(
          'You do not have permission to perform this action',
        );
      }
      throw error;
    }
    return workspaceId;
  }
}
