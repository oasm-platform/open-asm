import { CACHE_STATIC_RESOURCE } from '@/common/constants/app.constants';
import { Optional, Roles, UserContext } from '@/common/decorators/app.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Role } from '@/common/enums/enum';
import type { UserContextPayload } from '@/common/interfaces/app.interface';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SystemConfigsService } from '../system-configs/system-configs.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  ConfirmLogoRequestDto,
  LogoPresignRequestDto,
  LogoPresignResponseDto,
  PresignDownloadQueryDto,
  PresignDownloadResponseDto,
  PresignUploadRequestDto,
  PresignUploadResponseDto,
} from './dto/presign-storage.dto';
import { StorageService } from './storage.service';

const LOGO_MAX_SIZE_BYTES = 5 * 1024 * 1024;

@Controller('storage')
@ApiTags('Storage')
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly systemConfigsService: SystemConfigsService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  private readonly logger = new Logger(StorageController.name);

  private readonly allowedImageExtensions = [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'svg',
  ];

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
  @Roles(Role.ADMIN)
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
      dto.contentType ?? this.getMimeType(extension) ?? `image/${extension}`;

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
  @Roles(Role.ADMIN)
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
    const previous = await this.systemConfigsService.getConfig();
    await this.systemConfigsService.updateConfig({ logoPath: path });

    const previousSegments = previous.logoPath?.split('/') ?? [];
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

  @Post('presign/upload')
  @ApiOperation({
    summary: 'Create a presigned URL for direct-to-storage upload',
  })
  @ApiBody({ type: PresignUploadRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Presigned upload URL created successfully',
    type: PresignUploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file name, extension, or bucket',
  })
  @ApiResponse({ status: 403, description: 'Bucket is not accessible' })
  @Roles(Role.ADMIN)
  async presignUpload(
    @Body() dto: PresignUploadRequestDto,
  ): Promise<PresignUploadResponseDto> {
    const bucket = dto.bucket ?? 'default';

    this.storageService.assertBucketAllowed(bucket);
    this.storageService.assertBucketNotPrivate(bucket);

    const key = this.storageService.generateObjectKey(dto.fileName);
    const { url, expiresIn } = await this.storageService.getPresignedUploadUrl({
      bucket,
      key,
      contentType: dto.contentType,
    });

    return {
      uploadUrl: url,
      key,
      path: `${bucket}/${key}`,
      contentType: dto.contentType ?? 'application/octet-stream',
      expiresIn,
    };
  }

  // NOTE: declared before the ':bucket/:path*' wildcards on purpose — Nest/Express
  // matches routes in declaration order, otherwise this literal path is swallowed.
  @Get('presign/download')
  @ApiOperation({
    summary: 'Create a presigned URL for direct-from-storage download',
  })
  @ApiQuery({ name: 'bucket', type: String, required: true })
  @ApiQuery({ name: 'path', type: String, required: true })
  @ApiQuery({
    name: 'fileName',
    type: String,
    required: false,
    description: 'Suggested download file name',
  })
  @ApiResponse({
    status: 200,
    description: 'Presigned download URL created successfully',
    type: PresignDownloadResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid path or bucket' })
  @ApiResponse({ status: 403, description: 'Bucket is not accessible' })
  async presignDownload(
    @Query() query: PresignDownloadQueryDto,
  ): Promise<PresignDownloadResponseDto> {
    this.storageService.assertBucketAllowed(query.bucket);
    this.storageService.assertBucketNotPrivate(query.bucket);

    const { url, expiresIn } = await this.storageService.getPresignedDownloadUrl({
      bucket: query.bucket,
      key: query.path,
      fileName: query.fileName,
    });

    return { downloadUrl: url, expiresIn };
  }

  @Optional()
  @Get(':bucket/:path')
  @ApiOperation({ summary: 'Get a file from storage' })
  @ApiParam({ name: 'bucket', type: String, required: true })
  @ApiParam({ name: 'path', type: String, required: true })
  @ApiResponse({
    status: 200,
    description: 'File retrieved successfully',
    content: {
      'application/octet-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'File not found',
  })
  async getFile(
    @Param('bucket') bucket: string,
    @Param('path') path: string,
    @Res({ passthrough: true })
    res: { set: (headers: Record<string, string>) => void },
    @UserContext() user?: UserContextPayload,
  ): Promise<StreamableFile> {
    if (!path) {
      throw new NotFoundException('File path is required');
    }

    const cleanPath = path.replace(/^\/+/, '');
    await this.authorizeRead(bucket, cleanPath, user);
    const file = await this.storageService.getFile(cleanPath, bucket);

    const extension = cleanPath.split('.').pop()?.toLowerCase();
    if (extension) {
      const mimeType = this.getMimeType(extension);
      if (mimeType) {
        res.set({
          'Content-Type': mimeType,
          'Cache-Control': `max-age=${CACHE_STATIC_RESOURCE}, no-transform`,
        });
      }
    }

    return file;
  }

  /**
   * Shared read authorization for `getFile` and (later) `presignDownload`.
   * Bucket classes come from `StorageService.getBucketAccess`; tenant objects
   * authorize membership of ANY owning workspace because screenshot keys can
   * collide across workspaces.
   */
  private async authorizeRead(
    bucket: string,
    key: string,
    user?: UserContextPayload,
  ): Promise<void> {
    const access = this.storageService.getBucketAccess(bucket);
    switch (access) {
      case 'public':
        return;
      case 'private':
        throw new ForbiddenException('Access denied');
      case 'blocked':
        throw new NotFoundException('File not found');
      case 'authenticated':
        if (!user) {
          throw new UnauthorizedException();
        }
        return;
      case 'tenant': {
        if (!user) {
          throw new UnauthorizedException();
        }
        const workspaceIds =
          await this.storageService.resolveObjectWorkspaceIds(bucket, key);
        if (workspaceIds.length === 0) {
          throw new NotFoundException('File not found');
        }
        for (const workspaceId of workspaceIds) {
          try {
            await this.workspacesService.getMembershipWithPermissions(
              workspaceId,
              user.id,
            );
            return;
          } catch (error) {
            if (!(error instanceof NotFoundException)) {
              throw error;
            }
          }
        }
        throw new ForbiddenException('Access denied');
      }
    }
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

    return contentType === this.getMimeType(extension);
  }

  private getMimeType(extension?: string): string | undefined {
    if (!extension) return undefined;

    const mimeTypes: { [key: string]: string } = {
      // Images
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',

      // Documents
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',

      // Archives
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed',

      // Audio/Video
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      mp4: 'video/mp4',
      webm: 'video/webm',

      // Code
      json: 'application/json',
      xml: 'application/xml',
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      ts: 'application/typescript',
    };

    return mimeTypes[extension.toLowerCase()];
  }
}
