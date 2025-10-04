import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { McpRegistryService } from '@rekog/mcp-nest';
import { GET_WORKSPACE_MCP_TOOL_NAME } from 'src/common/constants/app.constants';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams, GetManyBaseResponseDto } from 'src/common/dtos/get-many-base.dto';
import { ApiKeyType } from 'src/common/enums/enum';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { ApiKeysService } from 'src/modules/apikeys/apikeys.service';
import { GetApiKeyResponseDto } from 'src/modules/tools/dto/get-apikey-response.dto';
import { Repository } from 'typeorm';
import { CreateMcpPermissionsRequestDto, McpTool } from './dto/mcp.dto';
import { McpPermission } from './entities/mcp-permission.entity';

@Injectable()
export class McpService {
    constructor(
        private mpcRegistryService: McpRegistryService,
        @InjectRepository(McpPermission) private mcpPermissionRepo: Repository<McpPermission>,
        private apiKeyService: ApiKeysService
    ) { }

    /**
     * Check if the API key is valid and return the permission.
     * @param key 
     * @returns 
     */
    public async checkApiKey(key: string): Promise<McpPermission> {
        const apiKey = await this.apiKeyService.findByKey(key);
        const permission = await this.mcpPermissionRepo.findOne({
            where: {
                id: apiKey.ref
            },
            relations: ['owner']
        });
        if (!permission) {
            throw new UnauthorizedException('API key not found');
        }
        return permission;
    }
    /**
     * Get MCP permissions for a user.
     * @param queryParams 
     * @param userContext 
     * @returns 
     */
    public async getMcpPermissions(queryParams: GetManyBaseQueryParams, userContext: UserContextPayload): Promise<GetManyBaseResponseDto<McpPermission>> {
        const { limit, page, sortBy, sortOrder } = queryParams;
        const [data, total] = await this.mcpPermissionRepo.findAndCount({
            where: {
                owner: { id: userContext.id }
            },
            take: limit,
            skip: (page - 1) * limit,
            order: {
                [sortBy]: sortOrder,
            }
        });

        return {
            data,
            total,
            limit, page,
            pageCount: Math.ceil(total / limit),
            hasNextPage: page * limit < total,
        };
    }


    /**
     * Create a new MCP permission.
     * @param userContext 
     * @param dto 
     * @returns 
     */
    public async createMcpPermission(userContext: UserContextPayload, dto: CreateMcpPermissionsRequestDto) {
        const newMcpPermission = await this.mcpPermissionRepo.save({
            ...dto,
            owner: { id: userContext.id },
        });
        const newApiKey = await this.apiKeyService.create({
            name: newMcpPermission.name,
            type: ApiKeyType.MCP,
            ref: newMcpPermission.id,
        });

        return {
            apiKey: newApiKey.key,
        };
    }

    /**
     * Get all tools from all registered MCP modules.
     * @returns A flattened array of all tools from all MCP modules.
     */
    public getMcpTools(): McpTool[] {
        const mcpModuleIds = this.mpcRegistryService.getMcpModuleIds();
        return mcpModuleIds.map(id => this.mpcRegistryService.getTools(id).map(tool => ({
            name: tool.metadata.name,
            type: tool.type,
            description: tool.metadata.description,
            moduleId: id,
        }))).flat().filter(tool => tool.name !== GET_WORKSPACE_MCP_TOOL_NAME);
    }

    /**
     * Get the API key for a specific MCP permission.
     * @param user 
     * @param id 
     * @returns 
     */
    public async getMcpApiKey(user: UserContextPayload, id: string): Promise<GetApiKeyResponseDto> {
        const permissions = await this.mcpPermissionRepo.findOne({
            where: {
                id,
                owner: { id: user.id }
            }
        });

        if (!permissions) {
            throw new NotFoundException('MCP permission not found');
        }

        const apiKey = await this.apiKeyService.getCurrentApiKey(ApiKeyType.MCP, permissions.id);

        return {
            apiKey: apiKey?.key || '',
        };
    }

    /**
     * Delete an MCP permission by ID and its associated API key.
     * @param userContext The current user context
     * @param id The ID of the MCP permission to delete
     * @returns A confirmation message
     */
    public async deleteMcpPermissionById(userContext: UserContextPayload, id: string): Promise<DefaultMessageResponseDto> {
        // Find the permission to delete, ensuring it belongs to the current user
        const permission = await this.mcpPermissionRepo.findOne({
            where: {
                id,
                owner: { id: userContext.id }
            }
        });

        if (!permission) {
            throw new NotFoundException('MCP permission not found or does not belong to the current user');
        }

        const apiKey = await this.apiKeyService.getCurrentApiKey(ApiKeyType.MCP, permission.id);
        if (apiKey) {
            await this.apiKeyService.revoke(apiKey.id); // Revoke the API key
        }
        // Delete the MCP permission
        await this.mcpPermissionRepo.delete(id);

        return {
            message: 'MCP permission and its associated API key deleted successfully'
        };
    }
}