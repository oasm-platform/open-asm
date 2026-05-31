import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWorkspaceSelector, useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { setGlobalWorkspaceId } from '@/utils/workspaceState';
import { setCookie, deleteCookie } from '@/utils/cookie';
import React from 'react';

vi.mock('@/services/apis/gen/queries', () => ({
  useWorkspacesControllerGetWorkspaces: vi.fn(),
}));

vi.mock('@/utils/workspaceState', () => ({
  setGlobalWorkspaceId: vi.fn(),
  getGlobalWorkspaceId: vi.fn(),
}));

vi.mock('@/utils/cookie', () => ({
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

const { useWorkspacesControllerGetWorkspaces } = await import('@/services/apis/gen/queries');
const mockUseWorkspaces = vi.mocked(useWorkspacesControllerGetWorkspaces);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  queryClient.setQueryData(['global', 'workspace'], { selectedWorkspaceId: '' });
  return {
    queryClient,
    wrapper: function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children);
    },
  };
}

function setupWorkspaceQuery(
  data: { id: string; name: string }[] | null = null,
  isLoading = false,
) {
  mockUseWorkspaces.mockReturnValue({
    data: data ? { data } : undefined,
    isLoading,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useWorkspacesControllerGetWorkspaces>);
}

describe('useWorkspaceState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state with empty selectedWorkspaceId', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWorkspaceState(), { wrapper });
    expect(result.current.state.selectedWorkspaceId).toBe('');
  });

  it('setSelectedWorkspace updates the workspace id', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWorkspaceState(), { wrapper });

    act(() => {
      result.current.setSelectedWorkspace('ws-123');
    });

    await waitFor(() => {
      expect(result.current.state.selectedWorkspaceId).toBe('ws-123');
    });
  });

  it('clearSelectedWorkspace resets the workspace id', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWorkspaceState(), { wrapper });

    act(() => {
      result.current.setSelectedWorkspace('ws-123');
    });

    await waitFor(() => {
      expect(result.current.state.selectedWorkspaceId).toBe('ws-123');
    });

    act(() => {
      result.current.clearSelectedWorkspace();
    });

    await waitFor(() => {
      expect(result.current.state.selectedWorkspaceId).toBe('');
    });
  });
});

describe('useWorkspaceSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWorkspaceQuery([]);
  });

  it('returns empty workspaces when no data', () => {
    setupWorkspaceQuery([]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWorkspaceSelector(), { wrapper });
    expect(result.current.workspaces).toEqual([]);
  });

  it('returns workspaces from the API response', () => {
    const workspaces = [
      { id: 'ws-1', name: 'Workspace 1' },
      { id: 'ws-2', name: 'Workspace 2' },
    ];
    setupWorkspaceQuery(workspaces);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWorkspaceSelector(), { wrapper });
    expect(result.current.workspaces).toEqual(workspaces);
  });

  it('reports loading state', () => {
    setupWorkspaceQuery(null, true);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWorkspaceSelector(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });

  it('auto-selects first workspace when none is selected', () => {
    const workspaces = [{ id: 'ws-1', name: 'Workspace 1' }];
    setupWorkspaceQuery(workspaces);

    const { wrapper } = createWrapper();
    renderHook(() => useWorkspaceSelector(), { wrapper });

    expect(setGlobalWorkspaceId).toHaveBeenCalledWith('ws-1');
    expect(setCookie).toHaveBeenCalledWith('wid', 'ws-1');
  });

  it('handleSelectWorkspace updates state and invalidates queries', async () => {
    const workspaces = [{ id: 'ws-1', name: 'Workspace 1' }];
    setupWorkspaceQuery(workspaces);

    const { queryClient, wrapper } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useWorkspaceSelector(), { wrapper });

    act(() => {
      result.current.handleSelectWorkspace('ws-1');
    });

    expect(setGlobalWorkspaceId).toHaveBeenCalledWith('ws-1');
    expect(setCookie).toHaveBeenCalledWith('wid', 'ws-1');
    expect(spy).toHaveBeenCalled();
  });

  it('clears workspace when no workspaces returned', () => {
    setupWorkspaceQuery([]);

    const { wrapper } = createWrapper();
    renderHook(() => useWorkspaceSelector(), { wrapper });

    expect(deleteCookie).toHaveBeenCalledWith('wid');
    expect(setGlobalWorkspaceId).toHaveBeenCalledWith(null);
  });
});
