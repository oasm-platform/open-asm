import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import React from 'react';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  queryClient.setQueryData(['global', 'connectWorker'], {
    isOpen: false,
    networkId: undefined,
  });
  return {
    queryClient,
    wrapper: function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children);
    },
  };
}

describe('useConnectWorkerState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state with isOpen false and no networkId', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConnectWorkerState(), { wrapper });

    expect(result.current.state.isOpen).toBe(false);
    expect(result.current.state.networkId).toBeUndefined();
  });

  it('openDialog sets isOpen to true without networkId', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConnectWorkerState(), { wrapper });

    act(() => {
      result.current.openDialog();
    });

    await waitFor(() => {
      expect(result.current.state.isOpen).toBe(true);
      expect(result.current.state.networkId).toBeUndefined();
    });
  });

  it('openDialog sets isOpen to true with networkId', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConnectWorkerState(), { wrapper });

    act(() => {
      result.current.openDialog('network-123');
    });

    await waitFor(() => {
      expect(result.current.state.isOpen).toBe(true);
      expect(result.current.state.networkId).toBe('network-123');
    });
  });

  it('closeDialog sets isOpen to false and clears networkId', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConnectWorkerState(), { wrapper });

    act(() => {
      result.current.openDialog('network-123');
    });

    await waitFor(() => {
      expect(result.current.state.isOpen).toBe(true);
    });

    act(() => {
      result.current.closeDialog();
    });

    await waitFor(() => {
      expect(result.current.state.isOpen).toBe(false);
      expect(result.current.state.networkId).toBeUndefined();
    });
  });

  it('openDialog can update networkId when already open', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useConnectWorkerState(), { wrapper });

    act(() => {
      result.current.openDialog('network-1');
    });

    await waitFor(() => {
      expect(result.current.state.networkId).toBe('network-1');
    });

    act(() => {
      result.current.openDialog('network-2');
    });

    await waitFor(() => {
      expect(result.current.state.isOpen).toBe(true);
      expect(result.current.state.networkId).toBe('network-2');
    });
  });
});
