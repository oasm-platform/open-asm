import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { User } from '@/modules/auth/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

/**
 * Query parameters for getting many internal networks
 */
export class GetManyInternalNetworksQueryDto extends GetManyBaseQueryParams {}

/**
 * Response DTO for a single internal network in the list
 */
export class InternalNetworkResponseDto {
  @ApiProperty({ description: 'The unique identifier of the internal network' })
  @IsUUID('4')
  id: string;

  @ApiProperty({ description: 'The name of the internal network' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'When the internal network was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When the internal network was last updated' })
  updatedAt: Date;

  @ApiProperty({
    description: 'The user who created this internal network',
    type: () => User,
  })
  createdBy: {
    id: string;
    name: string;
    image?: string;
  };

  @ApiProperty({
    description: 'The number of agents connected to this internal network',
  })
  agents: number;
}

/**
 * Response DTO for getting many internal networks
 */
export class GetManyInternalNetworksResponseDto extends GetManyBaseResponseDto<InternalNetworkResponseDto> {}

/**
 * Response DTO for getting a single internal network
 */
export class GetInternalNetworkResponseDto extends InternalNetworkResponseDto {}
