import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class GetStatisticQueryDto {
  @ApiProperty({
    description: 'The ID of the workspace to get statistics for',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty()
  @IsString()
  @IsUUID(7)
  workspaceId: string;
}

export class StatisticResponseDto {
  @ApiProperty({
    description: 'Total number of targets in the workspace',
    example: 10,
  })
  totalTargets: number;

  @ApiProperty({
    description: 'Total number of assets in the workspace',
    example: 42,
  })
  totalAssets: number;

  @ApiProperty({
    description: 'Total number of vulnerabilities in the workspace',
    example: 5,
  })
  totalVulnerabilities: number;

  @ApiProperty({
    description: 'Total number of unique technologies in the workspace',
    example: 15,
  })
  totalUniqueTechnologies: number;
}
