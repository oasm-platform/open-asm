import { orvalClient } from '@/services/apis/axios-client';
import { useQuery } from '@tanstack/react-query';

interface ToolSchemaResponse {
  schema: Record<string, unknown>;
  source: 'configSchema' | 'inputsSchema' | null;
}

const TOOL_SCHEMA_KEY = 'tool-schema';

export function useToolSchema(toolId: string) {
  return useQuery({
    queryKey: [TOOL_SCHEMA_KEY, toolId],
    queryFn: ({ signal }) =>
      orvalClient<ToolSchemaResponse>({
        url: `/api/tools/${toolId}/schema`,
        method: 'GET',
        signal,
      }),
    enabled: !!toolId,
  });
}
