import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateInternalNetworkDto {
  @ApiProperty({
    example: 'Internal Network 1',
    description: 'The name of the internal network',
  })
  @IsString()
  name: string;
}
