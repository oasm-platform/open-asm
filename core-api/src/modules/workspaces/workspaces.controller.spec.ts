import type { UserContextPayload } from '@/common/interfaces/app.interface';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { AUDIT_LOG_KEY, type AuditLogConfig } from '../audit/audit-log.decorator';
import type { AuditContext, AuditService } from '../audit/audit.service';
import { WorkspacesController } from './workspaces.controller';
import type { WorkspacesService } from './workspaces.service';

describe('WorkspacesController permission metadata', () => {
  const reflector = new Reflector();

  const requiredKeys = (method: () => unknown): string[] =>
    reflector.getAllAndOverride(WorkspacePermissions, [
      method,
      WorkspacesController,
    ]) ?? [];

  it('GET /permissions/catalog requires member.read', () => {
    expect(
      requiredKeys(WorkspacesController.prototype.getPermissionCatalog),
    ).toEqual(['member.read']);
  });

  it('GET /permissions requires member.read', () => {
    expect(
      requiredKeys(WorkspacesController.prototype.getPermissionGroups),
    ).toEqual(['member.read']);
  });

  it('GET /invitations requires member.read', () => {
    expect(
      requiredKeys(WorkspacesController.prototype.listInvitations),
    ).toEqual(['member.read']);
  });

  it('GET /configs requires workspace.config (not just workspace.read)', () => {
    expect(
      requiredKeys(WorkspacesController.prototype.getWorkspaceConfigs),
    ).toEqual(['workspace.config']);
  });

  it('GET /:id requires workspace.read', () => {
    expect(
      requiredKeys(WorkspacesController.prototype.getWorkspaceById),
    ).toEqual(['workspace.read']);
  });

  it('POST /permissions requires workspace.write', () => {
    expect(
      requiredKeys(WorkspacesController.prototype.createPermissionGroup),
    ).toEqual(['workspace.write']);
  });

  it('PATCH /permissions/:permissionId requires workspace.write', () => {
    expect(
      requiredKeys(WorkspacesController.prototype.updatePermissionGroup),
    ).toEqual(['workspace.write']);
  });
});

describe('WorkspacesController audit wiring (M4.1 decorator events)', () => {
  const reflector = new Reflector();

  const auditConfig = (method: () => unknown) =>
    reflector.getAllAndOverride<{
      action: string;
      changes?: AuditLogConfig['changes'];
    }>(AUDIT_LOG_KEY, [method, WorkspacesController]);

  it.each([
    ['createWorkspace', 'workspace.created'],
    ['updateWorkspace', 'workspace.updated'],
    ['updateWorkspaceConfigs', 'workspace.config.updated'],
    ['rotateApiKey', 'workspace.api_key.rotated'],
    ['createInvitations', 'member.invited'],
    ['cancelInvitation', 'member.invitation.cancelled'],
    ['makeArchived', 'workspace.updated'],
  ])('%s is wired to the %s event', (method, action) => {
    expect(auditConfig(WorkspacesController.prototype[method])).toEqual(
      expect.objectContaining({ action }),
    );
  });

  it.each([
    [{ isArchived: true }, true],
    [{ isArchived: false }, false],
    [{}, true],
  ])(
    'makeArchived records isArchived: { after: %s } for body %j',
    (body, after) => {
      const changes =
        auditConfig(WorkspacesController.prototype.makeArchived)?.changes;
      expect(changes?.(body, undefined)).toEqual({ isArchived: { after } });
    },
  );

  it('explicit events (service-level) are NOT double-decorated on the controller', () => {
    for (const method of [
      'deleteWorkspace',
      'removeMember',
      'updateMemberPermissions',
      'createPermissionGroup',
      'updatePermissionGroup',
      'deletePermissionGroup',
    ]) {
      expect(
        auditConfig(WorkspacesController.prototype[method]),
      ).toBeUndefined();
    }
  });
});

