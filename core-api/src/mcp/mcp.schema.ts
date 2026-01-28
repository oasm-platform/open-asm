import z from 'zod';

export const workspaceParamSchema = z.object({
  workspaceId: z.string().describe('The ID of the workspace to get resource'),
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
      .describe('The number of resources to return per page'),
    page: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .default(1)
      .describe('The page number to return'),
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
    value: z.string().optional().describe('Search assets by value'),
  })
  .extend(getManyBaseRequestSchema.shape);

export const getVulnerabilitiesSchema = z
  .object({
    q: z.string().optional().describe('Search vulnerabilities by name'),
  })
  .extend(getManyBaseRequestSchema.shape);

export const getTargetsSchema = z
  .object({
    value: z.string().optional().describe('Search targets by value'),
  })
  .extend(getManyBaseRequestSchema.shape);

export const getStatisticOutPutSchema = z.object({
  assets: z.number().describe('The total number of assets'),
  targets: z.number().describe('The total number of targets'),
  vuls: z.number().describe('The total number of vulnerabilities'),
  criticalVuls: z.number().describe('The number of critical vulnerabilities'),
  highVuls: z.number().describe('The number of high severity vulnerabilities'),
  mediumVuls: z
    .number()
    .describe('The number of medium severity vulnerabilities'),
  lowVuls: z.number().describe('The number of low severity vulnerabilities'),
  infoVuls: z.number().describe('The number of info level vulnerabilities'),
  techs: z.number().describe('The total number of unique technologies'),
  ports: z.number().describe('The total number of unique ports'),
  score: z.number().describe('The security score (0-10, higher is better)'),
});

export const detailAssetSchema = z
  .object({
    assetId: z.string().describe('The ID of the asset to get details for'),
  })
  .extend(workspaceParamSchema.shape);

export const listAssetsInTargetSchema = z
  .object({
    targetId: z.string().describe('The ID of the target to list assets from'),
    value: z.string().optional().describe('Search assets by value'),
  })
  .extend(getManyBaseRequestSchema.shape);

export const detailVulnSchema = z
  .object({
    vulnId: z
      .string()
      .describe('The ID of the vulnerability to get details for'),
  })
  .extend(workspaceParamSchema.shape);

export const listIssuesSchema = z
  .object({
    search: z
      .string()
      .optional()
      .describe('Search issues by title or description'),
    status: z
      .array(z.string())
      .optional()
      .describe('Filter issues by status (OPEN, CLOSED, etc.)'),
  })
  .extend(getManyBaseRequestSchema.shape);

export const detailIssueSchema = z
  .object({
    issueId: z.string().describe('The ID of the issue to get details for'),
  })
  .extend(workspaceParamSchema.shape);

export const listToolsSchema = z
  .object({
    q: z.string().optional().describe('Search tools by name'),
  })
  .extend(getManyBaseRequestSchema.shape);

export const listWorkersSchema = z
  .object({
    q: z
      .string()
      .optional()
      .describe('Search workers by ID or Token (partial)'),
  })
  .extend(getManyBaseRequestSchema.shape);

export const listJobsSchema = z
  .object({
    jobHistoryId: z
      .string()
      .optional()
      .describe('Filter jobs by job history ID'),
    jobStatus: z.string().optional().describe('Filter jobs by status'),
  })
  .extend(getManyBaseRequestSchema.shape);
