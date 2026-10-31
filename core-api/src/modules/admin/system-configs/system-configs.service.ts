import { GITHUB_REPO } from '@/common/constants/app.constants';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { ReleaseVersion } from '@/common/interfaces/app.interface';
import { encrypt } from '@/common/utils/encryption.util';
import { RedisService } from '@/services/redis/redis.service';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { StorageService } from '@/modules/storage/storage.service';
import {
  MailProvider,
  MailServerSettingsDto,
  SystemConfigResponseDto,
  SystemSettingsDto,
  UpdateSystemConfigDto,
} from './dto/system-configs.dto';
import { SystemConfig, SystemSettings } from './entities/system-config.entity';

/** Stored `settings.mailServer`; `password` is encrypted */
export interface MailServerConfig {
  enabled: boolean;
  provider: MailProvider;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password?: string;
  fromEmail: string;
  fromName: string;
}

/**
 * Service for managing system configuration
 * Implements singleton pattern - only one config record exists
 */
@Injectable()
export class SystemConfigsService implements OnModuleInit {
  private static readonly DEFAULT_SYSTEM_NAME = 'OASM';
  /** Defaults per settings section; stored fields override them */
  private static readonly DEFAULT_SETTINGS: SystemSettings = {
    auth: { allowSignUp: false },
    mailServer: {
      enabled: false,
      provider: MailProvider.SMTP,
      host: '',
      port: 587,
      secure: false,
      username: '',
      fromEmail: '',
      fromName: '',
    },
  };
  private readonly logger = new Logger(SystemConfigsService.name);

  constructor(
    @InjectRepository(SystemConfig)
    private readonly systemConfigRepository: Repository<SystemConfig>,
    private storageService: StorageService,
    private redisService: RedisService,
  ) {}

  async onModuleInit() {
    await this.checkUpdate();
  }

  /**
   * Get the system configuration
   * Creates default config if none exists
   * @returns System configuration response
   */
  async getConfig(): Promise<SystemConfigResponseDto> {
    const config = await this.findOrCreateConfig();

    if (!config.logoPath) {
      return { name: config.name, logoPath: null };
    }

    const url = await this.storageService.signStoragePath(config.logoPath);
    return { name: config.name, logoPath: url };
  }

  /**
   * Raw stored logo path (`system/<file>`) for internal consumers that need
   * the real bucket/key (e.g. deleting the previous logo object). Never
   * returns the client URL that `getConfig()` emits.
   */
  async getRawLogoPath(): Promise<string | null> {
    const config = await this.findOrCreateConfig();
    return config.logoPath ?? null;
  }

  /**
   * Update the system configuration
   * Creates default config if none exists before updating
   * @param dto Update data
   * @returns Success message
   */
  async updateConfig(
    dto: UpdateSystemConfigDto,
  ): Promise<DefaultMessageResponseDto> {
    const config = await this.findOrCreateConfig();
    config.name = dto.name || SystemConfigsService.DEFAULT_SYSTEM_NAME;

    // Handle logoPath update: allow null to clear the logo, and string values to update it
    if (dto.logoPath !== undefined) {
      config.logoPath = dto.logoPath; // Can be string or null
    }

    await this.systemConfigRepository.save(config);

    return { message: 'System configuration updated successfully' };
  }

  /**
   * Remove the system logo and revert to default avatar
   * Creates default config if none exists before updating
   * @returns Success message
   */
  async removeLogo(): Promise<DefaultMessageResponseDto> {
    const config = await this.findOrCreateConfig();
    if (config.logoPath) {
      const [bucket, fileName] = config.logoPath.split('/');
      await this.storageService.deleteFile(fileName, bucket);
      config.logoPath = null;
      await this.systemConfigRepository.save(config);
      return { message: 'System logo removed successfully' };
    }
    return { message: 'No system logo to remove' };
  }

  /**
   * Get feature settings with each section's defaults filled in
   * @returns Settings keyed by section
   */
  async getSettings(): Promise<SystemSettings> {
    const config = await this.findOrCreateConfig();
    const defaults = SystemConfigsService.DEFAULT_SETTINGS;
    const stored = config.settings ?? {};
    const sections = new Set([
      ...Object.keys(defaults),
      ...Object.keys(stored),
    ]);

    return Object.fromEntries(
      [...sections].map((section) => [
        section,
        { ...defaults[section], ...stored[section] },
      ]),
    );
  }

  /**
   * Feature settings as the admin API shows them: the mail server password is
   * left out, and `mailServer.hasPassword` tells whether one is saved
   * @returns Settings keyed by section
   */
  async getSettingsView(): Promise<SystemSettings> {
    const settings = await this.getSettings();
    const { password, ...mailServer } = settings.mailServer ?? {};
    return {
      ...settings,
      mailServer: { ...mailServer, hasPassword: !!password },
    };
  }

