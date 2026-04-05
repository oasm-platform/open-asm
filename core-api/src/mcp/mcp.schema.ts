import z from 'zod';

/**
 * The base request schema for get many resources.
 */
export const getManyBaseRequestSchema = z.object({
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
      .enum(['open', 'dismissed', 'all'])
      .optional()
      .describe('Filter by vulnerability status: open, dismissed, or all.'),
    severity: z
      .array(z.enum(['info', 'low', 'medium', 'high', 'critical']))
      .optional()
      .describe('Filter by severity levels (e.g., ["critical", "high"]).'),
    createdFrom: z
      .string()
      .optional()
      .describe(
        'Filter by creation date from (ISO 8601 format, e.g., "2026-01-01").',
      ),
    createdTo: z
      .string()
      .optional()
      .describe(
        'Filter by creation date to (ISO 8601 format, e.g., "2026-01-31").',
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
      .describe('Search query to filter issues by title or their content.'),
    status: z
      .array(z.string())
      .optional()
      .describe(
        'Filter issues by their status (e.g., OPEN, IN_PROGRESS, RESOLVED).',
      ),
  })
  .extend(getManyBaseRequestSchema.shape);

export const detailIssueSchema = z.object({
  issueId: z
    .string()
    .describe(
      'The unique identifier (ID) of the issue to retrieve full details for.',
    ),
});

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
