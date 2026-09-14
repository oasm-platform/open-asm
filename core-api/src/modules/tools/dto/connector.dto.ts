import { ApiProperty } from '@nestjs/swagger';

/**
 * Connector metadata exposed by GET /tools/connectors/:slug. Mirrors the
 * connector manifest entry; description/author/pricingTier fields are optional
 * because not every oasm-connectors manifest provides them.
 */
export class ConnectorDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  version: string;

  @ApiProperty()
  image: string;

  @ApiProperty({ required: false })
  author?: string;

  @ApiProperty({ type: [String], required: false })
  pricingTier?: string[];

  @ApiProperty({ required: false })
  shortDescription?: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  homepage?: string;

  @ApiProperty({ required: false })
  repositoryUrl?: string;

  @ApiProperty({ required: false })
  supportUrl?: string;

  @ApiProperty({ type: [String] })
  capabilities: string[];
}