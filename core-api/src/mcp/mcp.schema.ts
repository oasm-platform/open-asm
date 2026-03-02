import z from 'zod';

export const workspaceParamSchema = z.object({
  workspaceId: z
    .string()
    .describe('The unique identifier of the workspace to query data from.'),
});

/**
 * The base request schema for get many resources.
 */
export const getManyBaseRequestSchema = z
  .object({
    limit: z
      .number()
      .int()
      .positive()
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
  })
  .extend(workspaceParamSchema.shape);

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

export const detailAssetSchema = z
  .object({
    assetId: z
      .string()
      .describe(
        'The unique identifier (ID) of the asset to retrieve detailed information for.',
      ),
  })
  .extend(workspaceParamSchema.shape);

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

export const detailVulnSchema = z
  .object({
    vulnId: z
      .string()
      .describe(
        'The unique identifier (ID) of the vulnerability to retrieve technical details for.',
      ),
  })
  .extend(workspaceParamSchema.shape);

export const listIssuesSchema = z
  .object({
    search: z
      .string()
      .optional()
      .describe('Search query to filter issues by title or their content.'),
    status: z
      .array(z.string())
      .optional()
      .describe(
        'Filter issues by their status (e.g., OPEN, IN_PROGRESS, RESOLVED).',
      ),
  })
  .extend(getManyBaseRequestSchema.shape);

export const detailIssueSchema = z
  .object({
    issueId: z
      .string()
      .describe(
        'The unique identifier (ID) of the issue to retrieve full details for.',
      ),
  })
  .extend(workspaceParamSchema.shape);

export const listToolsSchema = z
  .object({
    q: z
      .string()
      .optional()
      .describe(
        'Search query to filter installed security tools/scanners by name.',
      ),
  })
  .extend(getManyBaseRequestSchema.shape);

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
