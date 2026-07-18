import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import {
  useAgentsControllerCreateLLMConfig,
  useAgentsControllerDeleteLLMConfig,
  useAgentsControllerGetConnectedProviders,
  useAgentsControllerGetProviders,
  useAgentsControllerSetPreferredLLMConfig,
  useAgentsControllerUpdateLLMConfig,
  type LLMConfigWithProviderDto,
  type LLMProviderSupportedDto,
} from '@/services/apis/gen/queries';

const PROVIDERS_QUERY_KEY = '/api/agents/providers';
const CONNECTED_QUERY_KEY = '/api/agents/providers/connected';

export interface UseLLMConfigsOptions {
  enabled?: boolean;
}

/**
 * Consolidates LLM provider config fetching, derived state, and CRUD mutations.
 *
 * - Fetches supported providers + connected configs from two endpoints
 * - Merges them into the legacy `LLMConfigWithProviderDto[]` shape
 * - Derives `connectedProviders`, `preferredProvider`, `hasProviderConnected`
 * - Exposes raw mutation hooks for callers that want custom toast/error handling
 * - Provides `invalidate` helper to refetch both lists after mutations
 */
export function useLLMConfigs(options?: UseLLMConfigsOptions) {
  const queryClient = useQueryClient();

  const enabled = options?.enabled;

  const {
    data: rawProviders,
    isLoading: providersLoading,
    refetch: refetchProviders,
  } = useAgentsControllerGetProviders<LLMProviderSupportedDto[]>({
    query: {
      ...(enabled !== undefined ? { enabled } : {}),
    },
  });

  const {
    data: rawConnected,
    isLoading: connectedLoading,
    refetch: refetchConnected,
  } = useAgentsControllerGetConnectedProviders<LLMConfigWithProviderDto[]>({
    query: {
      ...(enabled !== undefined ? { enabled } : {}),
    },
  });

  const isLoading = providersLoading || connectedLoading;
  const refetch = useCallback(() => {
    void refetchProviders();
    void refetchConnected();
  }, [refetchProviders, refetchConnected]);

  /** Merge supported providers + connected configs into legacy flat list. */
  const providers = useMemo((): LLMConfigWithProviderDto[] => {
    const supported = (() => {
      if (Array.isArray(rawProviders)) return rawProviders;
      const wrapped = rawProviders as
        | { data?: LLMProviderSupportedDto[] }
        | undefined;
      if (wrapped?.data && Array.isArray(wrapped.data)) return wrapped.data;
      return [];
    })();

    const connected = (() => {
      if (Array.isArray(rawConnected)) return rawConnected;
      const wrapped = rawConnected as
        | { data?: LLMConfigWithProviderDto[] }
        | undefined;
      if (wrapped?.data && Array.isArray(wrapped.data)) return wrapped.data;
      return [];
    })();

    const connectedProviderIds = new Set(connected.map((c) => c.providerId));

    // Connected configs first
    const result: LLMConfigWithProviderDto[] = [...connected];

    // Unconnected providers appended
    for (const provider of supported) {
      if (!connectedProviderIds.has(provider.id)) {
        result.push({
          providerId: provider.id,
          providerName: provider.name,
          logo: provider.logo,
          isConnected: false,
          isAcceptCustomApiUrl: provider.isAcceptCustomApiUrl ?? false,
        });
      }
    }

    return result;
  }, [rawProviders, rawConnected]);

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
    () => {
      void queryClient.invalidateQueries({ queryKey: [PROVIDERS_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: [CONNECTED_QUERY_KEY] });
    },
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
