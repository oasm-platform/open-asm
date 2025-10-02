import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import z from 'zod';
import { AssetsService } from './assets.service';

@Injectable()
export class AssetsMcp {
    constructor(private assetsService: AssetsService) { }
    @Tool({
        name: 'get-assets',
        description: 'Returns a list of assets in the target workspace.',
        parameters: z.object({
            workspaceId: z.string(),
            page: z.number().optional(),
            limit: z.number().optional(),
        }),
        outputSchema: z.object({
            total: z.number(),
            hasNextPage: z.boolean(),
            data: z.array(z.object({
                id: z.string(),
                value: z.string(),
            })),
        }),
    })
    async getAssets({ workspaceId, page, limit }: { workspaceId: string, page?: number, limit?: number }) {
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