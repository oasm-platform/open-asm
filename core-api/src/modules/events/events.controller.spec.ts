import type { UserContextPayload } from '@/common/interfaces/app.interface';
import type { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { EMPTY } from 'rxjs';
import { EventsController } from './events.controller';
import type { EventsService } from './events.service';

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
}));

const WORKSPACE_ID = '0b9a5e4e-6a1f-4f7e-9d4c-2f2b8d1c3a10';
const user = { id: 'user-1' } as UserContextPayload;

function request(
  headers: Record<string, string> = {},
  cookies: Record<string, string> = {},
): Request {
  return { headers, cookies } as unknown as Request;
}

describe('EventsController', () => {
  let eventsService: { stream: jest.Mock };
  let workspacesService: { getMembershipWithPermissions: jest.Mock };
  let controller: EventsController;

  beforeEach(() => {
    eventsService = { stream: jest.fn().mockReturnValue(EMPTY) };
    workspacesService = {
      getMembershipWithPermissions: jest.fn().mockResolvedValue({}),
    };
    controller = new EventsController(
      eventsService as unknown as EventsService,
      workspacesService as unknown as WorkspacesService,
    );
  });

  it('streams the workspace from the header after checking membership', async () => {
    await controller.stream(request({ 'x-workspace-id': WORKSPACE_ID }), user);

    expect(workspacesService.getMembershipWithPermissions).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'user-1',
    );
    expect(eventsService.stream).toHaveBeenCalledWith(WORKSPACE_ID, 'user-1');
  });

  it('ignores the shared wid cookie and streams notifications only', async () => {
    await controller.stream(request({}, { wid: WORKSPACE_ID }), user);

    expect(workspacesService.getMembershipWithPermissions).not.toHaveBeenCalled();
    expect(eventsService.stream).toHaveBeenCalledWith(undefined, 'user-1');
  });

  it('rejects non-members with 403', async () => {
    workspacesService.getMembershipWithPermissions.mockRejectedValue(
      new NotFoundException(),
    );

    await expect(
      controller.stream(request({ 'x-workspace-id': WORKSPACE_ID }), user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(eventsService.stream).not.toHaveBeenCalled();
  });

  it('rejects a malformed workspace id with 400', async () => {
    await expect(
      controller.stream(request({ 'x-workspace-id': 'nope' }), user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
