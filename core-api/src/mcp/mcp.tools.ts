import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { AssetsService } from 'src/modules/assets/assets.service';
import z from 'zod';
import { getAssetsSchema, getManyBaseResponseSchema } from './mcp.schema';

@Injectable()
export class McpTools {
    constructor(private assetsService: AssetsService,
    ) { }

    @Tool({
        name: 'get_assets',
        description: 'Returns a list of assets in the target workspace.',
        parameters: getAssetsSchema,
        outputSchema: getManyBaseResponseSchema(z.object({
            id: z.string(),
            value: z.string(),
        })),
    })
    async getAssets(params: z.infer<typeof getAssetsSchema>) {
        const { workspaceId, page, limit, value } = params;
        const response = await this.assetsService.getAssetsInWorkspace({
            limit: limit || 100, page: page || 1, sortBy: 'createdAt', value
        }, workspaceId);
        return {
            ...response, data: response.data.map(i => ({
                id: i.id,
                value: i.value
            }))
        };
    }
}