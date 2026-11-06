import { ROLE_METADATA_KEY } from '@/common/constants/app.constants';
import { Role } from '@/common/enums/enum';
import type { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
  UnauthorizedException,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { DataSource } from 'typeorm';
import type { UserContextPayload } from '@/common/interfaces/app.interface';
import { WorkspacesService } from '../workspaces/workspaces.service';
import type { RustFsClient } from './rustfs.client';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

const reflector = new Reflector();

const rolesOf = (handler: object) =>
  reflector.getAllAndOverride<Role[] | undefined>(ROLE_METADATA_KEY, [
    handler,
    StorageController,
  ]);

describe('StorageController', () => {
  let module: TestingModule;
  let controller: StorageController;
  let generateObjectKey: jest.SpyInstance;
  // A real StorageService wired to stubbed collaborators: the bucket/extension
  // guards and `generateObjectKey` are behaviour under test here, so they must
  // not be re-implemented inside the mock. Only the S3 round-trips are stubbed.
  let storageService: StorageService;
  let workspacesService: jest.Mocked<
    Pick<WorkspacesService, 'getMembershipWithPermissions'>
  >;

  beforeEach(async () => {
    const rustFsClient = { getClient: jest.fn(), getPresignClient: jest.fn() };
    const configService = { get: jest.fn() };
    const dataSource = { query: jest.fn() };

    storageService = new StorageService(
      rustFsClient as unknown as RustFsClient,
      configService as unknown as ConfigService,
      dataSource as unknown as DataSource,
    );

    generateObjectKey = jest
      .spyOn(storageService, 'generateObjectKey')
      .mockReturnValue('2024/report.pdf');
    jest.spyOn(storageService, 'getPresignedUploadUrl').mockResolvedValue({
      url: 'https://storage.test/upload?sig=1',
      key: '2024/report.pdf',
      path: 'default/2024/report.pdf',
      expiresIn: 900,
    });
    jest.spyOn(storageService, 'getPresignedDownloadUrl').mockResolvedValue({
      url: 'https://storage.test/download?sig=1',
      expiresIn: 600,
    });

    workspacesService = {
      getMembershipWithPermissions: jest.fn(),
    };

    module = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        { provide: StorageService, useValue: storageService },
        { provide: WorkspacesService, useValue: workspacesService },
      ],
    }).compile();

    controller = module.get(StorageController);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('presignUpload', () => {
    it('is restricted to admins', () => {
      expect(rolesOf(StorageController.prototype.presignUpload)).toEqual([
        Role.ADMIN,
      ]);
    });

    it('returns the presign payload for the default bucket', async () => {
      const result = await controller.presignUpload({ fileName: 'report.pdf' });

      expect(result).toEqual({
        uploadUrl: 'https://storage.test/upload?sig=1',
        key: '2024/report.pdf',
        path: 'default/2024/report.pdf',
        contentType: 'application/octet-stream',
        expiresIn: 900,
      });
      expect(storageService.getPresignedUploadUrl).toHaveBeenCalledWith({
        bucket: 'default',
        key: '2024/report.pdf',
        contentType: undefined,
      });
    });

    it('checks the allowed bucket before the private bucket', async () => {
      const order: string[] = [];
      jest
        .spyOn(storageService, 'assertBucketAllowed')
        .mockImplementation(() => {
          order.push('allowed');
        });
      jest
        .spyOn(storageService, 'assertBucketNotPrivate')
        .mockImplementation(() => {
          order.push('notPrivate');
        });

      await controller.presignUpload({ fileName: 'report.pdf' });

      expect(order).toEqual(['allowed', 'notPrivate']);
    });

    it('derives the path from the generated key, not from the service response', async () => {
      generateObjectKey.mockReturnValue('abc-123.png');
      const assertBucketAllowed = jest.spyOn(
        storageService,
        'assertBucketAllowed',
      );

      const result = await controller.presignUpload({
        fileName: 'screenshot.png',
        bucket: 'screenshot',
      });

      expect(assertBucketAllowed).toHaveBeenCalledWith('screenshot');
      expect(generateObjectKey).toHaveBeenCalledWith('screenshot.png');
      expect(storageService.getPresignedUploadUrl).toHaveBeenCalledWith({
        bucket: 'screenshot',
        key: 'abc-123.png',
        contentType: undefined,
      });
      expect(result.path).toBe('screenshot/abc-123.png');
    });

    it('forwards an explicit content type', async () => {
      const result = await controller.presignUpload({
        fileName: 'report.pdf',
        contentType: 'application/pdf',
      });

      expect(storageService.getPresignedUploadUrl).toHaveBeenCalledWith({
        bucket: 'default',
        key: '2024/report.pdf',
        contentType: 'application/pdf',
      });
      expect(result.contentType).toBe('application/pdf');
    });

    it('rejects an unknown bucket before generating a key', async () => {
      await expect(
        controller.presignUpload({ fileName: 'report.pdf', bucket: 'nope' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(generateObjectKey).not.toHaveBeenCalled();
      expect(storageService.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('rejects a private bucket before generating a key', async () => {
      await expect(
        controller.presignUpload({ fileName: 'report.pdf', bucket: 'reports' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(generateObjectKey).not.toHaveBeenCalled();
      expect(storageService.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('rejects a file without an extension', async () => {
      generateObjectKey.mockRestore();

      await expect(
        controller.presignUpload({ fileName: 'README' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(storageService.getPresignedUploadUrl).not.toHaveBeenCalled();
    });
  });

  describe('presignDownload', () => {
    const user = { id: 'user-1' } as UserContextPayload;

    beforeEach(() => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue([]);
    });

    it('carries no role restriction', () => {
      expect(rolesOf(StorageController.prototype.presignDownload)).toBeUndefined();
    });

    it('returns the download URL keyed by the requested path', async () => {
      const result = await controller.presignDownload(
        {
          bucket: 'system',
          path: '2024/report.pdf',
          fileName: 'quarterly-report.pdf',
        },
        user,
      );

      expect(result).toEqual({
        downloadUrl: 'https://storage.test/download?sig=1',
        expiresIn: 600,
      });
      expect(storageService.getPresignedDownloadUrl).toHaveBeenCalledWith({
        bucket: 'system',
        key: '2024/report.pdf',
        fileName: 'quarterly-report.pdf',
      });
    });

    it('passes an absent file name through as undefined', async () => {
      await controller.presignDownload(
        { bucket: 'system', path: 'a/b.pdf' },
        user,
      );

      expect(storageService.getPresignedDownloadUrl).toHaveBeenCalledWith({
        bucket: 'system',
        key: 'a/b.pdf',
        fileName: undefined,
      });
    });

    it('checks the allowed bucket before the private bucket', async () => {
      const order: string[] = [];
      jest
        .spyOn(storageService, 'assertBucketAllowed')
        .mockImplementation(() => {
          order.push('allowed');
        });
      jest
        .spyOn(storageService, 'assertBucketNotPrivate')
        .mockImplementation(() => {
          order.push('notPrivate');
        });

      await controller.presignDownload(
        { bucket: 'system', path: 'a/b.pdf' },
        user,
      );

      expect(order).toEqual(['allowed', 'notPrivate']);
    });

    it('rejects an empty bucket before signing', async () => {
      await expect(
        controller.presignDownload({ bucket: '  ', path: 'a/b.pdf' }, user),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('rejects a private bucket before signing', async () => {
      await expect(
        controller.presignDownload(
          { bucket: 'job-results', path: 'a/b.pdf' },
          user,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('lets an owning-workspace member presign a screenshot', async () => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue(['ws-a']);
      workspacesService.getMembershipWithPermissions.mockResolvedValue({
        membership: {},
        permissionKeys: [],
      } as never);

      const result = await controller.presignDownload(
        { bucket: 'screenshot', path: 'abc.png' },
        user,
      );

      expect(result).toEqual({
        downloadUrl: 'https://storage.test/download?sig=1',
        expiresIn: 600,
      });
      expect(workspacesService.getMembershipWithPermissions).toHaveBeenCalledWith(
        'ws-a',
        'user-1',
      );
      expect(storageService.getPresignedDownloadUrl).toHaveBeenCalledWith({
        bucket: 'screenshot',
        key: 'abc.png',
        fileName: undefined,
      });
    });

    it('rejects a presign of another workspace screenshot with 403', async () => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue(['ws-a']);
      workspacesService.getMembershipWithPermissions.mockRejectedValue(
        new NotFoundException('Workspace member not found'),
      );

      await expect(
        controller.presignDownload(
          { bucket: 'screenshot', path: 'abc.png' },
          user,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('rejects an anonymous presign of a tenant bucket with 401', async () => {
      await expect(
        controller.presignDownload(
          { bucket: 'screenshot', path: 'abc.png' },
          undefined,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('rejects an anonymous presign of cached-static with 401', async () => {
      await expect(
        controller.presignDownload(
          { bucket: 'cached-static', path: 'a/b.js' },
          undefined,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('lets an authenticated user presign cached-static', async () => {
      const result = await controller.presignDownload(
        { bucket: 'cached-static', path: 'a/b.js' },
        user,
      );

      expect(result).toEqual({
        downloadUrl: 'https://storage.test/download?sig=1',
        expiresIn: 600,
      });
    });

    it('maps the default bucket to 404', async () => {
      await expect(
        controller.presignDownload(
          { bucket: 'default', path: '2024/report.pdf' },
          user,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('rejects an unknown bucket with 400 before authorizing', async () => {
      await expect(
        controller.presignDownload({ bucket: 'nope', path: 'a/b.pdf' }, user),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('maps an unowned tenant key to 404 for an authenticated user', async () => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue([]);

      await expect(
        controller.presignDownload(
          { bucket: 'screenshot', path: 'missing.png' },
          user,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(workspacesService.getMembershipWithPermissions).not.toHaveBeenCalled();
      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });
  });

  describe('route declarations', () => {
    const declaredRoutes = () =>
      Object.getOwnPropertyNames(StorageController.prototype)
        .filter((name) => name !== 'constructor')
        .map((name) => {
          const handler = (
            StorageController.prototype as unknown as Record<string, object>
          )[name];
          const method = Reflect.getMetadata(METHOD_METADATA, handler) as
            | RequestMethod
            | undefined;
          if (method === undefined) {
            return undefined;
          }
          return {
            name,
            route: `${RequestMethod[method]} /${
              Reflect.getMetadata(PATH_METADATA, handler) as string
            }`,
          };
        })
        .filter((entry): entry is { name: string; route: string } =>
          Boolean(entry),
        );

    it('is mounted under /storage', () => {
      expect(Reflect.getMetadata(PATH_METADATA, StorageController)).toBe(
        'storage',
      );
    });

    it('exposes only presign routes (no byte-streaming wildcard)', () => {
      expect(declaredRoutes()).toEqual([
        { name: 'presignUpload', route: 'POST /presign/upload' },
        { name: 'presignDownload', route: 'GET /presign/download' },
      ]);
    });
  });
});
