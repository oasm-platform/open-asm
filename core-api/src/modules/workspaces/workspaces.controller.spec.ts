import { Reflector } from '@nestjs/core';
import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { WorkspacesController } from './workspaces.controller';

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
