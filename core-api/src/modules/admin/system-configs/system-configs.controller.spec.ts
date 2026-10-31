import { ROLE_METADATA_KEY } from '@/common/constants/app.constants';
import { Role } from '@/common/enums/enum';
import type { RustFsClient } from '@/modules/storage/rustfs.client';
import { StorageService } from '@/modules/storage/storage.service';
import type { Logger } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { DataSource } from 'typeorm';
import { MailService } from './mail.service';
import { SystemConfigsController } from './system-configs.controller';
import { SystemConfigsService } from './system-configs.service';

const LOGO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const reflector = new Reflector();

const rolesOf = (handler: (...args: never[]) => unknown) =>
  reflector.getAllAndOverride<Role[] | undefined>(ROLE_METADATA_KEY, [
    handler,
    SystemConfigsController,
  ]);

describe('SystemConfigsController', () => {
  let module: TestingModule;
  let controller: SystemConfigsController;
  let generateObjectKey: jest.SpyInstance;
  // A real StorageService wired to stubbed collaborators: `generateObjectKey`
  // and the MIME lookup are behaviour under test for the logo endpoints, so
  // they must not be re-implemented inside the mock.
  let storageService: StorageService;
  let systemConfigsService: jest.Mocked<
    Pick<
      SystemConfigsService,
      'getConfig' | 'getRawLogoPath' | 'updateConfig' | 'removeLogo'
    >
  >;
  const mailService = { sendTest: jest.fn() };

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
      .mockReturnValue('logo-abc.png');
    jest.spyOn(storageService, 'getPresignedUploadUrl').mockResolvedValue({
      url: 'https://storage.test/logo?sig=1',
      key: 'logo-abc.png',
      path: 'system/logo-abc.png',
      expiresIn: 900,
    });
    jest
      .spyOn(storageService, 'headObject')
      .mockResolvedValue({ contentType: 'image/png', contentLength: 1024 });
    jest.spyOn(storageService, 'deleteFile').mockResolvedValue(undefined);

    systemConfigsService = {
      getConfig: jest.fn().mockResolvedValue({ name: 'OASM', logoPath: null }),
      getRawLogoPath: jest.fn().mockResolvedValue(null),
      updateConfig: jest
        .fn()
        .mockResolvedValue({ message: 'System configuration updated' }),
      removeLogo: jest.fn(),
    };

    module = await Test.createTestingModule({
      controllers: [SystemConfigsController],
      providers: [
        { provide: SystemConfigsService, useValue: systemConfigsService },
        { provide: StorageService, useValue: storageService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    controller = module.get(SystemConfigsController);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getConfig', () => {
    it('should return system configuration', async () => {
      const mockConfig = {
        name: 'Test System',
        logoPath: '/uploads/logo.png',
      };

      (systemConfigsService.getConfig as jest.Mock).mockResolvedValue(
        mockConfig,
      );

      const result = await controller.getConfig();

      expect(systemConfigsService.getConfig).toHaveBeenCalled();
      expect(result).toEqual(mockConfig);
    });
  });

  describe('updateConfig', () => {
    it('should update system configuration', async () => {
      const mockDto = {
        name: 'Updated System',
        logoPath: '/uploads/new-logo.png',
      };

      const mockResponse = {
        message: 'System configuration updated successfully',
      };

      (systemConfigsService.updateConfig as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await controller.updateConfig(mockDto);

      expect(systemConfigsService.updateConfig).toHaveBeenCalledWith(
        mockDto,
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('removeLogo', () => {
    it('should remove system logo and revert to default avatar', async () => {
      const mockResponse = {
        message: 'System logo removed successfully',
      };

      (systemConfigsService.removeLogo as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await controller.removeLogo();

      expect(systemConfigsService.removeLogo).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });
  });

  describe('presignLogoUpload', () => {
    beforeEach(() => {
      generateObjectKey.mockReturnValue('logo-abc.png');
    });

    it('is restricted to admins', () => {
      expect(rolesOf(SystemConfigsController.prototype.presignLogoUpload)).toEqual([
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
      expect(rolesOf(SystemConfigsController.prototype.confirmLogoUpload)).toEqual([
        Role.ADMIN,
      ]);
    });

    it('activates the logo and removes the previous one', async () => {
      systemConfigsService.getRawLogoPath.mockResolvedValue(
        'system/old-logo.png',
      );

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

    it('deletes by the raw path even when the DTO logoPath is an absolute signed URL', async () => {
      systemConfigsService.getRawLogoPath.mockResolvedValue(
        'system/old-logo.png',
      );
      systemConfigsService.getConfig.mockResolvedValue({
        name: 'OASM',
        logoPath:
          'http://localhost:9000/system/old-logo.png?X-Amz-Signature=abc&X-Amz-Expires=900',
      });

      await controller.confirmLogoUpload({ key });

      expect(systemConfigsService.getRawLogoPath).toHaveBeenCalled();
      expect(storageService.deleteFile).toHaveBeenCalledWith(
        'old-logo.png',
        'system',
      );
    });

    it('deletes by the raw path even when the DTO logoPath is a virtual-hosted URL', async () => {
      systemConfigsService.getRawLogoPath.mockResolvedValue(
        'system/old-logo.png',
      );
      systemConfigsService.getConfig.mockResolvedValue({
        name: 'OASM',
        logoPath: 'http://system.localhost:9000/old-logo.png',
      });

      await controller.confirmLogoUpload({ key });

      expect(storageService.deleteFile).toHaveBeenCalledWith(
        'old-logo.png',
        'system',
      );
    });

    it('skips the delete when the previous logo is the object being confirmed', async () => {
      systemConfigsService.getRawLogoPath.mockResolvedValue(`system/${key}`);

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
      systemConfigsService.getRawLogoPath.mockResolvedValue(
        'system/old-logo.png',
      );
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
      systemConfigsService.getRawLogoPath.mockResolvedValue(
        'system/old-logo.png',
      );
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

  describe('route declarations', () => {
    it('is mounted under /admin/system-configs', () => {
      expect(Reflect.getMetadata(PATH_METADATA, SystemConfigsController)).toBe(
        'admin/system-configs',
      );
    });

    it('restricts every endpoint to admins at class level', () => {
      expect(rolesOf(SystemConfigsController.prototype.getConfig)).toEqual([
        Role.ADMIN,
      ]);
    });

    it('keeps the settings endpoints admin-only', () => {
      expect(rolesOf(SystemConfigsController.prototype.getSettings)).toEqual([
        Role.ADMIN,
      ]);
      expect(rolesOf(SystemConfigsController.prototype.updateSettings)).toEqual(
        [Role.ADMIN],
      );
      expect(rolesOf(SystemConfigsController.prototype.sendTestMail)).toEqual([
        Role.ADMIN,
      ]);
    });
  });

  describe('sendTestMail', () => {
    it('sends the test email to the given address', async () => {
      mailService.sendTest.mockResolvedValue({ message: 'Test email sent' });

      await expect(
        controller.sendTestMail({ to: 'admin@example.com' }),
      ).resolves.toEqual({ message: 'Test email sent' });
      expect(mailService.sendTest).toHaveBeenCalledWith('admin@example.com');
    });
  });
});
