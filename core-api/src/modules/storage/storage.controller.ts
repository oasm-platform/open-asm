import { Roles, UserContext } from '@/common/decorators/app.decorator';
import { Role } from '@/common/enums/enum';
import type { UserContextPayload } from '@/common/interfaces/app.interface';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  PresignDownloadQueryDto,
  PresignDownloadResponseDto,
  PresignUploadRequestDto,
  PresignUploadResponseDto,
} from './dto/presign-storage.dto';
import { StorageService } from './storage.service';

@Controller('storage')
@ApiTags('Storage')
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly workspacesService: WorkspacesService,
  ) {}

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
    @UserContext() user?: UserContextPayload,
  ): Promise<PresignDownloadResponseDto> {
    this.storageService.assertBucketAllowed(query.bucket);
    this.storageService.assertBucketNotPrivate(query.bucket);
    await this.authorizeRead(query.bucket, query.path, user);

    const { url, expiresIn } = await this.storageService.getPresignedDownloadUrl({
      bucket: query.bucket,
      key: query.path,
      fileName: query.fileName,
    });

    return { downloadUrl: url, expiresIn };
  }

  /**
   * Shared read authorization for `presignDownload`.
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
      default:
        throw new ForbiddenException('Access denied');
    }
  }
}
