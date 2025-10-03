import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, getSchemaPath } from '@nestjs/swagger';
import { UserContext } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import { CreateMcpPermissionsRequestDto, McpTool } from './dto/mcp.dto';
import { McpPermission } from './entities/mcp-permission.entity';
import { McpService } from './mcp.service';

@ApiTags('Mcp')
@Controller('mcp')
export class McpController {
    constructor(
        private mcpService: McpService,
    ) { }

    /**
     * Get all tools from all registered MCP modules.
     * @returns A flattened array of all tools from all MCP modules.
     */
    @Doc({
        summary: 'Get all tools from all registered MCP modules.',
        description: 'Returns a flattened array of all tools from all MCP modules.',
        response: {
            extraModels: [McpTool],
            dataSchema: {
                type: 'array',
                items: { $ref: getSchemaPath(McpTool) },
            }
        }
    })
    @Get('tools')
    public getMcpTools() {
        return this.mcpService.getMcpTools();
    }

    @Doc({
        summary: 'Create MCP permissions for a user.',
        description: 'Creates new MCP permissions based on the provided values.',
        request: {
            bodyType: 'JSON'
        },
        response: {
            serialization: DefaultMessageResponseDto
        }
    })
    @Post('permissions')
    createMcpPermission(
        @UserContext() userContext: UserContextPayload,
        @Body() dto: CreateMcpPermissionsRequestDto
    ) {
        return this.mcpService.createMcpPermission(userContext, dto);
    }

    @Doc({
        summary: 'Get MCP permissions for a user.',
        description: 'Returns the MCP permissions associated with the current user.',
        response: {
            serialization: GetManyResponseDto(McpPermission),
        }
    })
    @Get('permissions')
    getMcpPermissions(
        @Query() queryParams: GetManyBaseQueryParams,
        @UserContext() userContext: UserContextPayload,
    ) {
        return this.mcpService.getMcpPermissions(queryParams, userContext);
    }
}