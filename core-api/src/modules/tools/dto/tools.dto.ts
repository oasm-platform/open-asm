import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddToolToWorkspaceDto {
  // NOTE: `workspaceId` used to be accepted here and trusted as the tenant.
  // The tenant is now taken from the X-Workspace-ID header via @WorkspaceId(),
  // and the global ValidationPipe (whitelist: true) strips it from the body.
  @ApiProperty({
    description: 'The ID of the tool',
  })
  @IsUUID()
  toolId: string;
}
