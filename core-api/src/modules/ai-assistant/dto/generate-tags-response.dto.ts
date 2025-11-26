import { ApiProperty } from '@nestjs/swagger';

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
