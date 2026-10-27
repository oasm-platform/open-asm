import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

/** Owner of a workspace, as seen by a platform admin. */
export class AdminWorkspaceUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  image?: string | null;
}

export class AdminWorkspaceDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  description?: string | null;

  @ApiProperty({
    type: () => AdminWorkspaceUserDto,
    nullable: true,
    description: 'Null only if the owner row is missing',
  })
  owner: AdminWorkspaceUserDto | null;

  @ApiProperty()
  isAssetsDiscovery: boolean;

  @ApiProperty()
  isAutoEnableAssetAfterDiscovered: boolean;

  @ApiProperty({ example: 10 })
  targetCount: number;

  @ApiProperty({ example: 5 })
  memberCount: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    required: false,
    nullable: true,
  })
  archivedAt?: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// Skip validation only when the field is absent. `@IsOptional` would also let
// `null` through, which the NOT NULL columns below reject with a 500.
const unlessAbsent = (field: string) =>
  ValidateIf((dto: Record<string, unknown>) => dto[field] !== undefined);

/** Fields a platform admin may change. Omitted fields are left as they are. */
export class UpdateAdminWorkspaceDto {
  @ApiProperty({ required: false })
  @unlessAbsent('name')
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ required: false })
  @unlessAbsent('isAssetsDiscovery')
  @IsBoolean()
  isAssetsDiscovery?: boolean;

  @ApiProperty({ required: false })
  @unlessAbsent('isAutoEnableAssetAfterDiscovered')
  @IsBoolean()
  isAutoEnableAssetAfterDiscovered?: boolean;
}

/** `search` matches the workspace name or the owner's name/email. */
export class GetManyAdminWorkspacesDto extends GetManyBaseQueryParams {
  @ApiProperty({
    required: false,
    description: 'true = archived only, false = active only, omit = both',
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isArchived?: boolean;
}
