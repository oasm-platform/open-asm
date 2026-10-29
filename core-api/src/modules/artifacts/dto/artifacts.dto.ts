import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import {
  ArtifactListScope,
  ArtifactShareType,
  ArtifactSource,
  ArtifactStatus,
} from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class PresignArtifactDto {
  @ApiProperty({ example: 'report.pdf' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: 1024, description: 'Exact file size in bytes' })
  @IsInt()
  @Min(0)
  sizeBytes: number;

  @ApiProperty({ example: 'application/pdf' })
  @Matches(/^[\w.+-]+\/[\w.+-]+$/, { message: 'contentType must be a MIME type' })
  @MaxLength(255)
  contentType: string;

  @ApiProperty({ required: false, description: 'Target folder; root when omitted' })
  @IsOptional()
  @IsUUID()
  parentFolderId?: string;
}

export class UpdateArtifactDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ enum: ArtifactShareType, required: false })
  @IsOptional()
  @IsEnum(ArtifactShareType)
  shareType?: ArtifactShareType;

  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    description: 'Move into this folder; null moves to the root',
  })
  @IsOptional()
  @IsUUID()
  parentFolderId?: string | null;
}

/** Users only change access; renames and moves are for internal services. */
export class UpdateArtifactAccessDto {
  @ApiProperty({ enum: ArtifactShareType })
  @IsEnum(ArtifactShareType)
  shareType: ArtifactShareType;
}

export class ShareArtifactDto {
  @ApiProperty({ type: [String], example: ['alice@example.com'] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  emails: string[];
}

export class GetArtifactsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({
    enum: ArtifactListScope,
    required: false,
    default: ArtifactListScope.MINE,
  })
  @IsOptional()
  @IsEnum(ArtifactListScope)
  scope: ArtifactListScope = ArtifactListScope.MINE;

  @ApiProperty({
    required: false,
    description: 'Folder to browse in `mine` (root when omitted; ignored while searching)',
  })
  @IsOptional()
  @IsUUID()
  parentFolderId?: string;
}

export class CreateArtifactFolderDto {
  @ApiProperty({ example: 'Reports' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false, description: 'Parent folder; root when omitted' })
  @IsOptional()
  @IsUUID()
  parentFolderId?: string;
}

export class UpdateArtifactFolderDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    description: 'Move under this folder; null moves to the root',
  })
  @IsOptional()
  @IsUUID()
  parentFolderId?: string | null;
}

export class GetArtifactFoldersQueryDto {
  @ApiProperty({ required: false, description: 'Parent folder; root when omitted' })
  @IsOptional()
  @IsUUID()
  parentFolderId?: string;
}

export class UpdateStorageQuotaDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Quota in bytes; null resets to the server default',
  })
  @ValidateIf((dto: UpdateStorageQuotaDto) => dto.quotaBytes !== null)
  @IsInt()
  @Min(0)
  quotaBytes: number | null;
}

export class ArtifactUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true, type: String })
  image: string | null;
}

export class ArtifactDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty({ enum: ArtifactSource })
  source: ArtifactSource;

  @ApiProperty({ enum: ArtifactShareType })
  shareType: ArtifactShareType;

  @ApiProperty({ enum: ArtifactStatus })
  status: ArtifactStatus;

  @ApiProperty({ type: ArtifactUserDto, nullable: true })
  createdBy: ArtifactUserDto | null;

  @ApiProperty({ nullable: true, type: String })
  parentFolderId: string | null;

  @ApiProperty({ description: 'Whether the current user created the file' })
  isOwner: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ArtifactUploadDto {
  @ApiProperty({ description: 'POST target for the multipart form upload' })
  url: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Form fields to send before the `file` field',
  })
  fields: Record<string, string>;

  @ApiProperty()
  expiresAt: Date;
}

export class PresignArtifactResponseDto {
  @ApiProperty({ type: ArtifactDto })
  artifact: ArtifactDto;

  @ApiProperty({ type: ArtifactUploadDto })
  upload: ArtifactUploadDto;
}

export class ArtifactDownloadDto {
  @ApiProperty()
  url: string;

  @ApiProperty()
  expiresIn: number;
}

export class ShareArtifactResponseDto {
  @ApiProperty({ description: 'Workspace members the request shared the file with' })
  shared: number;

  @ApiProperty({
    description: 'Emails ignored: not a workspace member, or the owner',
  })
  skipped: number;
}

export class ArtifactUsageBySourceDto {
  @ApiProperty({ enum: ArtifactSource })
  source: ArtifactSource;

  @ApiProperty()
  bytes: number;
}

export class ArtifactUsageByUserDto {
  @ApiProperty({ type: ArtifactUserDto, nullable: true })
  user: ArtifactUserDto | null;

  @ApiProperty()
  bytes: number;
}

export class ArtifactUsageDto {
  @ApiProperty()
  quotaBytes: number;

  @ApiProperty()
  usedBytes: number;

  @ApiProperty()
  reservedBytes: number;

  @ApiProperty()
  maxFileBytes: number;

  @ApiProperty({ type: [ArtifactUsageBySourceDto] })
  bySource: ArtifactUsageBySourceDto[];

  @ApiProperty({ type: [ArtifactUsageByUserDto] })
  byUser: ArtifactUsageByUserDto[];
}

export class WorkspaceStorageQuotaDto {
  @ApiProperty()
  workspaceId: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Override in bytes; null means the server default applies',
  })
  quotaBytes: number | null;
}

export class ArtifactFolderDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true, type: String })
  parentFolderId: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ArtifactFolderPathItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class ArtifactFolderDetailDto extends ArtifactFolderDto {
  @ApiProperty({
    type: [ArtifactFolderPathItemDto],
    description: 'Breadcrumb from the top-level folder down to this one',
  })
  path: ArtifactFolderPathItemDto[];
}
