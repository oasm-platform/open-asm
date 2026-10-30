import { Roles } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Role } from '@/common/enums/enum';
import { StorageService } from '@/modules/storage/storage.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ConfirmLogoRequestDto,
  LogoPresignRequestDto,
  LogoPresignResponseDto,
  SendTestMailDto,
  SystemConfigResponseDto,
  SystemSettingsDto,
  UpdateSystemConfigDto,
} from './dto/system-configs.dto';
import { MailService } from './mail.service';
import { SystemConfigsService } from './system-configs.service';

const LOGO_MAX_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Controller for system configuration management
 * All endpoints require ADMIN role
 */
@ApiTags('System Configs')
@Controller('admin/system-configs')
@Roles(Role.ADMIN)
export class SystemConfigsController {
  constructor(
    private readonly systemConfigsService: SystemConfigsService,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
  ) {}

  private readonly logger = new Logger(SystemConfigsController.name);

  private readonly allowedImageExtensions = [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'svg',
  ];

  /**
   * Get system configuration
   * @returns System configuration data
   */
  @Get()
  @Doc<SystemConfigResponseDto>({
    summary: 'Get system configuration',
    description: 'Retrieves the current system configuration settings',
    response: {
      serialization: SystemConfigResponseDto,
    },
  })
  async getConfig(): Promise<SystemConfigResponseDto> {
    return this.systemConfigsService.getConfig();
  }

  /**
   * Update system configuration
   * @param dto Update data
   * @returns Success message
   */
  @Put()
  @Doc<DefaultMessageResponseDto>({
    summary: 'Update system configuration',
    description: 'Updates the system configuration settings',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  async updateConfig(
    @Body() dto: UpdateSystemConfigDto,
  ): Promise<DefaultMessageResponseDto> {
    return this.systemConfigsService.updateConfig(dto);
  }

  /**
   * Get feature settings
   * @returns Settings keyed by section, defaults filled in
   */
  @Get('settings')
  @Doc<SystemSettingsDto>({
    summary: 'Get system settings',
    description:
      'Retrieves feature settings keyed by section, with defaults filled in',
    response: {
      serialization: SystemSettingsDto,
    },
  })
  async getSettings(): Promise<SystemSettingsDto> {
    return this.systemConfigsService.getSettingsView();
  }

  /**
   * Update feature settings
   * @param dto Sections to update
   * @returns Success message
   */
  @Patch('settings')
  @Doc<DefaultMessageResponseDto>({
    summary: 'Update system settings',
    description:
      'Merges the given sections into the stored settings; fields left out keep their value',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  async updateSettings(
    @Body() dto: SystemSettingsDto,
  ): Promise<DefaultMessageResponseDto> {
    return this.systemConfigsService.updateSettings(dto);
  }

  /**
   * Send a test email through the saved mail server
   * @param dto Recipient
   * @returns Success message
   */
  @Post('settings/mail-server/test')
  @Doc<DefaultMessageResponseDto>({
    summary: 'Send a test email',
    description:
      'Sends a test email through the saved mail server; a failure returns the server reason',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  async sendTestMail(
    @Body() dto: SendTestMailDto,
  ): Promise<DefaultMessageResponseDto> {
    return this.mailService.sendTest(dto.to);
  }

  /**
   * Remove system logo and revert to default avatar
   * @returns Success message
   */
  @Delete('logo')
  @Doc<DefaultMessageResponseDto>({
    summary: 'Remove system logo',
    description: 'Removes the system logo and reverts to default avatar',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  async removeLogo(): Promise<DefaultMessageResponseDto> {
    return this.systemConfigsService.removeLogo();
  }

  @Post('logo/presign')
  @ApiOperation({
    summary: 'Create a presigned URL for direct app-logo upload',
  })
  @ApiBody({ type: LogoPresignRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Presigned logo upload URL created successfully',
    type: LogoPresignResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file name or extension' })
  async presignLogoUpload(
    @Body() dto: LogoPresignRequestDto,
  ): Promise<LogoPresignResponseDto> {
    const bucket = 'system';
    const key = this.storageService.generateObjectKey(dto.fileName, {
      prefix: 'logo',
      allowedExtensions: this.allowedImageExtensions,
    });

    const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
    const contentType =
      dto.contentType ?? this.storageService.resolveMimeType(extension);

    const { url, path, expiresIn } =
      await this.storageService.getPresignedUploadUrl({
        bucket,
        key,
        contentType,
      });

    return { uploadUrl: url, key, path, expiresIn };
  }

  @Post('logo/confirm')
  @ApiOperation({
    summary: 'Confirm a directly-uploaded app logo and activate it',
  })
  @ApiBody({ type: ConfirmLogoRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Logo uploaded successfully',
    type: DefaultMessageResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid key, content type, or size' })
  @ApiResponse({ status: 404, description: 'Uploaded object not found' })
  async confirmLogoUpload(
    @Body() dto: ConfirmLogoRequestDto,
  ): Promise<DefaultMessageResponseDto> {
    const key = dto.key?.trim();
    if (!key || key.includes('/') || key.includes('\\') || key.includes('..')) {
      throw new BadRequestException('Invalid key');
    }

    const bucket = 'system';
    const { contentType, contentLength } = await this.storageService.headObject(
      bucket,
      key,
    );

    if (!this.isAllowedImageContentType(key, contentType)) {
      throw new BadRequestException('Only image files are supported');
    }
    if (contentLength > LOGO_MAX_SIZE_BYTES) {
      throw new BadRequestException(
        `File size exceeds the ${LOGO_MAX_SIZE_BYTES / (1024 * 1024)}MB limit`,
      );
    }

    const path = `${bucket}/${key}`;
    const previousLogoPath =
      await this.systemConfigsService.getRawLogoPath();
    await this.systemConfigsService.updateConfig({ logoPath: path });

    const previousSegments = previousLogoPath?.split('/') ?? [];
    const previousKey = previousSegments.at(-1);
    const previousBucket = previousSegments.at(-2) ?? bucket;
    if (previousKey && previousKey !== key) {
      try {
        await this.storageService.deleteFile(previousKey, previousBucket);
      } catch (error) {
        this.logger.warn(
          `Failed to delete previous logo ${previousKey} in bucket ${previousBucket}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return { message: 'Logo uploaded successfully' };
  }

  /**
   * Acceptance rule for an uploaded logo: the stored `ContentType` must be
   * exactly the MIME type that the key's own extension maps to, and that
   * extension must be in the image allow-list. A bare `image/` prefix is not
   * enough, so an `image/svg+xml` object behind a `.png` key is rejected.
   */
  private isAllowedImageContentType(
    key: string,
    contentType: string | null | undefined,
  ): boolean {
    const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
    if (!this.allowedImageExtensions.includes(extension)) {
      return false;
    }

    return contentType === this.storageService.resolveMimeType(extension);
  }
}
