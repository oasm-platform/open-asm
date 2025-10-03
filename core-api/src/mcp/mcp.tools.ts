import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { AssetsService } from 'src/modules/assets/assets.service';
import z from 'zod';
import { getAssetsSchema, getManyBaseResponseSchema } from './mcp.schema';

@Injectable()
export class McpTools {
    constructor(
        private assetsService: AssetsService,
    ) { }

    @Tool({
        name: 'get_assets',
        description: 'Fetches a list of assets in the workspace with basic details.',
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

    @Tool({
        name: 'get_workspaces',
        description: 'Returns available workspaces and their metadata.',
    })
    getWorkspaces() {
        return;
    }

    @Tool({
        name: 'get_vulnerabilities',
        description: 'Lists security vulnerabilities with severity and remediation info.',
    })
    getVulnerabilities() {
        return;
    }

    @Tool({
        name: 'get_targets',
        description: 'Lists security testing targets such as hosts, networks, apps.',
    })
    getTargets() {
        return;
    }

    @Tool({
        name: 'get_statistics',
        description: 'Provides metrics and insights on vulnerabilities and risks.',
    })
    getStatistics() {
        return;
    }

    @Tool({
        name: 'start_discovery',
        description: 'Starts asset discovery to find and catalog new targets.',
    })
    startDiscovery() {
        return;
    }

    @Tool({
        name: 'get_tickets',
        description: 'Fetches security tickets and tasks for tracking issues.',
    })
    getTickets() {
        return;
    }
}
