import { ApiProperty } from '@nestjs/swagger';

export class StatisticResponseDto {
  @ApiProperty({
    description: 'Number of assets',
    example: 42,
  })
  assets: number;

  @ApiProperty({
    description: 'Number of targets',
    example: 10,
  })
  targets: number;

  @ApiProperty({
    description: 'Number of vulnerabilities',
    example: 100,
  })
  vuls: number;

  @ApiProperty({
    description: 'Number of critical vulnerabilities',
    example: 5,
  })
  criticalVuls: number;

  @ApiProperty({
    description: 'Number of high severity vulnerabilities',
    example: 15,
  })
  highVuls: number;

  @ApiProperty({
    description: 'Number of medium severity vulnerabilities',
    example: 30,
  })
  mediumVuls: number;

  @ApiProperty({
    description: 'Number of low severity vulnerabilities',
    example: 40,
  })
  lowVuls: number;

  @ApiProperty({
    description: 'Number of info severity vulnerabilities',
    example: 10,
  })
  infoVuls: number;

  @ApiProperty({
    description: 'Number of technologies detected',
    example: 15,
  })
  techs: number;

  @ApiProperty({
    description: 'Number of ports',
    example: 80,
  })
  ports: number;

  @ApiProperty({
    description: 'Security score',
    example: 7.5,
  })
  score: number;

  @ApiProperty({
    description: 'Number of services',
    example: 100,
  })
  services: number;
}
