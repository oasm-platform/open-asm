import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { InvitationStatus } from '@/common/enums/enum';

/** Wildcard, or lowercase domain.action keys, e.g. target.read */
export const PERMISSION_KEY_REGEX = /^\*$|^[a-z]+\.[a-z]+$/;

/** One selectable permission in the catalog: resource.action with a label */
export class PermissionCatalogActionDto {
  @ApiProperty({
    example: 'read',
    description:
      'Action name. Combined with the resource it forms the permission key, e.g. target.read',
  })
  action: string;

  @ApiProperty({ example: 'View scan targets' })
  description: string;
}

/** One resource group in the permission catalog (drives the UI checkboxes) */
export class PermissionCatalogResourceDto {
  @ApiProperty({ example: 'target' })
  resource: string;

  @ApiProperty({ type: () => PermissionCatalogActionDto, isArray: true })
  actions: PermissionCatalogActionDto[];
}

/** Minimal public user shape exposed on workspace member responses */
export class WorkspaceMemberUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true })
  image?: string | null;
}

export class CreatePermissionGroupDto {
  @ApiProperty({ example: 'Viewer' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: ['group.read', 'target.read'],
    description:
      'Permission keys granted by this group. "*" is reserved for the system Admin group.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(PERMISSION_KEY_REGEX, {
    each: true,
    message: 'Invalid permission key. Use "*" or "domain.action" (e.g. target.read)',
  })
  permissions: string[];
}

export class UpdatePermissionGroupDto {
  @ApiProperty({ required: false, example: 'Viewer' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false, example: ['group.read', 'target.read'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(PERMISSION_KEY_REGEX, {
    each: true,
    message: 'Invalid permission key. Use "*" or "domain.action" (e.g. target.read)',
  })
  permissions?: string[];
}

export class UpdateMemberPermissionsDto {
  @ApiProperty({
    example: ['uuid-1', 'uuid-2'],
    description: 'Permission group ids to assign (replaces current groups)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  permissionIds: string[];
}

export class CreateInvitationsDto {
  @ApiProperty({
    example: ['user@example.com'],
    description:
      'Emails of existing users to invite. Emails without an account are skipped.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  @Transform(({ value }: { value: string[] }) =>
    Array.isArray(value) ? value.map((email) => email.toLowerCase()) : value,
  )
  emails: string[];

  @ApiProperty({
    example: ['uuid-1'],
    description:
      'Permission group ids granted when the invitation is accepted. Groups that no longer exist are ignored.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  permissionIds: string[];
}

export class InvitationTokenDto {
  @ApiProperty({ example: 'f3c2...', description: 'Raw invite token from the notification link' })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token: string;
}

export class InvitationPreviewDto {
  @ApiProperty()
  workspaceId: string;

  @ApiProperty({ example: 'My Workspace' })
  workspaceName: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ enum: InvitationStatus, example: InvitationStatus.PENDING })
  status: InvitationStatus;

  @ApiProperty()
  expiresAt: Date;
}

export class CreateInvitationsResponseDto {
  @ApiProperty({
    example: 2,
    description: 'Number of emails the invitation was created for',
  })
  invited: number;

  @ApiProperty({
    example: 1,
    description:
      'Number of emails skipped (no account matches, already a member, etc.)',
  })
  skipped: number;
}
