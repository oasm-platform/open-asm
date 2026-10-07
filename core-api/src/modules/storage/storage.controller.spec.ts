import {
  ROLE_METADATA_KEY,
  STORAGE_BASE_PATH,
} from '@/common/constants/app.constants';
import { Role } from '@/common/enums/enum';
import type { ConfigService } from '@nestjs/config';
import type {
  Logger } from '@nestjs/common';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { DataSource } from 'typeorm';
import type { UserContextPayload } from '@/common/interfaces/app.interface';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { SystemConfigsService } from '../system-configs/system-configs.service';
import type { RustFsClient } from './rustfs.client';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

const LOGO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const PUBLIC_METADATA_KEY = 'PUBLIC'; // matches Public() in app.decorator.ts
const OPTIONAL_METADATA_KEY = 'OPTIONAL'; // matches Optional() in app.decorator.ts
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
  let systemConfigsService: jest.Mocked<
    Pick<SystemConfigsService, 'getConfig' | 'updateConfig'>
  >;
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
    jest
      .spyOn(storageService, 'headObject')
      .mockResolvedValue({ contentType: 'image/png', contentLength: 1024 });
    jest.spyOn(storageService, 'deleteFile').mockResolvedValue(undefined);
    jest.spyOn(storageService, 'getFile').mockResolvedValue({
      file: new StreamableFile(Buffer.from('image-bytes')),
      etag: '"image-etag"',
      lastModified: new Date('2026-01-01T00:00:00Z'),
    });

    systemConfigsService = {
      getConfig: jest.fn().mockResolvedValue({ name: 'OASM', logoPath: null }),
      updateConfig: jest
        .fn()
        .mockResolvedValue({ message: 'System configuration updated' }),
    };
    workspacesService = {
      getMembershipWithPermissions: jest.fn(),
    };

    module = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        { provide: StorageService, useValue: storageService },
        { provide: SystemConfigsService, useValue: systemConfigsService },
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

    it('lets a member presign their workspace nuclei-template', async () => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue(['ws-a']);
      workspacesService.getMembershipWithPermissions.mockResolvedValue({
        membership: {},
        permissionKeys: [],
      } as never);

      const result = await controller.presignDownload(
        { bucket: 'nuclei-templates', path: 'tpl-1.yaml' },
        user,
      );

      expect(result).toEqual({
        downloadUrl: 'https://storage.test/download?sig=1',
        expiresIn: 600,
      });
      expect(storageService.getPresignedDownloadUrl).toHaveBeenCalledWith({
        bucket: 'nuclei-templates',
        key: 'tpl-1.yaml',
        fileName: undefined,
      });
    });

    it('rejects a presign of another workspace template with 403', async () => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue(['ws-a']);
      workspacesService.getMembershipWithPermissions.mockRejectedValue(
        new NotFoundException('Workspace member not found'),
      );

      await expect(
        controller.presignDownload(
          { bucket: 'nuclei-templates', path: 'tpl-1.yaml' },
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

  describe('authz', () => {
    const user = { id: 'user-1' } as UserContextPayload;

    beforeEach(() => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue([]);
    });

    it('is optional-auth (not public)', () => {
      expect(
        Reflect.getMetadata(
          OPTIONAL_METADATA_KEY,
          StorageController.prototype.authz,
        ),
      ).toBe(true);
      expect(
        Reflect.getMetadata(
          PUBLIC_METADATA_KEY,
          StorageController.prototype.authz,
        ),
      ).toBeUndefined();
    });

    it('returns an empty 200 for an owning-workspace member', async () => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue(['ws-a']);
      workspacesService.getMembershipWithPermissions.mockResolvedValue({
        membership: {},
        permissionKeys: [],
      } as never);

      await expect(
        controller.authz('screenshot', 'abc.png', user),
      ).resolves.toBeUndefined();
    });

    it('lets anonymous reads of the system bucket through', async () => {
      await expect(
        controller.authz('system', 'logo/a.png', undefined),
      ).resolves.toBeUndefined();
    });

    it('lets an authenticated user read cached-static', async () => {
      await expect(
        controller.authz('cached-static', 'a/b.js', user),
      ).resolves.toBeUndefined();
    });

    it('rejects anonymous reads of cached-static with 401', async () => {
      await expect(
        controller.authz('cached-static', 'a/b.js', undefined),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects anonymous reads of a tenant bucket with 401', async () => {
      await expect(
        controller.authz('screenshot', 'abc.png', undefined),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a member of an unrelated workspace with 403', async () => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue(['ws-a']);
      workspacesService.getMembershipWithPermissions.mockRejectedValue(
        new NotFoundException('Workspace member not found'),
      );

      await expect(
        controller.authz('screenshot', 'abc.png', user),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('maps the blocked default bucket to 403, not 404', async () => {
      const error = await controller
        .authz('default', '2024/report.pdf', user)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error).not.toBeInstanceOf(NotFoundException);
    });

    it('maps an unknown bucket to 403, not 400 or 404', async () => {
      const error = await controller
        .authz('nope', 'a/b.pdf', user)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error).not.toBeInstanceOf(BadRequestException);
      expect(error).not.toBeInstanceOf(NotFoundException);
    });

    it('maps an unknown screenshot key to 403', async () => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue([]);

      await expect(
        controller.authz('screenshot', 'missing.png', user),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each([
      [undefined, 'abc.png'],
      ['screenshot', undefined],
      [undefined, undefined],
      ['', 'abc.png'],
      ['screenshot', ''],
    ])('rejects the (%p, %p) headers with 403', async (bucket, key) => {
      await expect(
        controller.authz(bucket, key, user),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each(['..', '.', '../secret.png', 'a/../../b.png', 'a/./b.png'])(
      'rejects the %p key with 403',
      async (key) => {
        await expect(
          controller.authz('screenshot', key, user),
        ).rejects.toBeInstanceOf(ForbiddenException);
      },
    );
  });

  describe('presignLogoUpload', () => {
    beforeEach(() => {
      generateObjectKey.mockReturnValue('logo-abc.png');
    });

    it('is restricted to admins', () => {
      expect(rolesOf(StorageController.prototype.presignLogoUpload)).toEqual([
        Role.ADMIN,
      ]);
    });

    it('signs into the system bucket behind the logo prefix', async () => {
      jest
        .spyOn(storageService, 'getPresignedUploadUrl')
        .mockResolvedValue({
          url: 'https://storage.test/logo?sig=1',
          key: 'logo-abc.png',
          path: 'system/logo-abc.png',
          expiresIn: 900,
        });

      const result = await controller.presignLogoUpload({
        fileName: 'logo.png',
      });

      expect(generateObjectKey).toHaveBeenCalledWith('logo.png', {
        prefix: 'logo',
        allowedExtensions: expect.arrayContaining(['png', 'svg']),
      });
      expect(storageService.getPresignedUploadUrl).toHaveBeenCalledWith({
        bucket: 'system',
        key: 'logo-abc.png',
        contentType: 'image/png',
      });
      expect(result).toEqual({
        uploadUrl: 'https://storage.test/logo?sig=1',
        key: 'logo-abc.png',
        path: 'system/logo-abc.png',
        expiresIn: 900,
      });
    });

    it.each([
      ['logo.jpg', 'image/jpeg'],
      ['logo.JPEG', 'image/jpeg'],
      ['logo.svg', 'image/svg+xml'],
      ['logo.webp', 'image/webp'],
      ['logo.gif', 'image/gif'],
    ])(
      'derives %s as %s when no content type is given',
      async (fileName, contentType) => {
        generateObjectKey.mockReturnValue(fileName);

        await controller.presignLogoUpload({ fileName });

        expect(storageService.getPresignedUploadUrl).toHaveBeenCalledWith({
          bucket: 'system',
          key: fileName,
          contentType,
        });
      },
    );

    it('prefers an explicit content type over the extension', async () => {
      await controller.presignLogoUpload({
        fileName: 'logo.png',
        contentType: 'image/x-icon',
      });

      expect(storageService.getPresignedUploadUrl).toHaveBeenCalledWith({
        bucket: 'system',
        key: 'logo-abc.png',
        contentType: 'image/x-icon',
      });
    });

    it('generates a prefixed, lower-cased key for an allowed image', async () => {
      generateObjectKey.mockRestore();

      const result = await controller.presignLogoUpload({
        fileName: 'My Logo.PNG',
      });

      expect(result.key).toMatch(
        /^logo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
      );
      expect(storageService.getPresignedUploadUrl).toHaveBeenCalledWith({
        bucket: 'system',
        key: result.key,
        contentType: 'image/png',
      });
    });

    it.each(['notes.txt', 'payload.sh', 'archive.zip', 'logo.exe'])(
      'rejects the %s extension',
      async (fileName) => {
        generateObjectKey.mockRestore();

        await expect(
          controller.presignLogoUpload({ fileName }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(storageService.getPresignedUploadUrl).not.toHaveBeenCalled();
      },
    );

    it('rejects a file name without an extension', async () => {
      generateObjectKey.mockRestore();

      await expect(
        controller.presignLogoUpload({ fileName: 'logo' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(storageService.getPresignedUploadUrl).not.toHaveBeenCalled();
    });
  });

  describe('confirmLogoUpload', () => {
    const key = 'logo-1a2b3c.png';

    it('is restricted to admins', () => {
      expect(rolesOf(StorageController.prototype.confirmLogoUpload)).toEqual([
        Role.ADMIN,
      ]);
    });

    it('activates the logo and removes the previous one', async () => {
      systemConfigsService.getConfig.mockResolvedValue({
        name: 'OASM',
        logoPath: `${STORAGE_BASE_PATH}/system/old-logo.png`,
      });

      const result = await controller.confirmLogoUpload({ key });

      expect(storageService.headObject).toHaveBeenCalledWith('system', key);
      expect(systemConfigsService.updateConfig).toHaveBeenCalledWith({
        logoPath: `system/${key}`,
      });
      expect(storageService.deleteFile).toHaveBeenCalledWith(
        'old-logo.png',
        'system',
      );
      expect(result).toEqual({ message: 'Logo uploaded successfully' });
    });

    it('skips the delete when the previous logo is the object being confirmed', async () => {
      systemConfigsService.getConfig.mockResolvedValue({
        name: 'OASM',
        logoPath: `${STORAGE_BASE_PATH}/system/${key}`,
      });

      await controller.confirmLogoUpload({ key });

      expect(systemConfigsService.updateConfig).toHaveBeenCalledWith({
        logoPath: `system/${key}`,
      });
      expect(storageService.deleteFile).not.toHaveBeenCalled();
    });

    it('skips the delete when no logo was configured', async () => {
      await controller.confirmLogoUpload({ key });

      expect(systemConfigsService.updateConfig).toHaveBeenCalledWith({
        logoPath: `system/${key}`,
      });
      expect(storageService.deleteFile).not.toHaveBeenCalled();
    });

    it('still confirms when the stale object cannot be deleted', async () => {
      systemConfigsService.getConfig.mockResolvedValue({
        name: 'OASM',
        logoPath: `${STORAGE_BASE_PATH}/system/old-logo.png`,
      });
      jest
        .spyOn(storageService, 'deleteFile')
        .mockRejectedValue(new Error('NoSuchKey'));

      await expect(controller.confirmLogoUpload({ key })).resolves.toEqual({
        message: 'Logo uploaded successfully',
      });
      expect(systemConfigsService.updateConfig).toHaveBeenCalledWith({
        logoPath: `system/${key}`,
      });
    });

    it('logs why a stale object could not be deleted', async () => {
      systemConfigsService.getConfig.mockResolvedValue({
        name: 'OASM',
        logoPath: `${STORAGE_BASE_PATH}/system/old-logo.png`,
      });
      jest
        .spyOn(storageService, 'deleteFile')
        .mockRejectedValue(new Error('NoSuchKey'));
      const warn = jest
        .spyOn(
          (controller as unknown as { logger: Logger }).logger,
          'warn',
        )
        .mockImplementation(() => undefined);

      await controller.confirmLogoUpload({ key });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('old-logo.png'),
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('NoSuchKey'));
    });

    it('propagates a missing object as NotFound', async () => {
      jest
        .spyOn(storageService, 'headObject')
        .mockRejectedValue(new NotFoundException('File not found'));

      await expect(
        controller.confirmLogoUpload({ key }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(systemConfigsService.updateConfig).not.toHaveBeenCalled();
    });

    it.each(['application/pdf', 'text/html', ''])(
      'rejects the %p content type',
      async (contentType) => {
        jest
          .spyOn(storageService, 'headObject')
          .mockResolvedValue({ contentType, contentLength: 1024 });

        await expect(
          controller.confirmLogoUpload({ key }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(systemConfigsService.updateConfig).not.toHaveBeenCalled();
      },
    );

    /**
     * Acceptance rule: the stored `ContentType` must be exactly the MIME type
     * that the key's own extension maps to, and that extension must be in the
     * image allow-list. A bare `image/` prefix is not enough — an
     * `image/svg+xml` object behind a `.png` key is rejected, as is any
     * `image/*` type outside the six derived from the allow-list.
     */
    it.each([
      ['logo-1a2b3c.png', 'image/svg+xml'],
      ['logo-1a2b3c.png', 'image/gif'],
      ['logo-1a2b3c.png', 'image/x-icon'],
      ['logo-1a2b3c.png', 'image/vnd.microsoft.icon'],
      ['logo-1a2b3c.txt', 'text/plain'],
      ['logo-1a2b3c', 'image/png'],
    ])(
      'rejects %p stored as %p because it is not its extension image MIME',
      async (objectKey, contentType) => {
        jest
          .spyOn(storageService, 'headObject')
          .mockResolvedValue({ contentType, contentLength: 1024 });

        await expect(
          controller.confirmLogoUpload({ key: objectKey }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(systemConfigsService.updateConfig).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['logo-1a2b3c.jpg', 'image/jpeg'],
      ['logo-1a2b3c.jpeg', 'image/jpeg'],
      ['logo-1a2b3c.png', 'image/png'],
      ['logo-1a2b3c.gif', 'image/gif'],
      ['logo-1a2b3c.webp', 'image/webp'],
      ['logo-1a2b3c.svg', 'image/svg+xml'],
    ])(
      'accepts %p stored as %p',
      async (objectKey, contentType) => {
        jest
          .spyOn(storageService, 'headObject')
          .mockResolvedValue({ contentType, contentLength: 1024 });

        await expect(controller.confirmLogoUpload({ key: objectKey })).resolves.toEqual({
          message: 'Logo uploaded successfully',
        });

        expect(systemConfigsService.updateConfig).toHaveBeenCalledWith({
          logoPath: `system/${objectKey}`,
        });
      },
    );

    it('rejects a file one byte over the limit', async () => {
      jest
        .spyOn(storageService, 'headObject')
        .mockResolvedValue({
          contentType: 'image/png',
          contentLength: LOGO_MAX_SIZE_BYTES + 1,
        });

      await expect(
        controller.confirmLogoUpload({ key }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(systemConfigsService.updateConfig).not.toHaveBeenCalled();
    });

    it('accepts a file exactly at the limit', async () => {
      jest
        .spyOn(storageService, 'headObject')
        .mockResolvedValue({
          contentType: 'image/png',
          contentLength: LOGO_MAX_SIZE_BYTES,
        });

      await expect(controller.confirmLogoUpload({ key })).resolves.toEqual({
        message: 'Logo uploaded successfully',
      });
    });

    it.each(['', '   ', 'sub/logo.png', 'sub\\logo.png', '../logo.png'])(
      'rejects the %p key before touching storage',
      async (invalidKey) => {
        const dto = { key: invalidKey };

        await expect(
          controller.confirmLogoUpload(dto),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(storageService.headObject).not.toHaveBeenCalled();
        expect(systemConfigsService.updateConfig).not.toHaveBeenCalled();
      },
    );

    it('trims surrounding whitespace off an otherwise valid key', async () => {
      await controller.confirmLogoUpload({ key: `  ${key}  ` });

      expect(storageService.headObject).toHaveBeenCalledWith('system', key);
    });
  });

  describe('getFile', () => {
    const user = { id: 'user-1' } as UserContextPayload;
    const res = { set: jest.fn(), status: jest.fn() };

    beforeEach(() => {
      res.set.mockClear();
      res.status.mockClear();
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue([]);
    });

    it('is optional-auth (not public), presignDownload is neither', () => {
      expect(
        Reflect.getMetadata(
          OPTIONAL_METADATA_KEY,
          StorageController.prototype.getFile,
        ),
      ).toBe(true);
      expect(
        Reflect.getMetadata(
          PUBLIC_METADATA_KEY,
          StorageController.prototype.getFile,
        ),
      ).toBeUndefined();

      for (const handler of [
        'presignUpload',
        'presignDownload',
        'presignLogoUpload',
        'confirmLogoUpload',
      ]) {
        expect(
          Reflect.getMetadata(
            PUBLIC_METADATA_KEY,
            (
              StorageController.prototype as unknown as Record<string, object>
            )[handler],
          ),
        ).toBeUndefined();
      }
    });

    it('lets anonymous reads of the system bucket through', async () => {
      const file = await controller.getFile('system', 'logo/a.png', res, undefined);

      expect(storageService.getFile).toHaveBeenCalledWith('logo/a.png', 'system');
      expect(file).toBeInstanceOf(StreamableFile);
    });

    it('rejects anonymous reads of cached-static with 401', async () => {
      await expect(
        controller.getFile('cached-static', 'a/b.js', res, undefined),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(storageService.getFile).not.toHaveBeenCalled();
    });

    it('lets authenticated reads of cached-static through', async () => {
      const file = await controller.getFile('cached-static', 'a/b.js', res, user);

      expect(storageService.getFile).toHaveBeenCalledWith('a/b.js', 'cached-static');
      expect(file).toBeInstanceOf(StreamableFile);
    });

    it('rejects anonymous reads of a tenant bucket with 401', async () => {
      await expect(
        controller.getFile('screenshot', 'abc.png', res, undefined),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(storageService.getFile).not.toHaveBeenCalled();
    });

    it('lets an owning-workspace member read a screenshot', async () => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue(['ws-a']);
      workspacesService.getMembershipWithPermissions.mockResolvedValue({
        membership: {},
        permissionKeys: [],
      } as never);

      const file = await controller.getFile('screenshot', 'abc.png', res, user);

      expect(workspacesService.getMembershipWithPermissions).toHaveBeenCalledWith(
        'ws-a',
        'user-1',
      );
      expect(storageService.getFile).toHaveBeenCalledWith('abc.png', 'screenshot');
      expect(file).toBeInstanceOf(StreamableFile);
    });

    it('authorizes membership of ANY owning workspace on a shared key', async () => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue(['ws-a', 'ws-b']);
      workspacesService.getMembershipWithPermissions
        .mockRejectedValueOnce(new NotFoundException('Workspace member not found'))
        .mockResolvedValueOnce({ membership: {}, permissionKeys: [] } as never);

      await controller.getFile('screenshot', 'shared.png', res, user);

      expect(workspacesService.getMembershipWithPermissions).toHaveBeenNthCalledWith(
        1,
        'ws-a',
        'user-1',
      );
      expect(workspacesService.getMembershipWithPermissions).toHaveBeenNthCalledWith(
        2,
        'ws-b',
        'user-1',
      );
      expect(storageService.getFile).toHaveBeenCalledWith('shared.png', 'screenshot');
    });

    it('rejects a member of an unrelated workspace with 403', async () => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue(['ws-a']);
      workspacesService.getMembershipWithPermissions.mockRejectedValue(
        new NotFoundException('Workspace member not found'),
      );

      await expect(
        controller.getFile('screenshot', 'abc.png', res, user),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(storageService.getFile).not.toHaveBeenCalled();
    });

    it('maps an unowned tenant key to 404 for an authenticated user', async () => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue([]);

      await expect(
        controller.getFile('screenshot', 'missing.png', res, user),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(workspacesService.getMembershipWithPermissions).not.toHaveBeenCalled();
      expect(storageService.getFile).not.toHaveBeenCalled();
    });

    it('maps the default bucket to 404', async () => {
      await expect(
        controller.getFile('default', 'images/logo.png', res, user),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storageService.getFile).not.toHaveBeenCalled();
    });

    it('maps an unknown bucket to 404', async () => {
      await expect(
        controller.getFile('nope', 'a/b.pdf', res, user),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storageService.getFile).not.toHaveBeenCalled();
    });

    it('refuses a private bucket', async () => {
      await expect(
        controller.getFile('reports', 'a/b.pdf', res, user),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(storageService.getFile).not.toHaveBeenCalled();
    });

    it('rethrows a membership lookup failure instead of mapping it', async () => {
      jest
        .spyOn(storageService, 'resolveObjectWorkspaceIds')
        .mockResolvedValue(['ws-a']);
      workspacesService.getMembershipWithPermissions.mockRejectedValue(
        new Error('db down'),
      );

      await expect(
        controller.getFile('screenshot', 'abc.png', res, user),
      ).rejects.toThrow('db down');

      expect(storageService.getFile).not.toHaveBeenCalled();
    });

    it('strips the leading slash and sets the image content type', async () => {
      const set = jest.fn();

      await controller.getFile(
        'system',
        '/images/logo.png',
        { set, status: jest.fn() },
        undefined,
      );

      expect(storageService.getFile).toHaveBeenCalledWith(
        'images/logo.png',
        'system',
      );
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'image/png',
          'Cache-Control': expect.stringContaining('max-age='),
        }),
      );
    });

    describe('conditional GET', () => {
      const etag = '"image-etag"';
      const lastModified = new Date('2026-01-01T00:00:00Z');
      const makeRes = () => ({ set: jest.fn(), status: jest.fn() });

      it('returns 304 with an empty body when If-None-Match matches', async () => {
        const res = makeRes();

        const result = await controller.getFile(
          'system',
          'logo/a.png',
          res,
          undefined,
          etag,
        );

        expect(res.status).toHaveBeenCalledWith(304);
        expect(result).toBeUndefined();
        expect(res.set).toHaveBeenCalledWith(
          expect.objectContaining({ ETag: etag }),
        );
      });

      it('returns 200 when If-None-Match does not match', async () => {
        const res = makeRes();

        const result = await controller.getFile(
          'system',
          'logo/a.png',
          res,
          undefined,
          '"bogus"',
        );

        expect(res.status).not.toHaveBeenCalled();
        expect(result).toBeInstanceOf(StreamableFile);
      });

      it('returns 304 for If-None-Match: *', async () => {
        const res = makeRes();

        const result = await controller.getFile(
          'system',
          'logo/a.png',
          res,
          undefined,
          '*',
        );

        expect(res.status).toHaveBeenCalledWith(304);
        expect(result).toBeUndefined();
      });

      it('matches a weak entity-tag against a strong one', async () => {
        const res = makeRes();

        const result = await controller.getFile(
          'system',
          'logo/a.png',
          res,
          undefined,
          'W/"image-etag"',
        );

        expect(res.status).toHaveBeenCalledWith(304);
        expect(result).toBeUndefined();
      });

      it('matches a multi-value If-None-Match list', async () => {
        const res = makeRes();

        const result = await controller.getFile(
          'system',
          'logo/a.png',
          res,
          undefined,
          '"other", "image-etag"',
        );

        expect(res.status).toHaveBeenCalledWith(304);
        expect(result).toBeUndefined();
      });

      it('never returns 304 when storage provides no ETag', async () => {
        jest.spyOn(storageService, 'getFile').mockResolvedValueOnce({
          file: new StreamableFile(Buffer.from('image-bytes')),
          etag: null,
          lastModified,
        });
        const res = makeRes();

        const result = await controller.getFile(
          'system',
          'logo/a.png',
          res,
          undefined,
          '*',
        );

        expect(res.status).not.toHaveBeenCalled();
        expect(result).toBeInstanceOf(StreamableFile);
      });

      it('destroys the opened body stream instead of holding the socket on 304', async () => {
        const file = new StreamableFile(Buffer.from('image-bytes'));
        const destroy = jest.spyOn(file.getStream(), 'destroy');
        jest.spyOn(storageService, 'getFile').mockResolvedValueOnce({
          file,
          etag,
          lastModified,
        });
        const res = makeRes();

        await controller.getFile('system', 'logo/a.png', res, undefined, etag);

        expect(destroy).toHaveBeenCalled();
      });

      it('uses the public cache matrix for the system bucket', async () => {
        const res = makeRes();

        await controller.getFile('system', 'logo/a.png', res, undefined);

        expect(res.set).toHaveBeenCalledWith(
          expect.objectContaining({
            'Cache-Control': expect.stringContaining('public'),
          }),
        );
      });

      it('uses the private cache matrix for a screenshot read', async () => {
        jest
          .spyOn(storageService, 'resolveObjectWorkspaceIds')
          .mockResolvedValue(['ws-a']);
        workspacesService.getMembershipWithPermissions.mockResolvedValue({
          membership: {},
          permissionKeys: [],
        } as never);
        const res = makeRes();

        await controller.getFile('screenshot', 'abc.png', res, user);

        expect(res.set).toHaveBeenCalledWith(
          expect.objectContaining({
            'Cache-Control': expect.stringContaining('private'),
          }),
        );
      });

      it('always sets Last-Modified when storage provides one', async () => {
        const res = makeRes();

        await controller.getFile('system', 'logo/a.png', res, undefined);

        expect(res.set).toHaveBeenCalledWith(
          expect.objectContaining({
            'Last-Modified': lastModified.toUTCString(),
          }),
        );
      });

      it('lets a matching ETag win over a stale If-Modified-Since', async () => {
        const res = makeRes();

        const result = await controller.getFile(
          'system',
          'logo/a.png',
          res,
          undefined,
          etag,
          new Date('2020-01-01T00:00:00Z').toUTCString(),
        );

        expect(res.status).toHaveBeenCalledWith(304);
        expect(result).toBeUndefined();
      });

      it('lets a mismatching ETag win over a fresh If-Modified-Since', async () => {
        const res = makeRes();

        const result = await controller.getFile(
          'system',
          'logo/a.png',
          res,
          undefined,
          '"bogus"',
          new Date('2026-06-01T00:00:00Z').toUTCString(),
        );

        expect(res.status).not.toHaveBeenCalled();
        expect(result).toBeInstanceOf(StreamableFile);
      });

      it('returns 304 for a fresh If-Modified-Since when If-None-Match is absent', async () => {
        const res = makeRes();

        const result = await controller.getFile(
          'system',
          'logo/a.png',
          res,
          undefined,
          undefined,
          new Date('2026-06-01T00:00:00Z').toUTCString(),
        );

        expect(res.status).toHaveBeenCalledWith(304);
        expect(result).toBeUndefined();
      });

      it('returns 200 for a stale If-Modified-Since when If-None-Match is absent', async () => {
        const res = makeRes();

        const result = await controller.getFile(
          'system',
          'logo/a.png',
          res,
          undefined,
          undefined,
          new Date('2020-01-01T00:00:00Z').toUTCString(),
        );

        expect(res.status).not.toHaveBeenCalled();
        expect(result).toBeInstanceOf(StreamableFile);
      });
    });
  });

  /**
   * Route-ordering regression guard. Nest/Express matches routes in declaration
   * order, so a literal route declared after a `:param` wildcard is unreachable.
   * Reordering the handlers below silently breaks the presign endpoints.
   */
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

    it('keeps the literal presign routes ahead of the :bucket/:path wildcard', () => {
      expect(declaredRoutes()).toEqual([
        { name: 'presignLogoUpload', route: 'POST /logo/presign' },
        { name: 'confirmLogoUpload', route: 'POST /logo/confirm' },
        { name: 'presignUpload', route: 'POST /presign/upload' },
        { name: 'presignDownload', route: 'GET /presign/download' },
        { name: 'authz', route: 'GET /authz' },
        { name: 'getFile', route: 'GET /:bucket/:path' },
      ]);
    });

    it('declares GET authz before the GET wildcard', () => {
      const routes = declaredRoutes().map((entry) => entry.route);
      const authzIndex = routes.indexOf('GET /authz');
      const wildcardIndex = routes.indexOf('GET /:bucket/:path');

      expect(authzIndex).toBeGreaterThanOrEqual(0);
      expect(wildcardIndex).toBeGreaterThanOrEqual(0);
      expect(authzIndex).toBeLessThan(wildcardIndex);
    });

    it('declares GET presign/download before the GET wildcard', () => {
      const routes = declaredRoutes().map((entry) => entry.route);
      const downloadIndex = routes.indexOf('GET /presign/download');
      const wildcardIndex = routes.indexOf('GET /:bucket/:path');

      expect(downloadIndex).toBeGreaterThanOrEqual(0);
      expect(wildcardIndex).toBeGreaterThanOrEqual(0);
      expect(downloadIndex).toBeLessThan(wildcardIndex);
    });
  });
});
