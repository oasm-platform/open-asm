import { ApiProperty } from '@nestjs/swagger';

export class GenerateTagsResponseDto {
  @ApiProperty({
    description: 'The domain that was analyzed',
    example: 'example.com',
  })
  domain: string;

  @ApiProperty({
    description: 'Array of generated tags for the domain',
    type: [String],
    example: ['technology', 'business', 'web'],
  })
  tags: string[];
}
