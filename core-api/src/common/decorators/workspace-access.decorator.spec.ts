import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspacePermissionGuard } from '@/common/guards/workspace-permission.guard';
import { WorkspaceAccess } from './workspace-access.decorator';
import { WorkspacePermissions } from './workspace-permissions.decorator';

describe('WorkspaceAccess', () => {
  class TestController {
    @WorkspaceAccess('workflow.read', 'workflow.write')
    readWorkflow() {
      return 'ok';
    }

    @WorkspaceAccess()
    anyMember() {
      return 'ok';
    }
  }

  it('registers WorkspacePermissionGuard on the decorated handler', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      TestController.prototype.readWorkflow,
    ) as unknown[];

    expect(guards).toBeDefined();
    expect(guards).toContain(WorkspacePermissionGuard);
  });

  it('stores the required permission keys in metadata the guard reads', () => {
    const reflector = new Reflector();

    const keys = reflector.getAllAndOverride(WorkspacePermissions, [
      TestController.prototype.readWorkflow,
      TestController,
    ]);

    expect(keys).toEqual(['workflow.read', 'workflow.write']);
  });

  it('stores an empty key list when called without permissions (any member)', () => {
    const reflector = new Reflector();

    const keys = reflector.getAllAndOverride(WorkspacePermissions, [
      TestController.prototype.anyMember,
      TestController,
    ]);

    expect(keys).toEqual([]);
  });

  describe('end-to-end with WorkspacePermissionGuard', () => {
    const makeGuard = (permissionKeys: string[]) => {
      const reflector = new Reflector();
      const workspacesService = {
        getMembershipWithPermissions: jest
          .fn()
          .mockResolvedValue({ membership: {}, permissionKeys }),
      };

      const guard = new WorkspacePermissionGuard(
        reflector,
        workspacesService as never,
      );

      class EndpointController {
        @WorkspaceAccess('target.read')
        exportTargets() {
          return 'csv';
        }
      }

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'user-1' },
            params: { id: 'workspace-1' },
            headers: {},
          }),
        }),
        getHandler: () => EndpointController.prototype.exportTargets,
        getClass: () => EndpointController,
      } as unknown as ExecutionContext;

      return { guard, context };
    };

    it('allows a member holding the required key', async () => {
      const { guard, context } = makeGuard(['target.read']);

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('forbids a member lacking the required key', async () => {
      const { guard, context } = makeGuard(['asset.read']);

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
