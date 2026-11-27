import { z } from 'zod';

// Lenient: a hand-edited or stale link drops the bad filter instead of
// failing the route or sending a value the API rejects with 400.
export const httpRequestsSearchSchema = z.object({
  conversationId: z.string().uuid().optional().catch(undefined),
  host: z.string().optional().catch(undefined),
  errorsOnly: z.boolean().optional().catch(undefined),
});

export type HttpRequestsSearch = z.infer<typeof httpRequestsSearchSchema>;
