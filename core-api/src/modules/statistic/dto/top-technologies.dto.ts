import { ApiProperty } from '@nestjs/swagger';

export class TechnologyCountDto {
  @ApiProperty({ example: 'nginx', description: 'Technology name' })
  name: string;

  @ApiProperty({
    example: 15,
    description: 'Number of services running this technology',
  })
  count: number;
}

export class TopTechnologiesResponseDto {
  @ApiProperty({
    type: [TechnologyCountDto],
    description: 'Top 10 technologies by number of services',
  })
  technologies: TechnologyCountDto[];
}
