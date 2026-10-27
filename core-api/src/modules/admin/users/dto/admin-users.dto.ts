import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { Role } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * A user account as seen by a platform admin. Unlike the public user shape
 * (id, name, image), admins also see the email, role and ban state.
 */
export class AdminUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty({ type: String, required: false, nullable: true })
  image?: string | null;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty({ type: Boolean, required: false, nullable: true })
  banned?: boolean | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  banReason?: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    required: false,
    nullable: true,
  })
  banExpires?: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

/** `search` matches the user's name or email. */
export class GetManyAdminUsersDto extends GetManyBaseQueryParams {
  @ApiProperty({
    required: false,
    description: 'Only users who are members of this workspace',
  })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;
}
