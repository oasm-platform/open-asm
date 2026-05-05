import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Query parameters for getting many network interfaces
 */
export class GetManyNetworkInterfacesQueryDto extends GetManyBaseQueryParams {}

/**
 * Response DTO for a single network interface in the list
 */
export class NetworkInterfaceResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the network interface',
  })
  @IsUUID('4')
  id: string;

  @ApiProperty({ description: 'The name of the network interface' })
  @IsString()
  interfaceName: string;

  @ApiProperty({ description: 'The IP address of the network interface' })
  @IsString()
  ipAddress: string;

  @ApiProperty({ description: 'The CIDR of the network interface' })
  @IsString()
  cidr: string;

  @ApiProperty({ description: 'The gateway IP of the network interface' })
  @IsString()
  gatewayIp: string;

  @ApiProperty({ description: 'The gateway MAC of the network interface' })
  @IsString()
  gatewayMac: string;

  @ApiProperty({
    description: 'The ID of the worker this interface belongs to',
  })
  @IsUUID('4')
  workerId: string;

  @ApiProperty({
    description: 'The ID of the target associated with this network interface, if any',
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4')
  targetId: string | null;

  @ApiProperty({ description: 'When the network interface was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When the network interface was last updated' })
  updatedAt: Date;
}

/**
 * Response DTO for getting many network interfaces
 */
export class GetManyNetworkInterfacesResponseDto extends GetManyBaseResponseDto<NetworkInterfaceResponseDto> {}
