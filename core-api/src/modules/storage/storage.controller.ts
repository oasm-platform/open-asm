import { CACHE_STATIC_RESOURCE } from '@/common/constants/app.constants';
import { Public, Roles } from '@/common/decorators/app.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Role } from '@/common/enums/enum';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { SystemConfigsService } from '../system-configs/system-configs.service';
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
  ) {}

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

    if (!contentType?.startsWith('image/')) {
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
      } catch {
        // A stale object must never fail the confirmation.
      }
    }

    return { message: 'Logo uploaded successfully' };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file to storage' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        bucket: {
          type: 'string',
          description: 'Bucket name (default: "default")',
          example: 'default',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'File uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          example: 'default/9bea7ee3-ddc3-4215-a9e6-74fa7b5be92f.png',
        },
        bucket: {
          type: 'string',
          example: 'default',
        },
        fullPath: {
          type: 'string',
          example: '/default/9bea7ee3-ddc3-4215-a9e6-74fa7b5be92f.png',
        },
      },
    },
  })
  @Roles(Role.ADMIN)
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('bucket') bucket: string = 'default',
  ) {
    // Get file extension
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension) {
      throw new BadRequestException('Invalid file extension');
    }

    // Check if extension is restricted
    if (this.storageService.restrictedExtensions.includes(extension)) {
      throw new BadRequestException(`File type .${extension} is not allowed`);
    }

    const filename = `${randomUUID()}.${extension}`;
    const result = await this.storageService.uploadFile(
      filename,
      file.buffer,
      bucket,
    );

    return {
      path: result.path,
      bucket: bucket,
      fullPath: `/${bucket}/${filename}`,
    };
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

  @Public()
  @Get(':bucket/:path/download')
  @ApiOperation({ summary: 'Download a file with time-limited token' })
  @ApiParam({ name: 'bucket', type: String, required: true })
  @ApiParam({ name: 'path', type: String, required: true })
  @ApiQuery({
    name: 'token',
    type: String,
    required: true,
    description: 'Time-limited download token',
  })
  @ApiResponse({
    status: 200,
    description: 'File downloaded successfully',
    content: {
      'application/octet-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async downloadFile(
    @Param('bucket') bucket: string,
    @Param('path') path: string,
    @Query('token') token: string,
    @Res({ passthrough: true })
    res: { set: (headers: Record<string, string>) => void },
  ): Promise<StreamableFile> {
    if (!token) {
      throw new BadRequestException('Download token is required');
    }

    // Verify token and extract bucket/path from it (not from URL params)
    const verified = this.storageService.verifyDownloadToken(token);

    // Token-embedded values take precedence over URL params
    const cleanPath = verified.filePath;
    const fileBucket = verified.bucket;

    const file = await this.storageService.getFile(cleanPath, fileBucket);

    const extension = cleanPath.split('.').pop()?.toLowerCase();
    if (extension) {
      const mimeType = this.getMimeType(extension);
      if (mimeType) {
        res.set({
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${cleanPath.split('/').pop()}"`,
          'Cache-Control': 'no-store',
        });
      }
    }

    return file;
  }

  @Public()
  @Get(':bucket/:path')
  @ApiOperation({ summary: 'Get a file from storage (public)' })
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
  ): Promise<StreamableFile> {
    if (!path) {
      throw new NotFoundException('File path is required');
    }

    if (this.storageService.isPrivateBucket(bucket)) {
      throw new ForbiddenException('Access denied');
    }

    const cleanPath = path.replace(/^\/+/, '');
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
