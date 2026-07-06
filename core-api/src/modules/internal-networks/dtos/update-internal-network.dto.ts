import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateInternalNetworkDto {
  @ApiProperty({
    example: 'Updated Internal Network 1',
    description: 'The updated name of the internal network',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;
}
