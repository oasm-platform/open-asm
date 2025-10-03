import { ApiProperty, PickType } from '@nestjs/swagger';
import { McpPermission } from '../entities/mcp-permission.entity';

export class McpTool {
    @ApiProperty()
    name: string;
    @ApiProperty()
    type: string;
    @ApiProperty()
    description: string;
    @ApiProperty()
    moduleId: string;
}

export class CreateMcpPermissionsRequestDto extends PickType(McpPermission, ['value', 'name', 'description'] as const) {

}