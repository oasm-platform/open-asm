import { ApiProperty } from '@nestjs/swagger';

export class PortCountDto {
  @ApiProperty({ example: 443, description: 'The port number' })
  port: number;

  @ApiProperty({
    example: 25,
    description: 'Number of services exposing this port',
  })
  count: number;

  @ApiProperty({
    example: true,
    description:
      'Whether the port is IANA-assigned (well-known or registered, < 49152)',
  })
  isStandard: boolean;
}

export class TopPortsResponseDto {
  @ApiProperty({
    example: 42,
    description: 'Total distinct ports exposed by the workspace',
  })
  totalPorts: number;

  @ApiProperty({
    example: 5,
    description:
      'Distinct non-standard (IANA dynamic/private, >= 49152) ports exposed',
  })
  nonstandardPorts: number;

  @ApiProperty({
    type: [PortCountDto],
    description: 'Top 10 ports by number of exposed services',
  })
  ports: PortCountDto[];
}
