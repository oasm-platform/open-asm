import { UserContext } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { GetApiKeyResponseDto } from '@/modules/tools/dto/get-apikey-response.dto';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, getSchemaPath } from '@nestjs/swagger';
import { CreateMcpPermissionsRequestDto, McpTool } from './dto/mcp.dto';
import { McpPermission } from './entities/mcp-permission.entity';
import { McpService } from './mcp.service';

@ApiTags('MCP')
@Controller('mcp')
export class McpController {
  constructor(private mcpService: McpService) {}

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
      },
    },
  })
  @Get('tools')
  public getMcpTools() {
    return this.mcpService.getMcpTools();
  }

  @Doc({
    summary: 'Create MCP permissions for a user.',
    description: 'Creates new MCP permissions based on the provided values.',
    request: {
      bodyType: 'JSON',
    },
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Post('permissions')
  createMcpPermission(
    @UserContext() userContext: UserContextPayload,
    @Body() dto: CreateMcpPermissionsRequestDto,
  ) {
    return this.mcpService.createMcpPermission(userContext, dto);
  }

  @Doc({
    summary: 'Get MCP permissions for a user.',
    description:
      'Returns the MCP permissions associated with the current user.',
    response: {
      serialization: GetManyResponseDto(McpPermission),
    },
  })
  @Get('permissions')
  getMcpPermissions(
    @Query() queryParams: GetManyBaseQueryParams,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.mcpService.getMcpPermissions(queryParams, userContext);
  }

  @Doc({
    summary: 'Get the API key for a specific MCP permission.',
    description:
      'Returns the API key associated with the specified MCP permission ID.',
    response: {
      serialization: GetApiKeyResponseDto,
    },
  })
  @Get(':id/api-key')
  getMcpApiKey(
    @UserContext() userContext: UserContextPayload,
    @Param() params: IdQueryParamDto,
  ) {
    return this.mcpService.getMcpApiKey(userContext, params.id);
  }

  @Doc({
    summary: 'Delete MCP permission by ID.',
    description:
      'Deletes the MCP permission associated with the current user by ID and also deletes the related API key.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Delete('permissions/:id')
  deleteMcpPermissionById(
    @UserContext() userContext: UserContextPayload,
    @Param() params: IdQueryParamDto,
  ) {
    return this.mcpService.deleteMcpPermissionById(userContext, params.id);
  }
}
