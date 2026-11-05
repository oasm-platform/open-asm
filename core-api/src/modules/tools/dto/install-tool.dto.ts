import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class InstallToolDto {
  // NOTE: `workspaceId` used to be accepted here and trusted as the tenant.
  // The tenant is now taken from the X-Workspace-ID header via @WorkspaceId(),
  // and the global ValidationPipe (whitelist: true) strips it from the body.
  @ApiProperty({
    description: 'The ID of the tool',
  })
  @IsUUID()
  toolId: string;
}

/** Uninstall result; the tool name is what the `tool.uninstalled` audit row shows. */
export class UninstallToolResponseDto extends DefaultMessageResponseDto {
  @ApiProperty()
  toolId: string;

  @ApiProperty()
  toolName: string;
}
