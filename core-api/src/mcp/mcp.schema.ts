import z from 'zod';

export const workspaceParamSchema = z.object({
    workspaceId: z.string().describe('The ID of the workspace to get many resource'),
});

export const getManyBaseRequestSchema = z.object({
    limit: z.number().int().positive().optional().default(100).describe('The number of resources to return per page'),
    page: z.number().int().nonnegative().optional().default(1).describe('The page number to return'),
}).extend(workspaceParamSchema.shape);

export const getManyBaseResponseSchema = (dataShape: z.ZodSchema) => z.object({
    total: z.number().describe('The total number of resources'),
    limit: z.number().describe('The number of resources to return per page'),
    page: z.number().describe('The current page number'),
    pageCount: z.number().describe('The total number of pages'),
    hasNextPage: z.boolean().describe('Whether there is a next page of resources'),
}).extend({
    data: z.array(dataShape).describe('The list of resources'),
});