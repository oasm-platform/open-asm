/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */
import { Injectable } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';

import { AssetsService } from '@/modules/assets/assets.service';
import { StatisticService } from '@/modules/statistic/statistic.service';
import { TargetsService } from '@/modules/targets/targets.service';
import { VulnerabilitiesService } from '@/modules/vulnerabilities/vulnerabilities.service';

import {
  detailAssetSchema,
  detailVulnSchema,
  getAssetsSchema,
  getStatisticOutPutSchema,
  getTargetsSchema,
  getVulnerabilitiesSchema,
  listAssetsInTargetSchema,
} from '@/mcp/mcp.schema';

// Weather tool schema
const weatherSchema = z.object({
  location: z.string().describe('The location to get the weather for'),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolType = any;

/**
 * AgentTool service that provides multiple tools for the agent
 * Can inject other services for data retrieval
 */
@Injectable()
export class AgentTool {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly targetsService: TargetsService,
    private readonly vulnerabilitiesService: VulnerabilitiesService,
    private readonly statisticService: StatisticService,
  ) {}

  /**
   * Weather tool that returns random temperature data
   */
  get weatherTool(): any {
    const toolConfig: any = {
      description: 'Get the weather in a location',
      parameters: weatherSchema,
      execute: ({ location }: { location: string }) => {
        return {
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        };
      },
    };
    return tool(toolConfig);
  }

  /**
   * Get assets tool - returns a factory that accepts workspaceId
   */
  get getAssetsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'Lists discovered assets (domains, subdomains, IPs, URLs) within a workspace. Assets represent the entities found during scanning, distinct from targets (scope) or tools (scanners). Use this when the user asks about discovered infrastructure, IPs, or domains. Keywords: asset, domain, IP, URL.',
        parameters: getAssetsSchema,
        execute: async (params: z.infer<typeof getAssetsSchema>) => {
          const { page, limit, value } = params;
          const response = await this.assetsService.getManyAsssetServices(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'createdAt',
              value,
            },
            workspaceId,
          );
          return {
            ...response,
            data: response.data.map((i) => ({
              id: i.id,
              value: i.value,
            })),
          };
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * Get vulnerabilities tool - returns a factory that accepts workspaceId
   */
  get getVulnerabilitiesTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'Retrieves a list of security vulnerabilities identified during scans. Provides high-level info like name and severity. Use this when the user asks about security issues, CVEs, or "vulns". For in-depth technical details or remediation steps, use "detail_vuln". Keywords: vulnerability, vuln, CVE, security issue.',
        parameters: getVulnerabilitiesSchema,
        execute: async (
          params: z.infer<typeof getVulnerabilitiesSchema>,
        ) => {
          const { page, limit, q } = params;
          const response =
            await this.vulnerabilitiesService.getVulnerabilities(
              {
                limit: limit ?? 100,
                page: page ?? 1,
                q,
                sortBy: 'createdAt',
              },
              workspaceId,
            );
          return {
            ...response,
            data: response.data.map((i) => ({
              id: i.id,
              name: i.name,
              severity: i.severity,
            })),
          };
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * Get targets tool - returns a factory that accepts workspaceId
   */
  get getTargetsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'Lists defined targets (root domains, IP ranges, CIDRs) that constitute the scanning scope. Targets are the starting points for discovery, whereas assets are the actual items found. Use this when the user asks about the "scope" or "what is being scanned". Keywords: target, scan scope, root domain, IP range.',
        parameters: getTargetsSchema,
        execute: async (params: z.infer<typeof getTargetsSchema>) => {
          const { page, limit, value } = params;
          const response =
            await this.targetsService.getTargetsInWorkspace(
              {
                limit: limit ?? 100,
                page: page ?? 1,
                sortBy: 'createdAt',
                value,
              },
              workspaceId,
            );
          return {
            ...response,
            data: response.data.map((i) => ({
              id: i.id,
              value: i.value,
            })),
          };
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * Get statistics tool - returns a factory that accepts workspaceId
   */
  get getStatisticsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'Provides high-level security metrics and workspace statistics, including total counts of assets, targets, and vulnerabilities by severity. Also includes the overall security score and technology counts. Use this for summaries or "how many" questions. Keywords: statistics, summary, count, score, metrics.',
        parameters: getStatisticOutPutSchema,
        execute: async () => {
          return this.statisticService.getStatistics({ workspaceId });
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * Detail asset tool - returns a factory that accepts workspaceId
   */
  get detailAssetTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'Retrieves comprehensive details for a specific asset by its ID, including detected technologies (e.g., Nginx, WordPress), open ports, and metadata. Use this when the user asks for more information about a specific domain or IP. Keywords: asset details, technology, ports, service info.',
        parameters: detailAssetSchema,
        execute: async (params: z.infer<typeof detailAssetSchema>) => {
          const { assetId } = params;
          return this.assetsService.getAssetById(assetId, workspaceId);
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * List assets in target tool - returns a factory that accepts workspaceId
   */
  get listAssetsInTargetTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'Lists all assets discovered within the scope of a specific target ID. Useful for drilling down into what was found for a particular root domain or IP range. Keywords: assets in target, subdomain list for domain.',
        parameters: listAssetsInTargetSchema,
        execute: async (
          params: z.infer<typeof listAssetsInTargetSchema>,
        ) => {
          const { targetId, limit, page, value } = params;
          return this.assetsService.getManyAsssetServices(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              targetIds: [targetId],
              value,
              sortBy: 'createdAt',
            },
            workspaceId,
          );
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * Detail vulnerability tool - returns a factory that accepts workspaceId
   */
  get detailVulnTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'Retrieves full technical details for a specific vulnerability by its ID, including description, Proof of Concept (PoC), remediation steps, and references. Use this when the user needs to understand how to fix an issue or see evidence. Keywords: vuln details, fix, remediation, PoC, CVE info.',
        parameters: detailVulnSchema,
        execute: async (params: z.infer<typeof detailVulnSchema>) => {
          const { vulnId } = params;
          return this.vulnerabilitiesService.getVulnerability(
            vulnId,
            workspaceId,
          );
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * Returns all available tools as a record, bound to the given workspaceId
   */
  getTools(workspaceId: string): Record<string, ToolType> {
    return {
      get_weather: this.weatherTool,
      get_assets: this.getAssetsTool(workspaceId),
      get_vulnerabilities: this.getVulnerabilitiesTool(workspaceId),
      get_targets: this.getTargetsTool(workspaceId),
      get_statistics: this.getStatisticsTool(workspaceId),
      detail_asset: this.detailAssetTool(workspaceId),
      list_assets_in_target: this.listAssetsInTargetTool(workspaceId),
      detail_vuln: this.detailVulnTool(workspaceId),
    };
  }
}
