import type { LLMConfigWithProviderDto } from '@/services/apis/gen/queries';
import type { TFunction } from '@/lib/i18n-dictionary';
import { z } from 'zod';

// ─── Schema ────────────────────────────────────────────────────────────────

export function getConnectSchema(
  isCustomProvider: boolean,
  isAcceptCustomApiUrl: boolean,
  t: TFunction,
) {
  const requiresApiKey = !isCustomProvider && !isAcceptCustomApiUrl;
  return z
    .object({
      name: z.string().optional(),
      apiUrl: z
        .union([z.literal(''), z.string().url(t('agents.connect.invalidUrl'))])
        .optional()
        .transform((val) => (val === '' ? undefined : val)),
      apiKey: requiresApiKey
        ? z.string().min(1, t('agents.connect.apiKeyRequired'))
        : z.string().optional(),
    })
    .refine(
      (data) => {
        const trimmedUrl = data.apiUrl?.trim() ?? '';
        const trimmedKey = data.apiKey?.trim() ?? '';
        return requiresApiKey || trimmedUrl || trimmedKey;
      },
      {
        message: t('agents.connect.keyOrUrlRequired'),
        path: ['apiKey'],
      },
    )
    .transform((data) => ({
      ...data,
      apiUrl: data.apiUrl?.trim() || undefined,
      apiKey: data.apiKey?.trim() || undefined,
    }));
}

export type ConnectFormData = z.infer<ReturnType<typeof getConnectSchema>>;

export function rowKey(item: LLMConfigWithProviderDto): string {
  return item.configId ?? item.providerId;
}
