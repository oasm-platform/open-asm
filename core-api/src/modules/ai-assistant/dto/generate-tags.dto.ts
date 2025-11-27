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

/**
 * Response DTO for generating tags
 */
export class GenerateTagsResponseDto {
  @ApiProperty({
    description: 'Domain that tags were generated for',
    example: 'example.com',
  })
  domain: string;

  @ApiProperty({
    description: 'Generated tags',
    example: ['web', 'technology', 'blog'],
  })
  tags: string[];
}
