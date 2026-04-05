// import { MCP_API_KEY_HEADER } from '@/common/constants/app.constants';
// import { AssetsService } from '@/modules/assets/assets.service';
// import { IssuesService } from '@/modules/issues/issues.service';
// import { StatisticService } from '@/modules/statistic/statistic.service';
// import { TargetsService } from '@/modules/targets/targets.service';
// import { ToolsService } from '@/modules/tools/tools.service';
// import { VulnerabilitiesService } from '@/modules/vulnerabilities/vulnerabilities.service';
// import { WorkersService } from '@/modules/workers/workers.service';
// import { Injectable } from '@nestjs/common';
// // import { Context, Tool } from '@rekog/mcp-nest';
// import z from 'zod';
// import {
//   detailAssetSchema,
//   detailVulnSchema,
//   getAssetsSchema,
//   getManyBaseResponseSchema,
//   getStatisticOutPutSchema,
//   getTargetsSchema,
//   getVulnerabilitiesSchema,
//   listAssetsInTargetSchema,
// } from './mcp.schema';

// @Injectable()
// export class McpTools {
//   constructor(
//     private assetsService: AssetsService,
//     private targetsService: TargetsService,
//     private statisticService: StatisticService,
//     private vulnerabilitiesService: VulnerabilitiesService,
//     private issuesService: IssuesService,
//     private toolsService: ToolsService,
//     private workersService: WorkersService,
//   ) {}

//   private getWorkspaceId(request: Request) {
//     const mcpApiKey = request.headers[MCP_API_KEY_HEADER] as string;
//     return request.headers[mcpApiKey] as string;
//   }

//   @Tool({
//     name: 'get_assets',
//     description:
//       'Lists discovered assets (domains, subdomains, IPs, URLs) within a workspace. Assets represent the entities found during scanning, distinct from targets (scope) or tools (scanners). Use this when the user asks about discovered infrastructure, IPs, or domains. Keywords: asset, domain, IP, URL.',
//     parameters: getAssetsSchema,
//     outputSchema: getManyBaseResponseSchema(
//       z.object({
//         id: z.string().describe('The unique identifier of the asset.'),
//         value: z
//           .string()
//           .describe(
//             'The actual value of the asset (e.g., "example.com" or "192.168.1.1").',
//           ),
//       }),
//     ),
//   })
//   async getAssets(
//     params: z.infer<typeof getAssetsSchema>,
//     _: Context,
//     request: Request,
//   ) {
//     const { page, limit, value } = params;
//     const workspaceId = this.getWorkspaceId(request);
//     const response = await this.assetsService.getManyAsssetServices(
//       {
//         limit: limit || 100,
//         page: page || 1,
//         sortBy: 'createdAt',
//         value,
//       },
//       workspaceId,
//     );
//     return {
//       ...response,
//       data: response.data.map((i) => ({
//         id: i.id,
//         value: i.value,
//       })),
//     };
//   }

//   @Tool({
//     name: 'get_vulnerabilities',
//     description:
//       'Retrieves a list of security vulnerabilities identified during scans. Provides high-level info like name and severity. Use this when the user asks about security issues, CVEs, or "vulns". For in-depth technical details or remediation steps, use "detail_vuln". Keywords: vulnerability, vuln, CVE, security issue.',
//     parameters: getVulnerabilitiesSchema,
//     outputSchema: getManyBaseResponseSchema(
//       z.object({
//         id: z.string().describe('The unique identifier of the vulnerability.'),
//         name: z.string().describe('The title or name of the vulnerability.'),
//         severity: z
//           .string()
//           .describe('Severity level: CRITICAL, HIGH, MEDIUM, LOW, or INFO.'),
//       }),
//     ),
//   })
//   async getVulnerabilities(
//     params: z.infer<typeof getVulnerabilitiesSchema>,
//     _: Context,
//     request: Request,
//   ) {
//     const { page, limit, q } = params;
//     const workspaceId = this.getWorkspaceId(request);
//     const response = await this.vulnerabilitiesService.getVulnerabilities(
//       {
//         limit,
//         page,
//         q,
//         sortBy: 'createdAt',
//       },
//       workspaceId,
//     );
//     return {
//       ...response,
//       data: response.data.map((i) => ({
//         id: i.id,
//         name: i.name,
//         severity: i.severity,
//       })),
//     };
//   }

