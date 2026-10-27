import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class DiscoverUrlsDto {
  @ApiProperty({
    required: true,
    type: [String],
    description: 'IDs of the domain targets to discover URLs for',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  targetIds: string[];
}
