import { ApiProperty } from '@nestjs/swagger';

export class AssetGroupStatisticResponseDto {
  @ApiProperty({ description: 'Number of assets in the group', example: 12 })
  totalAssets: number;

  @ApiProperty({
    description: 'Total vulnerabilities across assets in the group',
    example: 42,
  })
  vulns: number;

  @ApiProperty({ description: 'Number of critical vulnerabilities', example: 2 })
  criticalVuls: number;

  @ApiProperty({ description: 'Number of high severity vulnerabilities', example: 3 })
  highVuls: number;

  @ApiProperty({ description: 'Number of medium severity vulnerabilities', example: 10 })
  mediumVuls: number;

  @ApiProperty({ description: 'Number of low severity vulnerabilities', example: 20 })
  lowVuls: number;

  @ApiProperty({ description: 'Number of info severity vulnerabilities', example: 7 })
  infoVuls: number;

  @ApiProperty({ description: 'Number of distinct open ports', example: 15 })
  ports: number;

  @ApiProperty({ description: 'Number of distinct services', example: 4 })
  services: number;
}
