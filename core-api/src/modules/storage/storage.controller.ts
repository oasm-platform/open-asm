import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/app.decorator';
import { Role } from 'src/common/enums/enum';
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

  constructor(private readonly storageService: StorageService) {}

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
      },
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
          example: '/storage/9bea7ee3-ddc3-4215-a9e6-74fa7b5be92f.png',
        },
      },
    },
  })
  @Roles(Role.ADMIN)
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    // Get file extension
    const extension = file.originalname.split('.').pop()?.toLowerCase();

    // Check if extension is restricted
    if (extension && this.restrictedExtensions.includes(extension)) {
      throw new BadRequestException(`File type .${extension} is not allowed`);
    }

    const result = this.storageService.uploadFile(file);
    return { path: result.path };
  }
}
