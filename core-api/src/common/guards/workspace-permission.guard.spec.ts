import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import type { WorkspaceMembers } from '@/modules/workspaces/entities/workspace-members.entity';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import {
  WORKSPACE_ROUTE_PARAM,
  WorkspacePermissionGuard,
} from './workspace-permission.guard';

describe('WorkspacePermissionGuard', () => {
  let guard: WorkspacePermissionGuard;
  let mockWorkspacesService: {
    getMembershipWithPermissions: jest.Mock;
  };
  let mockReflector: { getAllAndOverride: jest.Mock };
  let mockRequest: {
    user: { id: string };
    params: Record<string, string>;
    headers: Record<string, string>;
    cookies?: Record<string, string>;
    membership?: unknown;
    permissions?: unknown;
  };

  const workspaceId = randomUUID();
  const userId = randomUUID();

  const makeContext = () =>
    ({
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    mockRequest = {
      user: { id: userId },
      params: {},
      headers: {},
    };
    mockWorkspacesService = {
      getMembershipWithPermissions: jest.fn().mockResolvedValue({
        membership: { id: randomUUID() } as WorkspaceMembers,
        permissionKeys: ['member.read'],
      }),
    };
    mockReflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) =>
        key === WORKSPACE_ROUTE_PARAM ? undefined : ['member.read'],
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        WorkspacePermissionGuard,
        { provide: WorkspacesService, useValue: mockWorkspacesService },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get(WorkspacePermissionGuard);
  });

  it('should pass when the member holds the required key', async () => {
    mockRequest.headers = { 'X-Workspace-Id': workspaceId };

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockWorkspacesService.getMembershipWithPermissions).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
    expect(mockRequest.membership).toBeDefined();
    expect(mockRequest.permissions).toEqual(['member.read']);
  });

  it('should pass when the member holds the wildcard "*"', async () => {
    mockRequest.headers = { 'X-Workspace-Id': workspaceId };
    mockWorkspacesService.getMembershipWithPermissions.mockResolvedValue({
      membership: { id: randomUUID() } as WorkspaceMembers,
      permissionKeys: ['*'],
    });

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('should pass when the member holds the write key for a required read key', async () => {
    mockRequest.headers = { 'X-Workspace-Id': workspaceId };
    mockReflector.getAllAndOverride.mockReturnValue(['target.read']);
    mockWorkspacesService.getMembershipWithPermissions.mockResolvedValue({
      membership: { id: randomUUID() } as WorkspaceMembers,
      permissionKeys: ['target.write'],
    });

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('should pass when the member holds both the write and read keys for a read requirement', async () => {
    mockRequest.headers = { 'X-Workspace-Id': workspaceId };
    mockReflector.getAllAndOverride.mockReturnValue(['member.read']);
    mockWorkspacesService.getMembershipWithPermissions.mockResolvedValue({
      membership: { id: randomUUID() } as WorkspaceMembers,
      permissionKeys: ['member.write', 'member.read'],
    });

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('should forbid when the write key belongs to a different domain than the required read key', async () => {
    mockRequest.headers = { 'X-Workspace-Id': workspaceId };
    mockWorkspacesService.getMembershipWithPermissions.mockResolvedValue({
      membership: { id: randomUUID() } as WorkspaceMembers,
      permissionKeys: ['target.write'],
    });

    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should forbid when the requirement is not a read key and only the write key is held', async () => {
    mockRequest.headers = { 'X-Workspace-Id': workspaceId };
    mockReflector.getAllAndOverride.mockReturnValue(['target.delete']);
    mockWorkspacesService.getMembershipWithPermissions.mockResolvedValue({
      membership: { id: randomUUID() } as WorkspaceMembers,
      permissionKeys: ['target.write'],
    });

    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should forbid when the member lacks the required key', async () => {
    mockRequest.headers = { 'X-Workspace-Id': workspaceId };
    mockWorkspacesService.getMembershipWithPermissions.mockResolvedValue({
      membership: { id: randomUUID() } as WorkspaceMembers,
      permissionKeys: ['target.read'],
    });

    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should forbid non-members without leaking workspace existence', async () => {
    mockRequest.headers = { 'X-Workspace-Id': workspaceId };
    mockWorkspacesService.getMembershipWithPermissions.mockRejectedValue(
      new NotFoundException('Workspace member not found'),
    );

    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should fall back to the route :id param when no header is present', async () => {
    mockRequest.params = { id: workspaceId };

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockWorkspacesService.getMembershipWithPermissions).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
  });

  it('should prefer the X-Workspace-Id header over the route :id param', async () => {
    mockRequest.params = { id: randomUUID() };
    mockRequest.headers = { 'X-Workspace-Id': workspaceId };

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockWorkspacesService.getMembershipWithPermissions).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
  });

  it('should prefer an explicit :workspaceId route param over the header', async () => {
    mockRequest.params = { workspaceId };
    mockRequest.headers = { 'X-Workspace-Id': randomUUID() };

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockWorkspacesService.getMembershipWithPermissions).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
  });

  it('should prefer the route :id param over the header when workspaceParam is configured', async () => {
    const urlWorkspaceId = randomUUID();
    mockReflector.getAllAndOverride.mockImplementation((key: string) =>
      key === WORKSPACE_ROUTE_PARAM ? 'id' : ['member.read'],
    );
    mockRequest.params = { id: urlWorkspaceId };
    mockRequest.headers = { 'X-Workspace-Id': workspaceId };

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockWorkspacesService.getMembershipWithPermissions).toHaveBeenCalledWith(
      urlWorkspaceId,
      userId,
    );
  });

  it('should prefer an explicit :workspaceId route param over workspaceParam', async () => {
    mockReflector.getAllAndOverride.mockImplementation((key: string) =>
      key === WORKSPACE_ROUTE_PARAM ? 'id' : ['member.read'],
    );
    mockRequest.params = { workspaceId, id: randomUUID() };
    mockRequest.headers = { 'X-Workspace-Id': randomUUID() };

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockWorkspacesService.getMembershipWithPermissions).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
  });

  it('should pass the configured workspaceParam to membership check even without a header', async () => {
    mockReflector.getAllAndOverride.mockImplementation((key: string) =>
      key === WORKSPACE_ROUTE_PARAM ? 'id' : ['member.read'],
    );
    mockRequest.params = { id: workspaceId };

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockWorkspacesService.getMembershipWithPermissions).toHaveBeenCalledWith(
      workspaceId,
      userId,
    );
  });

  it('should forbid when the workspace id is missing', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should forbid when the request carries no user', async () => {
    mockRequest.headers = { 'X-Workspace-Id': workspaceId };
    mockRequest.user = undefined as never;

    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      ForbiddenException,
    );
  });
});
