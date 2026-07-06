import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GenerateServiceTagsDto {
  @ApiProperty({
    description: 'The ID of the asset service to generate tags for',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  assetServiceId: string;
}

export class GenerateServiceTagsResponseDto {
  @ApiProperty({
    description: 'The generated tags for the service',
    type: [String],
    example: ['Technology', 'API', 'Cloud Service'],
  })
  tags: string[];
}
