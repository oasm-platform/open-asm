import { ApiProperty } from '@nestjs/swagger';

export class McpTool {
    @ApiProperty()
    name: string;
    @ApiProperty()
    description: string;
    @ApiProperty()
    moduleId: string;
}