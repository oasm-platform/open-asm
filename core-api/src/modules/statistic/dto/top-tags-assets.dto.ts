import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class TopTagAsset {
  @ApiProperty({
    example: 'example-tag',
    description: 'The name of the tag',
  })
  @IsString()
  tag: string;

  @ApiProperty({
    example: 10,
    description: 'The number of assets associated with the tag',
  })
  @IsNumber()
  count: number;
}