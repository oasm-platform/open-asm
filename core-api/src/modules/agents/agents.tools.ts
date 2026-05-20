/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { tool } from 'ai';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { AssetsService } from '@/modules/assets/assets.service';
import { IssuesService } from '@/modules/issues/issues.service';
import { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import { RemoteExecuteService } from '@/modules/remote-execute/remote-execute.service';
import { StatisticService } from '@/modules/statistic/statistic.service';
import { TargetsService } from '@/modules/targets/targets.service';
import { ToolsService } from '@/modules/tools/tools.service';
import { VulnerabilitiesService } from '@/modules/vulnerabilities/vulnerabilities.service';
import { WorkersService } from '@/modules/workers/workers.service';

import { SortOrder } from '@/common/dtos/get-many-base.dto';
import {
  detailAssetSchema,
  detailIssueSchema,
  detailVulnSchema,
  getAssetsSchema,
  getPortsSchema,
  getStatisticOutPutSchema,
  getTargetsSchema,
  getTechnologiesSchema,
  getTlsSchema,
  getVulnerabilitiesSchema,
  listAssetsInTargetSchema,
  listIssuesSchema,
  listJobsSchema,
  listToolsSchema,
  listWorkersSchema,
} from '@/mcp/mcp.schema';

// Web fetch tool schema
const webFetchSchema = z.object({
  url: z
    .string()
    .url()
    .describe('The URL to fetch content from (e.g., "https://example.com")'),
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
    @Inject(forwardRef(() => VulnerabilitiesService))
    private readonly vulnerabilitiesService: VulnerabilitiesService,
    private readonly statisticService: StatisticService,
    @Inject(forwardRef(() => IssuesService))
    private readonly issuesService: IssuesService,
    @Inject(forwardRef(() => ToolsService))
    private readonly toolsService: ToolsService,
    @Inject(forwardRef(() => WorkersService))
    private readonly workersService: WorkersService,
    @Inject(forwardRef(() => JobsRegistryService))
    private readonly jobsRegistryService: JobsRegistryService,
    private readonly remoteExecuteService: RemoteExecuteService,
  ) {}

  /**
   * Get assets tool - returns a factory that accepts workspaceId
   */
  get getAssetsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          '✅ USE THIS TOOL FIRST when user asks about any discovered infrastructure.\n\nLists all assets found during security scanning in the workspace. Assets = actual discovered items: domains, subdomains, IP addresses, URLs, endpoints.\n\n✅ WHEN TO USE:\n- User asks "what assets have been found?"\n- User wants list of domains / IPs\n- Looking for specific asset value\n\n❌ WHEN NOT TO USE:\n- For scanning scope definition → use get_targets instead\n- For full technical details → use detail_asset instead\n\nPARAMETERS:\n- page: Page number (default = 1)\n- limit: Results per page (default = 100, max = 500)\n- value: Filter results containing this text (e.g. "hackerone", "api", "192.168.1")',
        parameters: getAssetsSchema,
        execute: async (params: z.infer<typeof getAssetsSchema>) => {
          const { page, limit, value } = params;
          const response = await this.assetsService.getManyAsssetServices(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
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
          '✅ PRIMARY TOOL for security vulnerability listings.\n\nReturns all identified security vulnerabilities with severity level (CRITICAL / HIGH / MEDIUM / LOW / INFO). This is the overview list. For full technical details use detail_vuln tool.\n\n✅ WHEN TO USE:\n- User asks "what vulnerabilities are there?"\n- User wants list of CVEs / security issues\n- Filter vulnerabilities by name or CVE number\n- Count security issues by severity\n\nPARAMETERS:\n- page: Page number (default = 1)\n- limit: Results per page (default = 100, max = 500)\n- q: Search filter (e.g. "XSS", "SQL Injection", "CVE-2024", "RCE")',
        parameters: getVulnerabilitiesSchema,
        execute: async (params: z.infer<typeof getVulnerabilitiesSchema>) => {
          const { page, limit, q } = params;
          const response = await this.vulnerabilitiesService.getVulnerabilities(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              q,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
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
          '✅ Shows the actual SCANNING SCOPE of the workspace.\n\nTargets = what was ADDED to be scanned (root domains, IP ranges, CIDR blocks). This is the defined scope, not what was actually discovered.\n\n✅ WHEN TO USE:\n- User asks "what is in the scanning scope?"\n- User wants to know what targets are configured\n- Looking for root domains / IP ranges added by user\n\n❌ WHEN NOT TO USE:\n- For actual discovered items → use get_assets instead\n\nPARAMETERS:\n- page: Page number (default = 1)\n- limit: Results per page (default = 100)\n- value: Filter targets containing this text',
        parameters: getTargetsSchema,
        execute: async (params: z.infer<typeof getTargetsSchema>) => {
          const { page, limit, value } = params;
          const response = await this.targetsService.getTargetsInWorkspace(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
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
          '✅ USE THIS FOR ALL SUMMARY QUESTIONS. Returns security dashboard statistics instantly.\n\n✅ WHEN TO USE:\n- "How many assets are there?"\n- "How many critical vulnerabilities?"\n- "What is the security score?"\n- "Give me summary of this workspace"\n- Any "count" question\n\nRETURNS:\n- Total assets, targets, vulnerabilities\n- Vulnerabilities grouped by severity\n- Overall security score (0-100)\n- Detected technologies count\n- No parameters required',
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
          '✅ Get FULL TECHNICAL DETAILS about a single asset.\n\nUse this after you have an asset ID from get_assets. Returns everything known about this specific domain / IP.\n\n✅ WHEN TO USE:\n- "Tell me more about this domain"\n- "What technologies are running on this IP?"\n- "What ports are open?"\n- User asks for technical details about specific asset\n\nPARAMETERS:\n- assetId: REQUIRED. The ID of the asset you want details for',
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
          '✅ List ALL assets that were discovered FROM a specific target.\n\nThis shows what was actually found under a single root domain / IP range that was added to the scope.\n\n✅ WHEN TO USE:\n- "What subdomains were found for example.com?"\n- "Show everything discovered under this target"\n- Drill down from target to actual discovered assets\n\nPARAMETERS:\n- targetId: REQUIRED. ID of the target to get assets for\n- page: Page number (default = 1)\n- limit: Results per page (default = 100)\n- value: Filter assets inside this target',
        parameters: listAssetsInTargetSchema,
        execute: async (params: z.infer<typeof listAssetsInTargetSchema>) => {
          const { targetId, limit, page, value } = params;
          return this.assetsService.getManyAsssetServices(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              targetIds: [targetId],
              value,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
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
          '✅ Get FULL TECHNICAL DETAILS about a single vulnerability.\n\nUse this after you have vulnerability ID from get_vulnerabilities. This is the complete vulnerability report.\n\n✅ WHEN TO USE:\n- "Tell me about this vulnerability"\n- "How do I fix this issue?"\n- "What is the PoC for this CVE?"\n- User wants remediation steps / solution\n\nRETURNS:\n- Full description\n- CVSS score & severity\n- Proof of Concept\n- Step by step remediation\n- References & external links\n\nPARAMETERS:\n- vulnId: REQUIRED. ID of the vulnerability',
        parameters: detailVulnSchema,
        execute: async (params: z.infer<typeof detailVulnSchema>) => {
          const vulnId: string = (params.vulnId ?? params.id) as string;
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
   * Get ports tool - returns a factory that accepts workspaceId
   */
  get getPortsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          '✅ Lists all open ports discovered during scanning.\n\nReturns all unique open network ports with count of assets running on each port.\n\n✅ WHEN TO USE:\n- User asks "what ports are open?"\n- Find most common open ports\n- Search for specific port number\n- Analyze network exposure\n\nPARAMETERS:\n- page: Page number (default = 1)\n- limit: Results per page (default = 100, max = 500)\n- value: Filter ports by number (e.g. "80", "443", "22")',
        parameters: getPortsSchema,
        execute: async (params: z.infer<typeof getPortsSchema>) => {
          const { page, limit, value } = params;
          return this.assetsService.getPortAssets(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
              value,
            },
            workspaceId,
          );
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * Get technologies tool - returns a factory that accepts workspaceId
   */
  get getTechnologiesTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          '✅ Lists all detected technologies running on assets.\n\nReturns all unique software, frameworks, servers and technologies identified with full enrichment data.\n\n✅ WHEN TO USE:\n- User asks "what technologies are running?"\n- Find specific software versions\n- Count technology usage\n- Technology stack analysis\n\nPARAMETERS:\n- page: Page number (default = 1)\n- limit: Results per page (default = 100, max = 500)\n- value: Filter technologies by name (e.g. "Nginx", "WordPress", "React")',
        parameters: getTechnologiesSchema,
        execute: async (params: z.infer<typeof getTechnologiesSchema>) => {
          const { page, limit, value } = params;
          return this.assetsService.getTechnologyAssets(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
              value,
            },
            workspaceId,
          );
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * Get TLS certificates tool - returns a factory that accepts workspaceId
   */
  get getTlsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          '✅ Lists all discovered SSL/TLS certificates.\n\nReturns all TLS certificates with full details: issuer, subject, expiration dates, TLS version, cipher suite.\n\n✅ WHEN TO USE:\n- User asks "what SSL certificates are there?"\n- Check certificate expiration dates\n- Find weak TLS configurations\n- Analyze certificate chain issues\n\nPARAMETERS:\n- page: Page number (default = 1)\n- limit: Results per page (default = 100, max = 500)\n- search: Filter certificates by host name',
        parameters: getTlsSchema,
        execute: async (params: z.infer<typeof getTlsSchema>) => {
          const { page, limit, search } = params;
          return this.assetsService.getManyTls(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'not_after',
              sortOrder: SortOrder.ASC,
              search,
            },
            workspaceId,
          );
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * Web fetch tool - makes HTTP GET requests to fetch content from URLs
   */
  get webFetchTool(): (workspaceId: string) => any {
    return (_workspaceId: string) => {
      const toolConfig: any = {
        description:
          '✅ Make HTTP GET request to any public URL.\n\nUse this tool when you need to read content from external websites, documentation, APIs, or any online resource.\n\n✅ WHEN TO USE:\n- Read content from a web page\n- Call public API endpoints\n- Fetch documentation / reference material\n- Verify URL is accessible\n\nPARAMETERS:\n- url: REQUIRED. Full valid URL starting with http:// or https://',
        parameters: webFetchSchema,
        execute: async (params: z.infer<typeof webFetchSchema>) => {
          const { url } = params;

          try {
            const response = await fetch(url, {
              method: 'GET',
              headers: {
                'User-Agent': 'OASM-Security-Agent/1.0',
              },
            });

            const body = await response.text();

            return {
              statusCode: response.status,
              body,
            };
          } catch (error) {
            return {
              error: error instanceof Error ? error.message : 'Unknown error',
              url,
            };
          }
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * List issues tool - returns a factory that accepts workspaceId
   */
  get listIssuesTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          '✅ List all security issues in the workspace.\n\nReturns all issues (tickets/findings) with their status.\n\n✅ WHEN TO USE:\n- User asks "what issues are there?"\n- Search for specific issues\n\nPARAMETERS:\n- page: Page number (default = 1)\n- limit: Results per page (default = 100, max = 500)\n- search: Filter by title or content\n- status: Filter by status (e.g. OPEN, IN_PROGRESS, RESOLVED)',
        parameters: listIssuesSchema,
        execute: async (params: z.infer<typeof listIssuesSchema>) => {
          const { page, limit, search, status } = params;
          const response = await this.issuesService.getMany(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
              search,
              status: status as any,
            },
            workspaceId,
          );
          return {
            ...response,
            data: response.data.map((i) => ({
              id: i.id,
              title: i.title,
              status: i.status,
              tags: i.tags,
            })),
          };
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * Detail issue tool - returns a factory that accepts workspaceId
   */
  get detailIssueTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          '✅ Get FULL DETAILS about a single issue.\n\nUse this after you have an issue ID from list_issues. Returns everything known about this specific issue.\n\nPARAMETERS:\n- issueId: REQUIRED. The ID of the issue',
        parameters: detailIssueSchema,
        execute: async (params: z.infer<typeof detailIssueSchema>) => {
          const { issueId } = params;
          return this.issuesService.getById(issueId, workspaceId);
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * List tools tool - returns a factory that accepts workspaceId
   */
  get listToolsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          '✅ List all installed security tools/scanners.\n\nReturns tools configured in the workspace.\n\nPARAMETERS:\n- page: Page number (default = 1)\n- limit: Results per page (default = 100)\n- q: Search query to filter tools',
        parameters: listToolsSchema,
        execute: async (params: z.infer<typeof listToolsSchema>) => {
          const { page, limit, q } = params;
          const response = await this.toolsService.getManyTools({
            limit: limit ?? 100,
            page: page ?? 1,
            sortBy: 'createdAt',
            sortOrder: SortOrder.DESC,
            search: q,
          });
          return {
            ...response,
            data: response.data.map((i) => ({
              id: i.id,
              name: i.name,
            })),
          };
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * List workers tool - returns a factory that accepts workspaceId
   */
  get listWorkersTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          '✅ List all worker nodes.\n\nReturns worker nodes that are connected or configured.\n\nPARAMETERS:\n- page: Page number (default = 1)\n- limit: Results per page (default = 100)\n- q: Search query to filter workers',
        parameters: listWorkersSchema,
        execute: async (params: z.infer<typeof listWorkersSchema>) => {
          const { page, limit, q } = params;
          const response = await this.workersService.getWorkers({
            limit: limit ?? 100,
            page: page ?? 1,
            sortBy: 'createdAt',
            sortOrder: SortOrder.DESC,
            search: q,
            workspaceId,
          });
          return {
            ...response,
            data: response.data.map((i) => ({
              id: i.id,
              name: i.name,
            })),
          };
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * List jobs tool - returns a factory that accepts workspaceId
   */
  get listJobsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          '✅ List background jobs.\n\nReturns background scan jobs and their status.\n\nPARAMETERS:\n- page: Page number (default = 1)\n- limit: Results per page (default = 100)\n- jobHistoryId: Filter by specific job run ID\n- jobStatus: Filter by status (completed, failed, active)',
        parameters: listJobsSchema,
        execute: async (params: z.infer<typeof listJobsSchema>) => {
          const { page, limit, jobHistoryId, jobStatus } = params;
          const response = await this.jobsRegistryService.getManyJobs({
            limit: limit ?? 100,
            page: page ?? 1,
            sortBy: 'createdAt',
            sortOrder: SortOrder.DESC,
            jobHistoryId: jobHistoryId,
            jobStatus: jobStatus,
          });
          return {
            ...response,
            data: response.data.map((i) => ({
              id: i.id,
              status: i.status,
            })),
          };
        },
      };
      return tool(toolConfig);
    };
  }

  /**
   * Remote execute tool - returns a factory that accepts workspaceId
   */
  get remoteExecuteTool(): (workspaceId: string) => any {
    return (_workspaceId: string) => {
      const toolConfig: any = {
        description: [
          'EXECUTE REMOTE COMMANDS on scanning infrastructure.',
          '',
          'Publishes arbitrary system commands (e.g., nmap, curl, dig, nslookup, ping, traceroute, whois, openssl s_client, python scripts) to be executed by remote worker nodes.',
          '',
          '✅ WHEN TO USE:',
          '- Run an ad-hoc nmap scan (e.g., "nmap -sV -p 80,443 10.0.0.1")',
          '- Fetch HTTP responses with curl (e.g., "curl -sI https://example.com")',
          '- DNS lookups via dig/nslookup (e.g., "dig A example.com")',
          '- Network diagnostics (e.g., "ping -c 3 8.8.8.8", "traceroute example.com")',
          '- WHOIS lookups (e.g., "whois example.com")',
          '- SSL/TLS inspection (e.g., "openssl s_client -connect example.com:443")',
          '- Run any CLI tool available on the worker infrastructure',
          '',
          '❌ WHEN NOT TO USE:',
          '- For scanning scope/target definitions → use get_targets or list_assets_in_target',
          '- For reading existing data → use get_assets, get_vulnerabilities, etc.',
          '- For fetching web page content → use web_fetch instead',
          '- For interactive or long-running commands (no PTY, no stdin, strict timeout)',
          '',
          '⚠️ CONSTRAINTS:',
          '- Commands are executed with OS-level permissions — avoid destructive operations',
          '- The command is sent via gRPC to an available online worker',
          '- If no worker is available, the command will fail',
          '- Waits for command completion (stdout, stderr, exit code) before returning',
          '',
          'PARAMETERS:',
          '- command: REQUIRED. The full shell command string to execute (e.g., "nmap -p 22 10.0.0.0/24")',
          '',
          'OUTPUT:',
          '- stdout: Standard output from the command',
          '- stderr: Standard error output from the command',
          '- exitCode: Process exit code (0 = success, non-zero = failure)',
          '- error: Error message if the command failed',
          '- timedOut: Whether the command timed out before completion',
        ].join('\n'),
        parameters: z.object({
          command: z
            .string()
            .min(1)
            .describe(
              'The full shell command to execute (e.g., "nmap -sV 10.0.0.1", "curl -s https://example.com", "dig A google.com")',
            ),
        }),
        execute: async (params: { command: string }) => {
          const { command } = params;
          const sessionId = randomUUID();
          return this.remoteExecuteService.waitForResult(command, sessionId);
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
      get_assets: this.getAssetsTool(workspaceId),
      get_vulnerabilities: this.getVulnerabilitiesTool(workspaceId),
      get_targets: this.getTargetsTool(workspaceId),
      get_statistics: this.getStatisticsTool(workspaceId),
      detail_asset: this.detailAssetTool(workspaceId),
      list_assets_in_target: this.listAssetsInTargetTool(workspaceId),
      detail_vuln: this.detailVulnTool(workspaceId),
      get_ports: this.getPortsTool(workspaceId),
      get_technologies: this.getTechnologiesTool(workspaceId),
      get_tls: this.getTlsTool(workspaceId),
      web_fetch: this.webFetchTool(workspaceId),
      list_issues: this.listIssuesTool(workspaceId),
      detail_issue: this.detailIssueTool(workspaceId),
      list_tools: this.listToolsTool(workspaceId),
      list_workers: this.listWorkersTool(workspaceId),
      list_jobs: this.listJobsTool(workspaceId),
      remote_execute: this.remoteExecuteTool(workspaceId),
    };
  }
}
