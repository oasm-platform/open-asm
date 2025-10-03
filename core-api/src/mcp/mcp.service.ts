import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { McpRegistryService } from '@rekog/mcp-nest';
import { GetManyBaseQueryParams, GetManyBaseResponseDto } from 'src/common/dtos/get-many-base.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { Repository } from 'typeorm';
import { CreateMcpPermissionsRequestDto, McpTool } from './dto/mcp.dto';
import { McpPermission } from './entities/mcp-permission.entity';

@Injectable()
export class McpService {
    constructor(
        private mpcRegistryService: McpRegistryService,
        @InjectRepository(McpPermission) private mcpPermissionRepo: Repository<McpPermission>
    ) { }

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
        await this.mcpPermissionRepo.save({
            ...dto,
            owner: { id: userContext.id },
        });

        return {
            message: 'MCP permission created successfully.'
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
        }))).flat();
    }
}