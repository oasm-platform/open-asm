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
import { StorageService } from './storage.service';

@Controller('storage')
@ApiTags('Storage')
export class StorageController {
  private readonly restrictedExtensions = [
    'exe',
    'dll',
    'bat',
    'sh',
    'js',
    'php',
    'py',
    'pl',
    'rb',
    'jar',
  ];

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

  @Post('logo')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload app logo to system bucket' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Logo uploaded successfully',
    type: DefaultMessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file type or extension',
  })
  @Roles(Role.ADMIN)
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DefaultMessageResponseDto> {
    // Get file extension
    const lastDotIndex = file.originalname.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === file.originalname.length - 1) {
      throw new BadRequestException('Invalid file extension');
    }

    const extension = file.originalname.slice(lastDotIndex + 1).toLowerCase();

    // Check if extension is allowed (only images)
    if (!this.allowedImageExtensions.includes(extension)) {
      throw new BadRequestException(
        `File type .${extension} is not allowed. Only image files are supported.`,
      );
    }

    // Upload file with fixed filename "logo.{extension}" to "system" bucket
    const filename = `logo-${randomUUID()}.${extension}`;
    const bucket = 'system';
    const result = await this.storageService.uploadFile(
      filename,
      file.buffer,
      bucket,
    );

    // Update system config with new logo path
    await this.systemConfigsService.updateConfig({
      logoPath: result.path,
    });

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
    if (this.restrictedExtensions.includes(extension)) {
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
