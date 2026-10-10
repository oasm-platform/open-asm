import { useRootControllerGetMetadata } from '@/services/apis/gen/queries';
import { useMemo } from 'react';
import { deriveScreenshotStaleTime } from '@/utils/storage-url';

/**
 * Query options for asset-list queries carrying signed `screenshotPath`.
 * Bounds cache under the server TTL so signed URLs never outlive their
 * signature; refetches on window focus to pick up fresh signatures.
 */
export function useScreenshotQueryOptions() {
  const { data: metadata } = useRootControllerGetMetadata();
  return useMemo(
    () => ({
      staleTime: deriveScreenshotStaleTime(
        metadata?.storagePresignTtlSeconds,
      ),
      refetchOnWindowFocus: true as const,
    }),
    [metadata?.storagePresignTtlSeconds],
  );
}