//   @Tool({
//     name: 'get_targets',
//     description:
//       'Lists defined targets (root domains, IP ranges, CIDRs) that constitute the scanning scope. Targets are the starting points for discovery, whereas assets are the actual items found. Use this when the user asks about the "scope" or "what is being scanned". Keywords: target, scan scope, root domain, IP range.',
//     parameters: getTargetsSchema,
//     outputSchema: getManyBaseResponseSchema(
//       z.object({
//         id: z.string().describe('The unique identifier of the target.'),
//         value: z
//           .string()
//           .describe(
//             'The target definition (e.g., "example.com" or "10.0.0.0/24").',
//           ),
//       }),
//     ),
//   })
//   async getTargets(
//     params: z.infer<typeof getTargetsSchema>,
//     _: Context,
//     request: Request,
//   ) {
//     const { page, limit, value } = params;
//     const workspaceId = this.getWorkspaceId(request);
//     const response = await this.targetsService.getTargetsInWorkspace(
//       {
//         limit: limit || 100,
//         page: page || 1,
//         sortBy: 'createdAt',
//         value,
//       },
//       workspaceId,
//     );
//     return {
//       ...response,
//       data: response.data.map((i) => ({
//         id: i.id,
//         value: i.value,
//       })),
//     };
//   }

//   @Tool({
//     name: 'get_statistics',
//     description:
//       'Provides high-level security metrics and workspace statistics, including total counts of assets, targets, and vulnerabilities by severity. Also includes the overall security score and technology counts. Use this for summaries or "how many" questions. Keywords: statistics, summary, count, score, metrics.',
//     outputSchema: getStatisticOutPutSchema,
//   })
//   async getStatistics(
//     params: z.infer<typeof getStatisticOutPutSchema>,
//     _: Context,
//     request: Request,
//   ) {
//     const workspaceId = this.getWorkspaceId(request);
//     return this.statisticService.getStatistics({ workspaceId });
//   }

//   @Tool({
//     name: 'detail_asset',
//     description:
//       'Retrieves comprehensive details for a specific asset by its ID, including detected technologies (e.g., Nginx, WordPress), open ports, and metadata. Use this when the user asks for more information about a specific domain or IP. Keywords: asset details, technology, ports, service info.',
//     parameters: detailAssetSchema,
//     outputSchema: z.object({
//       id: z.string().describe('The unique identifier of the asset.'),
//       value: z.string().describe('The asset value.'),
//       workspaceId: z.string().describe('The ID of the containing workspace.'),
//       targetId: z
//         .string()
//         .nullable()
//         .describe('The ID of the parent target if applicable.'),
//       options: z
//         .any()
//         .optional()
//         .describe('Additional asset configuration or metadata.'),
//       createdAt: z
//         .date()
//         .or(z.string())
//         .describe('The timestamp when the asset was first discovered.'),
//       updatedAt: z
//         .date()
//         .or(z.string())
//         .describe('The timestamp of the last update.'),
//       technologies: z
//         .array(z.any())
//         .optional()
//         .describe(
//           'Detailed list of technologies and services detected on the asset.',
//         ),
//     }),
//   })
//   async getAssetDetails(
//     params: z.infer<typeof detailAssetSchema>,
//     _: Context,
//     request: Request,
//   ) {
//     const { assetId } = params;
//     const workspaceId = this.getWorkspaceId(request);
//     return this.assetsService.getAssetById(assetId, workspaceId);
//   }

