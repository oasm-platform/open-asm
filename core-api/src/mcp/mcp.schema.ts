import z from 'zod';

import {
  IssueLinkResourceType,
  IssuePriority,
  IssueStatus,
  IssueType,
  Severity,
  VulnerabilityDiscoveredBy,
} from '@/common/enums/enum';
import { VulnerabilityStatus } from '@/modules/vulnerabilities/vulnerability-status';

/**
 * The base request schema for get many resources.
 */
export const getManyBaseRequestSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(100)
    .describe(
      'Maximum number of items to return in a single page (pagination).',
    ),
  page: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .default(1)
    .describe('The page number to retrieve for paginated results.'),
});

/**
 * The base response schema for get many resources.
 */
export const getManyBaseResponseSchema = (dataShape: z.ZodSchema) =>
  z
    .object({
      total: z.number().describe('The total number of resources'),
      limit: z.number().describe('The number of resources to return per page'),
      page: z.number().describe('The current page number'),
      pageCount: z.number().describe('The total number of pages'),
      hasNextPage: z
        .boolean()
        .describe('Whether there is a next page of resources'),
    })
    .extend({
      data: z.array(dataShape).describe('The list of resources'),
    });

export const getAssetsSchema = z
  .object({
    value: z
      .string()
      .optional()
      .describe(
        'Filter assets by value (e.g., searching for a specific domain or IP).',
      ),
    targetIds: z
      .array(z.string().uuid())
      .optional()
      .describe('Filter assets by specific target IDs (UUID format).'),
    ipAddresses: z
      .array(z.string())
      .optional()
      .describe('Filter assets by specific IP addresses.'),
    ports: z
      .array(z.string())
      .optional()
      .describe(
        'Filter assets by specific port numbers (e.g., ["80", "443"]).',
      ),
    hosts: z
      .array(z.string())
      .optional()
      .describe('Filter assets by specific host names.'),
    techs: z
      .array(z.string())
      .optional()
      .describe(
        'Filter assets by specific technologies (e.g., ["Nginx", "React"]).',
      ),
    statusCodes: z
      .array(z.string())
      .optional()
      .describe(
        'Filter assets by HTTP status codes (e.g., ["200", "404", "500"]).',
      ),
    tlsHosts: z
      .array(z.string())
      .optional()
      .describe('Filter assets by TLS certificate host names.'),
  })
  .extend(getManyBaseRequestSchema.shape);

export const getPortsSchema = z
  .object({
    value: z
      .string()
      .optional()
      .describe(
        'Filter ports by number (e.g., searching for port 80, 443, 8080).',
      ),
  })
  .extend(getManyBaseRequestSchema.shape);

export const getTechnologiesSchema = z
  .object({
    value: z
      .string()
      .optional()
      .describe(
        'Filter technologies by name (e.g., searching for Nginx, WordPress, React).',
      ),
  })
  .extend(getManyBaseRequestSchema.shape);

export const getTlsSchema = z
  .object({
    search: z
      .string()
      .optional()
      .describe(
        'Filter TLS certificates by host name (e.g., searching for example.com).',
      ),
    hosts: z
      .array(z.string())
      .optional()
      .describe('Filter TLS certificates by specific host names.'),
    targetIds: z
      .array(z.string().uuid())
      .optional()
      .describe(
        'Filter TLS certificates by specific target IDs (UUID format).',
      ),
  })
  .extend(getManyBaseRequestSchema.shape);

export const getVulnerabilitiesSchema = z
  .object({
    q: z
      .string()
      .optional()
      .describe(
        'Search query to filter vulnerabilities by their name or title.',
      ),
    targetIds: z
      .array(z.string().uuid())
      .optional()
      .describe('Filter vulnerabilities by specific target IDs (UUID format).'),
    status: z
      .nativeEnum(VulnerabilityStatus)
      .optional()
      .describe(
        'Lifecycle filter, default open. open: approved, still detected (new/active/resurfaced) and not dismissed. new/active/resurfaced: open findings in that state. fixed: closed by a covering scan. dismissed: risk accepted or dismissed (unexpired). pending_review/rejected: AI proposals awaiting or failing review. all: every approved finding.',
      ),
    severity: z
      .array(z.nativeEnum(Severity))
      .optional()
      .describe('Filter by severity levels (e.g., ["critical", "high"]).'),
    overdue: z
      .boolean()
      .optional()
      .describe('Only open findings whose SLA deadline (dueAt) has passed.'),
    discoveredBy: z
      .array(z.nativeEnum(VulnerabilityDiscoveredBy))
      .optional()
      .describe(
        'How the finding was found: tool (scanner), ai (AI agent), ai_tool (both), manual (added by a person).',
      ),
    tags: z
      .array(z.string())
      .optional()
      .describe('Only findings carrying any of these tags.'),
    createdFrom: z
      .string()
      .optional()
      .describe(
        'First detected on or after this date (ISO 8601, e.g., "2026-01-01").',
      ),
    createdTo: z
      .string()
      .optional()
      .describe(
        'First detected on or before this date (ISO 8601, e.g., "2026-01-31").',
      ),
  })
  .extend(getManyBaseRequestSchema.shape);

