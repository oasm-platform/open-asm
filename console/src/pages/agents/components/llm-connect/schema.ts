import type { LLMConfigWithProviderDto } from '@/services/apis/gen/queries';
import { z } from 'zod';

// ─── Schema ────────────────────────────────────────────────────────────────

export function getConnectSchema(
  isCustomProvider: boolean,
  isAcceptCustomApiUrl: boolean,
) {
  const requiresApiKey = !isCustomProvider && !isAcceptCustomApiUrl;
  return z
    .object({
      name: z.string().optional(),
      apiUrl: z
        .union([z.literal(''), z.string().url('Invalid URL format')])
        .optional()
        .transform((val) => (val === '' ? undefined : val)),
      apiKey: requiresApiKey
        ? z.string().min(1, 'API key is required')
        : z.string().optional(),
    })
    .refine((data) => requiresApiKey || data.apiUrl || data.apiKey, {
      message: 'API key or URL is required',
    });
}

export type ConnectFormData = z.infer<ReturnType<typeof getConnectSchema>>;

export function rowKey(item: LLMConfigWithProviderDto): string {
  return item.configId ?? item.providerId;
}
