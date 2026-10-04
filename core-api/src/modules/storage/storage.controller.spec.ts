import {
  ROLE_METADATA_KEY,
  STORAGE_BASE_PATH,
} from '@/common/constants/app.constants';
import { Role } from '@/common/enums/enum';
import type { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
  StreamableFile,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { SystemConfigsService } from '../system-configs/system-configs.service';
import type { RustFsClient } from './rustfs.client';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

const LOGO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const PUBLIC_METADATA_KEY = 'PUBLIC'; // matches Public() in app.decorator.ts
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

  beforeEach(async () => {
    const rustFsClient = { getClient: jest.fn(), getPresignClient: jest.fn() };
    const configService = { get: jest.fn() };

    storageService = new StorageService(
      rustFsClient as unknown as RustFsClient,
      configService as unknown as ConfigService,
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
    jest
      .spyOn(storageService, 'getFile')
      .mockResolvedValue(new StreamableFile(Buffer.from('image-bytes')));

    systemConfigsService = {
      getConfig: jest.fn().mockResolvedValue({ name: 'OASM', logoPath: null }),
      updateConfig: jest
        .fn()
        .mockResolvedValue({ message: 'System configuration updated' }),
    };

    module = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        { provide: StorageService, useValue: storageService },
        { provide: SystemConfigsService, useValue: systemConfigsService },
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
    it('carries no role restriction', () => {
      expect(rolesOf(StorageController.prototype.presignDownload)).toBeUndefined();
    });

    it('returns the download URL keyed by the requested path', async () => {
      const result = await controller.presignDownload({
        bucket: 'default',
        path: '2024/report.pdf',
        fileName: 'quarterly-report.pdf',
      });

      expect(result).toEqual({
        downloadUrl: 'https://storage.test/download?sig=1',
        expiresIn: 600,
      });
      expect(storageService.getPresignedDownloadUrl).toHaveBeenCalledWith({
        bucket: 'default',
        key: '2024/report.pdf',
        fileName: 'quarterly-report.pdf',
      });
    });

    it('passes an absent file name through as undefined', async () => {
      await controller.presignDownload({ bucket: 'default', path: 'a/b.pdf' });

      expect(storageService.getPresignedDownloadUrl).toHaveBeenCalledWith({
        bucket: 'default',
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

      await controller.presignDownload({ bucket: 'default', path: 'a/b.pdf' });

      expect(order).toEqual(['allowed', 'notPrivate']);
    });

    it('rejects an empty bucket before signing', async () => {
      await expect(
        controller.presignDownload({ bucket: '  ', path: 'a/b.pdf' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('rejects a private bucket before signing', async () => {
      await expect(
        controller.presignDownload({ bucket: 'job-results', path: 'a/b.pdf' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });
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
    it('is the only public route', () => {
      expect(
        Reflect.getMetadata(
          PUBLIC_METADATA_KEY,
          StorageController.prototype.getFile,
        ),
      ).toBe(true);

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

    it('refuses a private bucket', async () => {
      await expect(
        controller.getFile('reports', 'a/b.pdf', { set: jest.fn() }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(storageService.getFile).not.toHaveBeenCalled();
    });

    it('strips the leading slash and sets the image content type', async () => {
      const set = jest.fn();

      await controller.getFile('default', '/images/logo.png', { set });

      expect(storageService.getFile).toHaveBeenCalledWith(
        'images/logo.png',
        'default',
      );
      expect(set).toHaveBeenCalledWith({
        'Content-Type': 'image/png',
        'Cache-Control': expect.stringContaining('max-age='),
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
        { name: 'getFile', route: 'GET /:bucket/:path' },
      ]);
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
