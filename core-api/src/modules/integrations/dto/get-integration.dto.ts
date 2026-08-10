import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for a single integration.
 * Sensitive fields in `config` (e.g. apiToken, password) are masked.
 */
export class GetIntegrationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty()
  appType: string;

  @ApiProperty()
  category: string;

  @ApiProperty({
    description: 'Configuration with sensitive fields masked',
  })
  config: Record<string, unknown>;

  @ApiProperty()
  workspaceId: string;

  @ApiProperty()
  createdById: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({
    description: 'Cron schedule for periodic asset sync (5-field cron or "disabled")',
  })
  syncSchedule: string;

  @ApiProperty({
    required: false,
    description: 'Timestamp of the last successful periodic sync',
  })
  lastRunAt: Date | null;

  // NOTE: syncJobId is intentionally NOT exposed — it is an internal
  // implementation detail of the BullMQ repeat scheduler.
}
