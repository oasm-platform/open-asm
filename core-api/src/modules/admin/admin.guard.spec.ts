import { ROLE_METADATA_KEY } from '@/common/constants/app.constants';
import { Role } from '@/common/enums/enum';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { SystemConfigsController } from './system-configs/system-configs.controller';
import type { SystemConfigsService } from './system-configs/system-configs.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminWorkspacesController } from './workspaces/admin-workspaces.controller';

describe.each([
  AdminController,
  AdminUsersController,
  AdminWorkspacesController,
  SystemConfigsController,
])('%p', (controller) => {
  it('is restricted to admins and goes through AdminGuard', () => {
    expect(Reflect.getMetadata(ROLE_METADATA_KEY, controller)).toEqual([
      Role.ADMIN,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
      AdminGuard,
    ]);
  });
});

const contextFrom = (remoteAddress: string, forwardedFor?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        socket: { remoteAddress },
        headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
      }),
    }),
  }) as unknown as ExecutionContext;

describe('AdminGuard', () => {
  let isAdminIpAllowed: jest.Mock;
  let guard: AdminGuard;

  beforeEach(() => {
    isAdminIpAllowed = jest.fn();
    guard = new AdminGuard({
      isAdminIpAllowed,
    } as unknown as SystemConfigsService);
  });

  afterEach(() => {
    delete process.env.TRUSTED_PROXIES;
  });

  it('lets the request through when its IP is allowed', async () => {
    isAdminIpAllowed.mockResolvedValue(true);

    await expect(guard.canActivate(contextFrom('203.0.113.7'))).resolves.toBe(
      true,
    );
    expect(isAdminIpAllowed).toHaveBeenCalledWith('203.0.113.7');
  });

  it('refuses the request when its IP is not allowed', async () => {
    isAdminIpAllowed.mockResolvedValue(false);

    await expect(
      guard.canActivate(contextFrom('203.0.113.7')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('checks the client behind a trusted proxy, not the proxy', async () => {
    process.env.TRUSTED_PROXIES = '172.16.0.0/12';
    isAdminIpAllowed.mockResolvedValue(true);

    await guard.canActivate(contextFrom('172.19.0.5', '198.51.100.9'));

    expect(isAdminIpAllowed).toHaveBeenCalledWith('198.51.100.9');
  });

  it('ignores X-Forwarded-For from an untrusted peer', async () => {
    isAdminIpAllowed.mockResolvedValue(true);

    await guard.canActivate(contextFrom('203.0.113.7', '198.51.100.9'));

    expect(isAdminIpAllowed).toHaveBeenCalledWith('203.0.113.7');
  });
});
