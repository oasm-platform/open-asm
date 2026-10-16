import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ToolCategorySpec } from '../tool-categories';

/** One connector category with the inputs it takes. */
export class ConnectorCategoryDto extends ToolCategorySpec {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'JSON Schema of the inputs OASM passes to the connector for this category.',
  })
  inputsSchema?: Record<string, unknown>;
}

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

  @ApiProperty({ required: false })
  agentTool?: boolean;

  @ApiProperty({ type: ConnectorCategoryDto, isArray: true })
  categories: ConnectorCategoryDto[];
}