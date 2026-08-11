import { cloudflareSchema } from '@/modules/integrations/schemas/cloudflare.schema';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Enriched view of a target's raw `source` value in get-many responses.
 * The raw DB value is either a built-in enum member (MANUAL,
 * INTERNAL_NETWORK) or an integration schema `$id`; the DTO resolves it to a
 * human label plus the integration's icon URL so the console can render the
 * source without holding its own label map.
 */
export class TargetSourceDto {
  @ApiProperty({
    description: 'Human-readable label of the target source',
    example: 'Cloudflare',
  })
  source: string;

  @ApiProperty({
    description:
      'Icon URL for the source integration (empty string when the source has no icon)',
    example: '/static/images/integrations/cloudflare.svg',
  })
  icon: string;
}

/**
 * Integration schemas keyed by `$id`. Extend with a new entry when another
 * integration starts creating targets (raw `source` = schema `$id`).
 */
const INTEGRATION_SOURCE_SCHEMAS: Record<string, typeof cloudflareSchema> = {
  [cloudflareSchema.$id]: cloudflareSchema,
};

const MANUAL_SOURCE: TargetSourceDto = { source: 'Manual', icon: '' };
const INTERNAL_NETWORK_SOURCE: TargetSourceDto = {
  source: 'Internal Network',
  icon: '',
};

/**
 * Maps a raw target `source` DB value to its display DTO.
 * Unknown values pass through as their own label with no icon — never throws.
 */
export function toTargetSourceDto(raw: string): TargetSourceDto {
  if (raw === 'MANUAL') return MANUAL_SOURCE;
  if (raw === 'INTERNAL_NETWORK') return INTERNAL_NETWORK_SOURCE;
  const schema = INTEGRATION_SOURCE_SCHEMAS[raw];
  if (schema) {
    return { source: schema.title, icon: schema.icon ?? '' };
  }
  return { source: raw, icon: '' };
}
