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
}
