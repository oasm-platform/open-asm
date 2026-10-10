import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScreenshotQueryOptions } from './use-screenshot-query-options';

vi.mock('@/services/apis/gen/queries', () => ({
  useRootControllerGetMetadata: vi.fn(),
}));

async function importMetadataHook() {
  return (await import('@/services/apis/gen/queries'))
    .useRootControllerGetMetadata as unknown as ReturnType<typeof vi.fn>;
}

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useScreenshotQueryOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bounds staleTime under a 60s server TTL with refetchOnWindowFocus', async () => {
    const useMetadata = await importMetadataHook();
    useMetadata.mockReturnValue({
      data: { storagePresignTtlSeconds: 60 },
    });
    const { result } = renderHook(() => useScreenshotQueryOptions(), {
      wrapper: wrapper(),
    });
    expect(result.current.staleTime).toBe(48_000);
    expect(result.current.staleTime).toBeLessThan(60_000);
    expect(result.current.refetchOnWindowFocus).toBe(true);
  });

  it('caps staleTime when metadata TTL is missing', async () => {
    const useMetadata = await importMetadataHook();
    useMetadata.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useScreenshotQueryOptions(), {
      wrapper: wrapper(),
    });
    expect(result.current.staleTime).toBe(45 * 60 * 1000);
    expect(result.current.refetchOnWindowFocus).toBe(true);
  });

  it('caps staleTime at 45min under a large server TTL', async () => {
    const useMetadata = await importMetadataHook();
    useMetadata.mockReturnValue({
      data: { storagePresignTtlSeconds: 172800 },
    });
    const { result } = renderHook(() => useScreenshotQueryOptions(), {
      wrapper: wrapper(),
    });
    expect(result.current.staleTime).toBe(45 * 60 * 1000);
    expect(result.current.staleTime).toBeLessThan(172800 * 1000);
    expect(result.current.refetchOnWindowFocus).toBe(true);
  });
});