  /** The mail server with defaults filled in; `password` stays encrypted */
  async getMailServer(): Promise<MailServerConfig> {
    const { mailServer } = await this.getSettings();
    return mailServer as unknown as MailServerConfig;
  }

  /**
   * Whether public sign-up is open: an admin allows it (`auth.allowSignUp`,
   * off by default) and the mail server is on to send verification emails
   */
  async isSignUpAllowed(): Promise<boolean> {
    const { auth, mailServer } = await this.getSettings();
    return auth?.allowSignUp === true && mailServer?.enabled === true;
  }

  /**
   * Merge the given sections into the stored settings in one statement, so
   * concurrent saves of different sections or fields don't overwrite each
   * other. Fields left out of a section keep their stored value.
   * @param dto Sections to update
   * @returns Success message
   */
  async updateSettings(
    dto: SystemSettingsDto,
  ): Promise<DefaultMessageResponseDto> {
    const patch = { ...(dto as SystemSettings) };
    if (dto.mailServer) {
      patch.mailServer = await this.prepareMailServerPatch(dto.mailServer);
    }
    const sections = Object.entries(patch).filter(
      ([, value]) => value !== undefined && value !== null,
    );

    if (sections.length > 0) {
      const config = await this.findOrCreateConfig();
      await this.systemConfigRepository
        .createQueryBuilder()
        .update()
        .set({
          settings: () =>
            `settings || (SELECT jsonb_object_agg(s.key, COALESCE(settings -> s.key, '{}'::jsonb) || s.value) FROM jsonb_each(CAST(:sections AS jsonb)) s)`,
        })
        .setParameter('sections', JSON.stringify(Object.fromEntries(sections)))
        .where('id = :id', { id: config.id })
        .execute();
    }

    return { message: 'System settings updated successfully' };
  }

  /**
   * Encrypts a new password (an empty one keeps the saved password) and
   * refuses to turn on a mail server that has no host or sender address.
   */
  private async prepareMailServerPatch(
    dto: MailServerSettingsDto,
  ): Promise<Record<string, unknown>> {
    const { password, ...rest } = dto;
    const patch: Record<string, unknown> = { ...rest };
    if (password) patch.password = encrypt(password);

    const merged = { ...(await this.getMailServer()), ...patch };
    if (merged.enabled && (!merged.host || !merged.fromEmail)) {
      throw new BadRequestException(
        'Set a host and a sender email before turning on the mail server',
      );
    }
    return patch;
  }

  /**
   * Find existing config or create default if not exists
   * @returns System config entity
   */
  private async findOrCreateConfig(): Promise<SystemConfig> {
    let config = await this.systemConfigRepository.findOne({
      where: {},
    });

    if (!config) {
      config = this.systemConfigRepository.create({
        name: SystemConfigsService.DEFAULT_SYSTEM_NAME,
        logoPath: undefined,
      });
      await this.systemConfigRepository.save(config);
    }

    return config;
  }

  /**
   * Check for version updates from GitHub
   * Runs daily at 3 AM via cron job
   * Only fetches from GitHub if:
   * - No cached version exists in Redis
   * - Last check was more than 12 hours ago
   */
  @Cron('0 3 * * *')
  private async checkUpdate(): Promise<void> {
    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    try {
      // Get last_check and cached version from Redis
      const lastCheckStr = await this.redisService.get('version:last_check');
      const cachedVersion = await this.redisService.get('version:latest');

      let shouldFetch = false;

      if (!lastCheckStr || !cachedVersion) {
        // No previous check or cache is null -> fetch
        shouldFetch = true;
      } else {
        const lastCheck = new Date(lastCheckStr);
        if (lastCheck < twelveHoursAgo) {
          // More than 12 hours since last check -> fetch
          shouldFetch = true;
        }
      }

      if (shouldFetch) {
        const latestVersion = await this.getLatestVersion();

        if (latestVersion) {
          // Set last_check = now
          await this.redisService.set('version:last_check', now.toISOString());
          // Set version with no expiry (TTL = 0 means never expire)
          await this.redisService.set(
            'version:latest',
            JSON.stringify(latestVersion),
          );

          this.logger.log(
            `Version checked and updated: ${latestVersion.tag_name}`,
          );
        }
      } else {
        this.logger.log('Version check skipped (within 12 hours)');
      }
    } catch (error) {
      this.logger.error('Error during version check:', error);
    }
  }

  private async getLatestVersion(): Promise<ReleaseVersion | null> {
    const apiUrlGithubReleaseLatestVersion = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
    try {
      const response = await axios.get(apiUrlGithubReleaseLatestVersion);
      return response.data as ReleaseVersion;
    } catch (error) {
      this.logger.error('Error fetching latest version:', error);
      return null;
    }
  }
}
