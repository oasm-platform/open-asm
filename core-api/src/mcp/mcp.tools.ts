import { Injectable } from '@nestjs/common';
import { Context, Tool } from '@rekog/mcp-nest';
import { GET_WORKSPACE_MCP_TOOL_NAME } from 'src/common/constants/app.constants';
import { RequestWithMetadata } from 'src/common/interfaces/app.interface';
import { AssetsService } from 'src/modules/assets/assets.service';
import { StatisticService } from 'src/modules/statistic/statistic.service';
import { TargetsService } from 'src/modules/targets/targets.service';
import { WorkspacesService } from 'src/modules/workspaces/workspaces.service';
import z from 'zod';
import { getAssetsSchema, getManyBaseResponseSchema, getTargetsSchema, getVulnerabilitiesOutPutSchema, workspaceParamSchema } from './mcp.schema';
@Injectable()
export class McpTools {
    constructor(
        private assetsService: AssetsService,
        private workspaceService: WorkspacesService,
        private targetsService: TargetsService,
        private statisticService: StatisticService
    ) { }


    @Tool({
        name: GET_WORKSPACE_MCP_TOOL_NAME,
        description: 'Returns available workspaces and their metadata.',
        outputSchema: z.object({
            workspaces: z.array(z.object({
                id: z.string(),
                name: z.string(),
            }))
        }),
    })
    async getWorkspaces(_, context: Context, req: RequestWithMetadata) {
        const workspaceIds = req.mcp?.permissions.value.map(p => p.workspaceId);
        if (!workspaceIds) {
            return [];
        }
        const workspaces = await this.workspaceService.getWorkspacesByIds(workspaceIds).then(res => res.map(i => ({
            id: i.id,
            name: i.name
        })));

        return { workspaces };
    }

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
        name: 'get_vulnerabilities',
        description: 'Lists security vulnerabilities with severity and remediation info.',
    })
    getVulnerabilities() {
        return;
    }

    @Tool({
        name: 'get_targets',
        description: 'Lists security testing targets such as hosts, networks, apps.',
        parameters: getTargetsSchema,
        outputSchema: getManyBaseResponseSchema(z.object({
            id: z.string(),
            value: z.string(),
        })),
    })
    getTargets(params: z.infer<typeof getTargetsSchema>) {
        const { workspaceId, page, limit, value } = params;
        return this.targetsService.getTargetsInWorkspace({
            limit: limit || 100, page: page || 1, sortBy: 'createdAt', value
        }, workspaceId);
    }

    @Tool({
        name: 'get_statistics',
        description: 'Provides metrics and insights on vulnerabilities and risks.',
        parameters: workspaceParamSchema,
        outputSchema: getVulnerabilitiesOutPutSchema,
    })
    getStatistics({ workspaceId }: z.infer<typeof workspaceParamSchema>) {
        return this.statisticService.getStatistics({ workspaceId });
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
