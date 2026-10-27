import { ROLE_METADATA_KEY } from '@/common/constants/app.constants';
import { Role } from '@/common/enums/enum';
import { ArtifactQuotaService } from '@/modules/artifacts/artifact-quota.service';
import { ToolsService } from '@/modules/tools/tools.service';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

const reflector = new Reflector();

const rolesOf = (handler: (...args: never[]) => unknown) =>
  reflector.getAllAndOverride<Role[] | undefined>(ROLE_METADATA_KEY, [
    handler,
    AdminController,
  ]);

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: { createFirstAdmin: jest.Mock };
  let toolsService: { createTool: jest.Mock };
  let quotaService: { setQuota: jest.Mock };

  beforeEach(async () => {
    adminService = { createFirstAdmin: jest.fn() };
    toolsService = { createTool: jest.fn() };
    quotaService = { setQuota: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: ToolsService, useValue: toolsService },
        { provide: ArtifactQuotaService, useValue: quotaService },
      ],
    }).compile();

    controller = module.get(AdminController);
  });

  it('is mounted under /admin', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminController)).toBe('admin');
  });

  describe('createFirstAdmin', () => {
    it('is public so a fresh install can create its first admin', () => {
      expect(
        Reflect.getMetadata('PUBLIC', AdminController.prototype.createFirstAdmin),
      ).toBe(true);
    });

    it('delegates to AdminService', async () => {
      const dto = { email: 'admin@example.com', password: 'secret-password' };
      adminService.createFirstAdmin.mockResolvedValue({ message: 'ok' });

      await expect(controller.createFirstAdmin(dto)).resolves.toEqual({
        message: 'ok',
      });
      expect(adminService.createFirstAdmin).toHaveBeenCalledWith(dto);
    });
  });

  describe('createTool', () => {
    it('is restricted to admins', () => {
      expect(rolesOf(AdminController.prototype.createTool)).toEqual([
        Role.ADMIN,
      ]);
    });

    it('delegates to ToolsService', async () => {
      const dto = { name: 'nuclei' } as Parameters<
        AdminController['createTool']
      >[0];
      toolsService.createTool.mockResolvedValue({ id: 'tool-1' });

      await expect(controller.createTool(dto)).resolves.toEqual({
        id: 'tool-1',
      });
      expect(toolsService.createTool).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateWorkspaceStorageQuota', () => {
    it('is restricted to admins', () => {
      expect(
        rolesOf(AdminController.prototype.updateWorkspaceStorageQuota),
      ).toEqual([Role.ADMIN]);
    });

    it('delegates to ArtifactQuotaService', async () => {
      const result = { workspaceId: 'ws-1', quotaBytes: 10 };
      quotaService.setQuota.mockResolvedValue(result);

      await expect(
        controller.updateWorkspaceStorageQuota(
          { id: 'ws-1' },
          { quotaBytes: 10 },
        ),
      ).resolves.toEqual(result);
      expect(quotaService.setQuota).toHaveBeenCalledWith('ws-1', 10);
    });
  });
});