//   @Tool({
//     name: 'list_assets_in_target',
//     description:
//       'Lists all assets discovered within the scope of a specific target ID. Useful for drilling down into what was found for a particular root domain or IP range. Keywords: assets in target, subdomain list for domain.',
//     parameters: listAssetsInTargetSchema,
//     outputSchema: getManyBaseResponseSchema(
//       z.object({
//         id: z.string().describe('The unique identifier of the asset.'),
//         value: z
//           .string()
//           .describe('The asset value (e.g., subdomain name or IP).'),
//         type: z
//           .string()
//           .optional()
//           .describe('The category or type of the asset.'),
//       }),
//     ),
//   })
//   async getAssetsInTarget(
//     params: z.infer<typeof listAssetsInTargetSchema>,
//     _: Context,
//     request: Request,
//   ) {
//     const { targetId, limit, page, value } = params;
//     const workspaceId = this.getWorkspaceId(request);
//     return this.assetsService.getManyAsssetServices(
//       {
//         limit: limit || 100,
//         page: page || 1,
//         targetIds: [targetId],
//         value,
//         sortBy: 'createdAt',
//       },
//       workspaceId,
//     );
//   }

//   @Tool({
//     name: 'detail_vuln',
//     description:
//       'Retrieves full technical details for a specific vulnerability by its ID, including description, Proof of Concept (PoC), remediation steps, and references. Use this when the user needs to understand how to fix an issue or see evidence. Keywords: vuln details, fix, remediation, PoC, CVE info.',
//     parameters: detailVulnSchema,
//     outputSchema: z.object({
//       id: z.string().describe('The unique identifier of the vulnerability.'),
//       name: z.string().describe('Title of the vulnerability.'),
//       severity: z.string().describe('Severity level.'),
//       description: z
//         .string()
//         .optional()
//         .describe('Detailed explanation of the security risk.'),
//       remediation: z
//         .string()
//         .optional()
//         .describe('Steps and recommendations to fix the vulnerability.'),
//       proof: z
//         .string()
//         .optional()
//         .describe('Proof of concept or evidence of the vulnerability.'),
//       references: z
//         .array(z.string())
//         .optional()
//         .describe('External links and resources for further reading.'),
//       createdAt: z
//         .date()
//         .or(z.string())
//         .describe('The timestamp when the vulnerability was reported.'),
//     }),
//   })
//   async getVulnerabilityDetails(
//     params: z.infer<typeof detailVulnSchema>,
//     _: Context,
//     request: Request,
//   ) {
//     const vulnId = params.id || params.vulnId;
//     const workspaceId = this.getWorkspaceId(request);
//     return await this.vulnerabilitiesService.getVulnerability(
//       vulnId,
//       workspaceId,
//     );
//   }

//   // @Tool({
//   //   name: 'list_issues',
//   //   description:
//   //     'Lists operational issues or security tasks tracked within the system (e.g., tickets, manual review tasks). Provides title, status, and creation date. Use this when the user asks about "tasks", "tickets", or "system problems". Keywords: issues, tasks, tickets, status.',
//   //   parameters: listIssuesSchema,
//   //   outputSchema: getManyBaseResponseSchema(
//   //     z.object({
//   //       id: z.string().describe('The unique identifier of the issue.'),
//   //       title: z.string().describe('The title or summary of the issue.'),
//   //       status: z
//   //         .string()
//   //         .describe('The current status of the issue (e.g., OPEN, CLOSED).'),
//   //       createdAt: z
//   //         .date()
//   //         .or(z.string())
//   //         .describe('The timestamp when the issue was created.'),
//   //     }),
//   //   ),
//   // })
//   // async getIssues(
//   //   params: z.infer<typeof listIssuesSchema>,
//   //   _: Context,
//   //   request: Request,
//   // ) {
//   //   const { limit, page, search, status } = params;
//   //   const workspaceId = this.getWorkspaceId(request);
//   //   const response = await this.issuesService.getMany(
//   //     {
//   //       limit: limit || 100,
//   //       page: page || 1,
//   //       search,
//   //       status: status as unknown as IssueStatus[],
//   //       sortBy: 'createdAt',
//   //     },
//   //     workspaceId,
//   //   );

