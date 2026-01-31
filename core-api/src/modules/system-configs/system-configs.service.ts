import { STORAGE_BASE_PATH } from '@/common/constants/app.constants';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
export class SystemConfigsService {
  private static readonly DEFAULT_SYSTEM_NAME = 'OASM';

  constructor(
    @InjectRepository(SystemConfig)
    private readonly systemConfigRepository: Repository<SystemConfig>,
  ) {}

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
    config.logoPath = null;

    await this.systemConfigRepository.save(config);

    return { message: 'System logo removed successfully' };
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
}