describe('WorkspacesController audit context pass-through (M4.1 explicit events)', () => {
  const auditContext: AuditContext = {
    actorId: 'u-actor',
    actorType: 'user',
    actorName: 'Actor User',
    actorEmail: 'actor@example.com',
    sourceIp: '127.0.0.1',
    userAgent: 'test-agent',
    requestId: 'req-1',
  };
  const req = {} as Request;
  const user = { id: 'u-actor' } as UserContextPayload;

  let workspacesService: {
    deleteWorkspace: jest.Mock;
    removeMember: jest.Mock;
    updateMemberPermissions: jest.Mock;
    createPermissionGroup: jest.Mock;
    updatePermissionGroup: jest.Mock;
    deletePermissionGroup: jest.Mock;
  };
  let auditService: { buildActorContext: jest.Mock };
  let controller: WorkspacesController;

  beforeEach(() => {
    workspacesService = {
      deleteWorkspace: jest.fn(),
      removeMember: jest.fn(),
      updateMemberPermissions: jest.fn(),
      createPermissionGroup: jest.fn(),
      updatePermissionGroup: jest.fn(),
      deletePermissionGroup: jest.fn(),
    };
    auditService = {
      buildActorContext: jest.fn().mockReturnValue(auditContext),
    };
    controller = new WorkspacesController(
      workspacesService as unknown as WorkspacesService,
      auditService as unknown as AuditService,
    );
  });

  it('deleteWorkspace passes the actor context derived from the request', async () => {
    await controller.deleteWorkspace({ id: 'ws-1' }, user, req);
    expect(auditService.buildActorContext).toHaveBeenCalledWith(req);
    expect(workspacesService.deleteWorkspace).toHaveBeenCalledWith(
      'ws-1',
      user,
      auditContext,
    );
  });

  it('removeMember passes the actor context derived from the request', async () => {
    await controller.removeMember('ws-1', 'member-1', user, req);
    expect(auditService.buildActorContext).toHaveBeenCalledWith(req);
    expect(workspacesService.removeMember).toHaveBeenCalledWith(
      'ws-1',
      'member-1',
      user.id,
      auditContext,
    );
  });

  it('updateMemberPermissions passes the actor context derived from the request', async () => {
    await controller.updateMemberPermissions(
      'ws-1',
      'member-1',
      { permissionIds: ['pg-1'] },
      user,
      req,
    );
    expect(auditService.buildActorContext).toHaveBeenCalledWith(req);
    expect(workspacesService.updateMemberPermissions).toHaveBeenCalledWith(
      'ws-1',
      'member-1',
      ['pg-1'],
      user.id,
      auditContext,
    );
  });

  it('createPermissionGroup passes the actor context derived from the request', async () => {
    const dto = { name: 'Viewer', permissions: ['asset.read'] };
    await controller.createPermissionGroup('ws-1', dto, user, req);
    expect(auditService.buildActorContext).toHaveBeenCalledWith(req);
    expect(workspacesService.createPermissionGroup).toHaveBeenCalledWith(
      'ws-1',
      dto,
      user.id,
      auditContext,
    );
  });

  it('updatePermissionGroup passes the actor context derived from the request', async () => {
    const dto = { name: 'Viewer', permissions: ['asset.read'] };
    await controller.updatePermissionGroup('ws-1', 'pg-1', dto, user, req);
    expect(auditService.buildActorContext).toHaveBeenCalledWith(req);
    expect(workspacesService.updatePermissionGroup).toHaveBeenCalledWith(
      'ws-1',
      'pg-1',
      dto,
      user.id,
      auditContext,
    );
  });

  it('deletePermissionGroup passes the actor context derived from the request', async () => {
    await controller.deletePermissionGroup('ws-1', 'pg-1', req);
    expect(auditService.buildActorContext).toHaveBeenCalledWith(req);
    expect(workspacesService.deletePermissionGroup).toHaveBeenCalledWith(
      'ws-1',
      'pg-1',
      auditContext,
    );
  });
});
