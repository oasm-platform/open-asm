import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { AssetsService } from 'src/modules/assets/assets.service';
import z from 'zod';
import { getManyBaseRequestSchema, getManyBaseResponseSchema } from './mcp.schema';

@Injectable()
export class McpTools {
    constructor(private assetsService: AssetsService) { }
    @Tool({
        name: 'get_assets',
        description: 'Returns a list of assets in the target workspace.',
        parameters: getManyBaseRequestSchema,
        outputSchema: getManyBaseResponseSchema(z.object({
            id: z.string(),
            value: z.string(),
        })),
    })
    async getAssets({ workspaceId, page, limit }: z.infer<typeof getManyBaseRequestSchema>) {
        const response = await this.assetsService.getAssetsInWorkspace({
            limit: limit || 10, page: page || 1, sortBy: 'createdAt'
        }, workspaceId);
        return {
            ...response, data: response.data.map(i => ({
                id: i.id,
                value: i.value
            }))
        };
    }
}