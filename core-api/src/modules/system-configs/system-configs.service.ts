import {
  GITHUB_REPO,
  STORAGE_BASE_PATH,
} from '@/common/constants/app.constants';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { ReleaseVersion } from '@/common/interfaces/app.interface';
import { RedisService } from '@/services/redis/redis.service';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import {
  SystemConfigResponseDto,
  UpdateSystemConfigDto,
} from './dto/system-configs.dto';
import { SystemConfig } from './entities/system-config.entity';

/**
 * Service for managing system configuration
 * Implements singleton pattern - only one config record exists
 */
@Injectable()
export class SystemConfigsService implements OnModuleInit {
  private static readonly DEFAULT_SYSTEM_NAME = 'OASM';
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

    return {
      name: config.name,
      logoPath: config.logoPath
        ? `${STORAGE_BASE_PATH}/${config.logoPath}`
        : null,
    };
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
      this.storageService.deleteFile(fileName, bucket);
      config.logoPath = null;
      await this.systemConfigRepository.save(config);
      return { message: 'System logo removed successfully' };
    }
    return { message: 'No system logo to remove' };
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