//   //   return {
//   //     ...response,
//   //     data: response.data.map((i) => ({
//   //       id: i.id,
//   //       title: i.title,
//   //       status: i.status,
//   //       createdAt: i.createdAt,
//   //     })),
//   //   };
//   // }

//   // @Tool({
//   //   name: 'detail_issue',
//   //   description:
//   //     'Retrieves detailed information for a specific issue by its ID, including full description, comments, and history. Use this to get the context or progress of a particular ticket. Keywords: issue details, comments, history.',
//   //   parameters: detailIssueSchema,
//   //   outputSchema: z.object({
//   //     id: z.string().describe('The unique identifier of the issue.'),
//   //     title: z.string().describe('The issue title.'),
//   //     description: z
//   //       .string()
//   //       .optional()
//   //       .describe('Full textual description of the issue.'),
//   //     status: z.string().describe('The current status.'),
//   //     workspaceId: z
//   //       .string()
//   //       .describe('The ID of the workspace this issue belongs to.'),
//   //     comments: z
//   //       .array(z.any())
//   //       .optional()
//   //       .describe(
//   //         'List of comments or activity logs associated with the issue.',
//   //       ),
//   //   }),
//   // })
//   // async getIssueDetails(
//   //   params: z.infer<typeof detailIssueSchema>,
//   //   _: Context,
//   //   request: Request,
//   // ) {
//   //   const { issueId } = params;
//   //   const workspaceId = this.getWorkspaceId(request);
//   //   return this.issuesService.getById(issueId, workspaceId);
//   // }

//   // @Tool({
//   //   name: 'list_tools',
//   //   description:
//   //     'Provides a catalog of available security software, scanning engines, and tool definitions (e.g., Nuclei, Nmap, Subfinder). Use this when the user asks what scanners are supported or the "software list". Keywords: tools list, scanner catalog, engine types.',
//   //   parameters: listToolsSchema,
//   //   outputSchema: getManyBaseResponseSchema(
//   //     z.object({
//   //       id: z.string().describe('The unique identifier of the tool.'),
//   //       name: z.string().describe('The name of the tool (e.g., "Nuclei").'),
//   //       description: z
//   //         .string()
//   //         .optional()
//   //         .describe('A brief summary of what the tool does.'),
//   //       version: z
//   //         .string()
//   //         .optional()
//   //         .describe('The installed version of the tool.'),
//   //       isInstalled: z
//   //         .boolean()
//   //         .optional()
//   //         .describe('Whether the tool is currently active and installed.'),
//   //       type: z
//   //         .string()
//   //         .optional()
//   //         .describe('The type of the tool (built_in or provider).'),
//   //     }),
//   //   ),
//   // })
//   // async getTools(
//   //   params: z.infer<typeof listToolsSchema>,
//   //   _: Context,
//   //   request: Request,
//   // ) {
//   //   const { limit, page } = params;
//   //   const workspaceId = this.getWorkspaceId(request);
//   //   // q param is not supported by service yet
//   //   const response = await this.toolsService.getManyTools({
//   //     limit: limit || 100,
//   //     page: page || 1,
//   //     workspaceId,
//   //     sortBy: 'createdAt',
//   //   });

//   //   return {
//   //     ...response,
//   //     data: response.data.map((t) => ({
//   //       id: t.id,
//   //       name: t.name,
//   //       description: t.description,
//   //       type: t.type,
//   //       version: t.version,
//   //       isInstalled: t.isInstalled,
//   //     })),
//   //   };
//   // }
// }
