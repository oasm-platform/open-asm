import { CACHE_STATIC_RESOURCE } from '@/common/constants/app.constants';
import { Public, Roles } from '@/common/decorators/app.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Role } from '@/common/enums/enum';
import {
  BadRequestException,
  Body,
  Controller,
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
    const result = this.storageService.uploadFile(
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
  uploadFile(
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
    const result = this.storageService.uploadFile(
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
  getFile(
    @Param('bucket') bucket: string,
    @Param('path') path: string,
    @Res({ passthrough: true })
    res: { set: (headers: Record<string, string>) => void },
  ): StreamableFile {
    if (!path) {
      throw new NotFoundException('File path is required');
    }

    // Remove any leading slashes from the path
    const cleanPath = path.replace(/^\/+/, '');
    const file = this.storageService.getFile(cleanPath, bucket);

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

  @Public()
  @Get('forward')
  @ApiOperation({ summary: 'Forward an image from a URL' })
  @ApiQuery({
    name: 'url',
    type: String,
    required: true,
    description: 'The URL of the image to forward',
  })
  @ApiResponse({
    status: 200,
    description: 'Image forwarded successfully',
    content: {
      'image/*': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - URL is required or invalid',
  })
  @ApiResponse({
    status: 404,
    description: 'Image not found at the provided URL',
  })
  async forwardImage(
    @Query('url') url: string,
    @Res({ passthrough: true })
    res: { set: (headers: Record<string, string>) => void },
  ): Promise<StreamableFile> {
    // Validate URL
    if (!url) {
      throw new BadRequestException('URL query parameter is required');
    }

    try {
      const { buffer, contentType } =
        await this.storageService.forwardImage(url);

      // Set the content type header
      res.set({
        'Content-Type': contentType,
        'Cache-Control': `max-age=${CACHE_STATIC_RESOURCE}, no-transform`,
      });

      // Return the image as a StreamableFile
      return new StreamableFile(buffer);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      // Handle network errors or other unexpected errors
      throw new BadRequestException(
        'Failed to fetch image from the provided URL',
      );
    }
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
