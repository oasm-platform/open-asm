import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import {
  useAgentsControllerCreateLLMConfig,
  useAgentsControllerDeleteLLMConfig,
  useAgentsControllerGetLLMConfigs,
  useAgentsControllerSetPreferredLLMConfig,
  useAgentsControllerUpdateLLMConfig,
  type LLMConfigWithProviderDto,
} from '@/services/apis/gen/queries';

const LLM_CONFIGS_QUERY_KEY = '/api/agents/llm-configs';

export interface UseLLMConfigsOptions {
  enabled?: boolean;
}

/**
 * Consolidates LLM provider config fetching, derived state, and CRUD mutations.
 *
 * - Normalizes the API response (handles both array and `{ data?: [] }` wrappers)
 * - Derives `connectedProviders`, `preferredProvider`, `hasProviderConnected`
 * - Exposes raw mutation hooks for callers that want custom toast/error handling
 * - Provides `invalidate` helper to refetch the list after mutations
 */
export function useLLMConfigs(options?: UseLLMConfigsOptions) {
  const queryClient = useQueryClient();

  const { data: rawProviders, isLoading, refetch } = useAgentsControllerGetLLMConfigs<
    LLMConfigWithProviderDto[]
  >({
    query: {
      ...(options?.enabled !== undefined ? { enabled: options.enabled } : {}),
    },
  });

  /** Normalise the providers list — handles both array and `{data?: []}` wrapper. */
  const providers = useMemo((): LLMConfigWithProviderDto[] => {
    if (Array.isArray(rawProviders)) return rawProviders;
    const wrapped = rawProviders as
      | { data?: LLMConfigWithProviderDto[] }
      | undefined;
    if (wrapped?.data && Array.isArray(wrapped.data)) return wrapped.data;
    return [];
  }, [rawProviders]);

  const connectedProviders = useMemo(
    () => providers.filter((p) => p.isConnected),
    [providers],
  );

  const preferredProvider = useMemo(
    () => providers.find((p) => p.isPreferred),
    [providers],
  );

  const hasProviderConnected = connectedProviders.length > 0;

  const invalidate = useCallback(
    () =>
      void queryClient.invalidateQueries({
        queryKey: [LLM_CONFIGS_QUERY_KEY],
      }),
    [queryClient],
  );

  // Raw mutation hooks — consumers call these directly with their own error handling
  const createConfig = useAgentsControllerCreateLLMConfig();
  const updateConfig = useAgentsControllerUpdateLLMConfig();
  const deleteConfig = useAgentsControllerDeleteLLMConfig();
  const setPreferredConfig = useAgentsControllerSetPreferredLLMConfig();

  return {
    /** All LLM provider configs (connected and disconnected). */
    providers,
    /** Only providers that have been connected. */
    connectedProviders,
    /** The provider marked as preferred, if any. */
    preferredProvider,
    /** Whether at least one provider is connected. */
    hasProviderConnected,
    /** Loading state from the underlying query. */
    isLoading,
    /** Re-fetch the providers list. */
    refetch,
    /** Invalidate the query cache (call after mutations to refresh). */
    invalidate,
    /** Raw `useAgentsControllerCreateLLMConfig` mutation hook. */
    createConfig,
    /** Raw `useAgentsControllerUpdateLLMConfig` mutation hook. */
    updateConfig,
    /** Raw `useAgentsControllerDeleteLLMConfig` mutation hook. */
    deleteConfig,
    /** Raw `useAgentsControllerSetPreferredLLMConfig` mutation hook. */
    setPreferredConfig,
  };
}
