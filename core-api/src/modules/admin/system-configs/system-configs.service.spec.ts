import { decrypt } from '@/common/utils/encryption.util';
import { RedisService } from '@/services/redis/redis.service';
import { BadRequestException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { StorageService } from '@/modules/storage/storage.service';
import type { SystemSettingsDto } from './dto/system-configs.dto';
import type { SystemSettings } from './entities/system-config.entity';
import { SystemConfig } from './entities/system-config.entity';
import { SystemConfigsService } from './system-configs.service';

describe('SystemConfigsService', () => {
  let service: SystemConfigsService;
  let mockSystemConfigRepository: Partial<Repository<SystemConfig>>;
  let mockStorageService: Partial<StorageService>;

  beforeEach(async () => {
    mockSystemConfigRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockStorageService = {
      deleteFile: jest.fn(),
      signStoragePath: jest.fn(),
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemConfigsService,
        {
          provide: getRepositoryToken(SystemConfig),
          useValue: mockSystemConfigRepository,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<SystemConfigsService>(SystemConfigsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getConfig', () => {
    it('emits logoPath via signStoragePath when raw path present', async () => {
      const rawPath = 'system/logo-123.png';
      const clientUrl = 'http://localhost:9000/system/logo-123.png';
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        name: 'Test System',
        logoPath: rawPath,
      });
      (mockStorageService.signStoragePath as jest.Mock).mockResolvedValue(
        clientUrl,
      );

      const result = await service.getConfig();

      expect(
        mockStorageService.signStoragePath as jest.Mock,
      ).toHaveBeenCalledWith(rawPath);
      expect(result).toEqual({ name: 'Test System', logoPath: clientUrl });
    });

    it('returns null logoPath without calling helper when absent', async () => {
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        name: 'OASM',
        logoPath: null,
      });

      const result = await service.getConfig();

      expect(
        mockStorageService.signStoragePath as jest.Mock,
      ).not.toHaveBeenCalled();
      expect(result).toEqual({ name: 'OASM', logoPath: null });
    });
  });

  describe('getRawLogoPath', () => {
    it('returns the raw stored path without calling the client-URL helper', async () => {
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        name: 'Test System',
        logoPath: 'system/logo-123.png',
      });

      const result = await service.getRawLogoPath();

      expect(
        mockStorageService.signStoragePath as jest.Mock,
      ).not.toHaveBeenCalled();
      expect(result).toBe('system/logo-123.png');
    });

    it('returns null when no logo is configured', async () => {
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        name: 'OASM',
        logoPath: null,
      });

      await expect(service.getRawLogoPath()).resolves.toBeNull();
    });
  });

  describe('removeLogo', () => {
    it('should remove logo and set logoPath to null', async () => {
      const mockConfig = {
        id: 1,
        name: 'Test System',
        logoPath: '/uploads/logo.png',
      };

      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue(
        mockConfig,
      );
      (mockSystemConfigRepository.save as jest.Mock).mockResolvedValue({
        ...mockConfig,
        logoPath: null,
      });

      const result = await service.removeLogo();

      expect(mockSystemConfigRepository.findOne).toHaveBeenCalled();
      expect(mockSystemConfigRepository.save).toHaveBeenCalledWith({
        ...mockConfig,
        logoPath: null,
      });
      expect(result).toEqual({
        message: 'System logo removed successfully',
      });
    });

    it('should create default config if none exists and return no logo message', async () => {
      const mockConfig = {
        id: 1,
        name: 'OASM',
        logoPath: null,
      };

      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue(null);
      (mockSystemConfigRepository.create as jest.Mock).mockReturnValue(
        mockConfig,
      );
      (mockSystemConfigRepository.save as jest.Mock).mockResolvedValue(
        mockConfig,
      );

      const result = await service.removeLogo();

      expect(mockSystemConfigRepository.findOne).toHaveBeenCalled();
      expect(mockSystemConfigRepository.create).toHaveBeenCalledWith({
        name: 'OASM',
        logoPath: undefined,
      });
      expect(result).toEqual({
        message: 'No system logo to remove',
      });
    });
  });

  describe('getSettings', () => {
    afterEach(() => jest.restoreAllMocks());

    it('fills each section with defaults and keeps stored values on top', async () => {
      jest.replaceProperty(
        SystemConfigsService as unknown as { DEFAULT_SETTINGS: SystemSettings },
        'DEFAULT_SETTINGS',
        { smtp: { host: '', port: 25 }, security: { mfa: false } },
      );
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        settings: { smtp: { host: 'mail.test' }, legacy: { on: true } },
      });

      await expect(service.getSettings()).resolves.toEqual({
        smtp: { host: 'mail.test', port: 25 },
        security: { mfa: false },
        legacy: { on: true },
      });
    });

    it('returns defaults for a row saved before settings existed', async () => {
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        name: 'OASM',
      });

      await expect(service.getSettings()).resolves.toEqual({
        auth: { allowSignUp: false },
        mailServer: {
          enabled: false,
          provider: 'smtp',
          host: '',
          port: 587,
          secure: false,
          username: '',
          fromEmail: '',
          fromName: '',
        },
      });
    });
  });

  describe('getSettingsView', () => {
    it('leaves the mail server password out and says one is saved', async () => {
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        settings: { mailServer: { host: 'smtp.test', password: 'cipher' } },
      });

      const { mailServer } = await service.getSettingsView();

      expect(mailServer).not.toHaveProperty('password');
      expect(mailServer).toMatchObject({ host: 'smtp.test', hasPassword: true });
    });

    it('says no password is saved when there is none', async () => {
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        settings: {},
      });

      const { mailServer } = await service.getSettingsView();

      expect(mailServer).toMatchObject({ hasPassword: false });
    });
  });

  describe('isSignUpAllowed', () => {
    const withSettings = (settings: SystemSettings) =>
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 1,
        settings,
      });

    it('is closed when nothing is stored', async () => {
      withSettings({});

      await expect(service.isSignUpAllowed()).resolves.toBe(false);
    });

    it('stays closed while the mail server is off', async () => {
      withSettings({ auth: { allowSignUp: true } });

      await expect(service.isSignUpAllowed()).resolves.toBe(false);
    });

    it('is open once an admin allows it and the mail server is on', async () => {
      withSettings({
        auth: { allowSignUp: true },
        mailServer: { enabled: true },
      });

      await expect(service.isSignUpAllowed()).resolves.toBe(true);
    });
  });

  describe('updateSettings', () => {
    let queryBuilder: Record<
      'update' | 'set' | 'setParameter' | 'where',
      jest.Mock
    > & {
      execute: jest.Mock;
    };

    beforeEach(() => {
      queryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      mockSystemConfigRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(queryBuilder);
      (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'config-id',
        settings: {},
      });
    });

    it('merges only the given sections in one update', async () => {
      const dto = {
        smtp: { port: 587 },
        security: null,
      } as unknown as SystemSettingsDto;

      const result = await service.updateSettings(dto);

      expect(queryBuilder.setParameter).toHaveBeenCalledWith(
        'sections',
        JSON.stringify({ smtp: { port: 587 } }),
      );
      expect(queryBuilder.where).toHaveBeenCalledWith('id = :id', {
        id: 'config-id',
      });
      expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
      expect(mockSystemConfigRepository.save).not.toHaveBeenCalled();
      expect(result).toEqual({
        message: 'System settings updated successfully',
      });
    });

    it('skips the update when no section is given', async () => {
      await service.updateSettings({});

      expect(
        mockSystemConfigRepository.createQueryBuilder,
      ).not.toHaveBeenCalled();
    });

    describe('mail server', () => {
      const savedSections = () =>
        JSON.parse(
          (queryBuilder.setParameter.mock.calls[0] as [string, string])[1],
        ) as { mailServer: Record<string, unknown> };

      it('stores a new password encrypted', async () => {
        await service.updateSettings({
          mailServer: { host: 'smtp.test', password: 's3cret' },
        });

        const { password } = savedSections().mailServer;
        expect(password).not.toBe('s3cret');
        expect(decrypt(password as string)).toBe('s3cret');
      });

      it('keeps the saved password when the field is left empty', async () => {
        await service.updateSettings({
          mailServer: { host: 'smtp.test', password: '' },
        });

        expect(savedSections().mailServer).not.toHaveProperty('password');
      });

      it('refuses to turn on a server without a host or sender', async () => {
        await expect(
          service.updateSettings({
            mailServer: { enabled: true, host: 'smtp.test' },
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(queryBuilder.execute).not.toHaveBeenCalled();
      });

      it('turns on a server whose saved settings are complete', async () => {
        (mockSystemConfigRepository.findOne as jest.Mock).mockResolvedValue({
          id: 'config-id',
          settings: {
            mailServer: { host: 'smtp.test', fromEmail: 'no-reply@test.dev' },
          },
        });

        await service.updateSettings({ mailServer: { enabled: true } });

        expect(savedSections().mailServer).toEqual({ enabled: true });
      });
    });
  });
});
