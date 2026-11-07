import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Refreshes every vulnerability query (list, statistics, detail, timeline)
 * after a write: their keys start with 'vulnerabilities' or
 * '/api/vulnerabilities…'.
 */
export function useInvalidateVulnerabilities() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        predicate: ({ queryKey }) => {
          const head = queryKey[0];
          return (
            typeof head === 'string' &&
            (head === 'vulnerabilities' || head.startsWith('/api/vulnerabilities'))
          );
        },
      }),
    [queryClient],
  );
}
