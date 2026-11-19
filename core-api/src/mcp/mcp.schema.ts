import z from 'zod';

import {
  IssueLinkResourceType,
  IssuePriority,
  IssueStatus,
  IssueType,
} from '@/common/enums/enum';

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