export const getTargetsSchema = z
  .object({
    value: z
      .string()
      .optional()
      .describe(
        'Filter targets by value (e.g., searching for a specific root domain or IP range).',
      ),
    type: z
      .enum(['DOMAIN', 'CIDR', 'IP'])
      .optional()
      .describe('Filter by target type: DOMAIN, CIDR, or IP.'),
    status: z
      .enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled'])
      .optional()
      .describe(
        'Filter by scan status: pending, in_progress, completed, failed, or cancelled.',
      ),
  })
  .extend(getManyBaseRequestSchema.shape);

export const getStatisticOutPutSchema = z.object({
  assets: z
    .number()
    .describe('Total number of discovered assets in the workspace.'),
  targets: z
    .number()
    .describe('Total number of defined targets (scan scope) in the workspace.'),
  vuls: z
    .number()
    .describe('Total number of vulnerabilities found across all assets.'),
  criticalVuls: z
    .number()
    .describe('Number of vulnerabilities with CRITICAL severity.'),
  highVuls: z
    .number()
    .describe('Number of vulnerabilities with HIGH severity.'),
  mediumVuls: z
    .number()
    .describe('Number of vulnerabilities with MEDIUM severity.'),
  lowVuls: z.number().describe('Number of vulnerabilities with LOW severity.'),
  infoVuls: z
    .number()
    .describe('Number of vulnerabilities with INFO/informational severity.'),
  techs: z
    .number()
    .describe(
      'Total number of unique technologies detected (e.g., Nginx, WordPress).',
    ),
  ports: z.number().describe('Total number of unique open ports discovered.'),
  score: z
    .number()
    .describe(
      'Overall security score (0-10), where higher means better security posture.',
    ),
});

export const detailAssetSchema = z.object({
  assetId: z
    .string()
    .describe(
      'The unique identifier (ID) of the asset to retrieve detailed information for.',
    ),
});

export const listAssetsInTargetSchema = z
  .object({
    targetId: z
      .string()
      .describe(
        'The unique identifier (ID) of the target from which to list discovered assets.',
      ),
    value: z
      .string()
      .optional()
      .describe(
        'Optional filter to search for specific assets within this target.',
      ),
  })
  .extend(getManyBaseRequestSchema.shape);

export const detailVulnSchema = z.object({
  id: z
    .string()
    .describe(
      'The unique identifier (ID) of the vulnerability to retrieve technical details for.',
    ),
  vulnId: z
    .string()
    .optional()
    .describe(
      'The unique identifier (ID) of the vulnerability to retrieve technical details for. Alternative to `id`.',
    ),
});

export const listIssuesSchema = z
  .object({
    search: z
      .string()
      .optional()
      .describe('Search issues by title, or by number (e.g. "#12").'),
    status: z
      .array(z.nativeEnum(IssueStatus))
      .optional()
      .describe('Only issues in these statuses.'),
    type: z
      .array(z.nativeEnum(IssueType))
      .optional()
      .describe('Only issues of these types.'),
    priority: z
      .array(z.nativeEnum(IssuePriority))
      .optional()
      .describe('Only issues with these priorities (p1 = most urgent).'),
    assigneeId: z
      .string()
      .uuid()
      .optional()
      .describe('Only issues assigned to this user ID.'),
    mine: z
      .boolean()
      .optional()
      .describe(
        'Only issues assigned to the user running this conversation.',
      ),
    overdue: z
      .boolean()
      .optional()
      .describe('Only open or in-progress issues past their due date.'),
    resourceType: z
      .nativeEnum(IssueLinkResourceType)
      .optional()
      .describe(
        'With resourceId: only issues linked to this resource (e.g. vulnerability).',
      ),
    resourceId: z
      .string()
      .uuid()
      .optional()
      .describe('With resourceType: ID of the linked resource.'),
  })
  .extend(getManyBaseRequestSchema.shape);

export const detailIssueSchema = z.object({
  issueId: z
    .string()
    .describe(
      'The unique identifier (ID) of the issue to retrieve full details for.',
    ),
});

export const listToolsSchema = z.object({
  q: z
    .string()
    .optional()
    .describe(
      'Search query to filter security tools/scanners by name or description.',
    ),
});

export const listWorkersSchema = z
  .object({
    q: z
      .string()
      .optional()
      .describe(
        'Search query to filter worker nodes by their name or metadata.',
      ),
  })
  .extend(getManyBaseRequestSchema.shape);

export const listJobsSchema = z
  .object({
    jobHistoryId: z
      .string()
      .optional()
      .describe('Filter background jobs by a specific job history/run ID.'),
    jobStatus: z
      .string()
      .optional()
      .describe(
        'Filter jobs by their execution status (e.g., completed, failed, active).',
      ),
  })
  .extend(getManyBaseRequestSchema.shape);
