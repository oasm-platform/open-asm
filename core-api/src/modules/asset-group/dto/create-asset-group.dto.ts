import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateAssetGroupDto {
  @ApiProperty({
    description: 'Name of the asset group',
    example: 'Web Servers',
  })
  @IsString()
  name: string;
}
