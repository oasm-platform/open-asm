import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class CreateTargetsFromInterfacesDto {
  @ApiProperty({
    description: 'Array of network interface IDs to create targets from',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  networkInterfaceIds: string[];
}
