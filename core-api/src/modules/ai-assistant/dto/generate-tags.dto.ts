import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * DTO for generating tags
 */
export class GenerateTagsDto {
  @ApiProperty({
    description: 'Domain to generate tags for',
    example: 'example.com',
  })
  @IsString()
  domain: string;
}
