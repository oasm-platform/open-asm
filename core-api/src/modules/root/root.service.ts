import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Role } from '@/common/enums/enum';
import { ReleaseVersion } from '@/common/interfaces/app.interface';
import { RedisService } from '@/services/redis/redis.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAssistantService } from '../ai-assistant/ai-assistant.service';
import { SystemConfigsService } from '../system-configs/system-configs.service';
import { UsersService } from '../users/users.service';
import {
  CreateFirstAdminDto,
  GetMetadataDto,
  GetVersionDto,
} from './dto/root.dto';

@Injectable()
export class RootService {
  constructor(
    private readonly usersService: UsersService,
    private readonly aiAssistantService: AiAssistantService,
    private readonly systemConfigsService: SystemConfigsService,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {}

  public getHealth(): string {
    return 'OK';
  }

  /**
   * Creates the first admin user in the system.
   * @param dto The data transfer object containing the email and password for the admin user.
   * @returns A promise that resolves to a default message response dto.
   */
  public async createFirstAdmin(
    dto: CreateFirstAdminDto,
  ): Promise<DefaultMessageResponseDto> {
    const { email, password } = dto;
    await this.usersService.createFirstAdmin(email, password);
    return {
      message: 'Admin user created successfully',
    };
  }

  /**
   * Get system metadata.
   * @returns A promise that resolves to a get metadata dto.
   */
  public async getMetadata(): Promise<GetMetadataDto> {
    const MILLISECONDS_PER_SECOND = 100;
    const SECONDS_PER_MINUTE = 60;
    const MINUTES_PER_HOUR = 60;
    const HOURS_PER_DAY = 24;
    const DAYS_PER_YEAR = 365;

    const userCount = await this.usersService.usersRepository.count({
      where: {
        role: Role.ADMIN,
      },
      cache: {
        id: 'isInit',
        milliseconds:
          MILLISECONDS_PER_SECOND *
          SECONDS_PER_MINUTE *
          MINUTES_PER_HOUR *
          HOURS_PER_DAY *
          DAYS_PER_YEAR,
      },
    });
    let isAssistant = false;
    try {
      const health = await this.aiAssistantService.healthCheck();
      isAssistant = health.message === 'ok';
    } catch {
      isAssistant = false;
    }

    const systemConfig = await this.systemConfigsService.getConfig();

    const currentVersion = this.configService.get<string>('APP_VERSION');

    return {
      isInit: userCount > 0,
      isAssistant,
      name: systemConfig.name,
      logoPath: systemConfig.logoPath,
      currentVersion: currentVersion || null,
    };
  }

  /**
   * Get the latest version from Redis.
   * @returns A promise that resolves to the latest version data.
   * @throws NotFoundException if the version data is not found.
   */
  public async getLatestVersion(): Promise<GetVersionDto> {
    const VERSION_KEY = 'version:latest';
    const isDeveloperMode =
      this.configService.get<string>('NODE_ENV') === 'development';
    const data = await this.redisService.get(VERSION_KEY);

    if (!data) {
      throw new NotFoundException('Version data not found');
    }

    const parsed = JSON.parse(data) as ReleaseVersion;

    const latestVersion = parsed.tag_name.replace('v', '') || null;

    const currentVersion = isDeveloperMode
      ? latestVersion
      : this.configService.get<string>('APP_VERSION') || null;

    return {
      currentVersion,
      latestVersion,
      isLatest: currentVersion === latestVersion,
      notes: parsed.body,
      releaseDate: parsed.published_at,
    };
  }
}
