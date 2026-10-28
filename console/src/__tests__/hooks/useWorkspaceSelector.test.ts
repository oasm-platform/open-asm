import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useWorkspaceSelector,
  useWorkspaceState,
  useWorkspaceSync,
} from '@/hooks/useWorkspaceSelector';
import {
  getGlobalWorkspaceId,
  setGlobalWorkspaceId,
} from '@/utils/workspaceState';
import React from 'react';

vi.mock('@/services/apis/gen/queries', () => ({
  useWorkspacesControllerGetWorkspaces: vi.fn(),
  getWorkspacesControllerGetWorkspacesQueryOptions: vi.fn(),
}));

vi.mock('@/utils/authClient', () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: 'user-1', email: 'admin@test.com', name: 'Test Admin', role: 'admin' } },
    isPending: false,
    error: null,
  })),
}));

const { useWorkspacesControllerGetWorkspaces } = await import('@/services/apis/gen/queries');
const mockUseWorkspaces = vi.mocked(useWorkspacesControllerGetWorkspaces);

const LAST_WORKSPACE_KEY = 'last-workspace-id';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setGlobalWorkspaceId(null);
  setupWorkspaceQuery([]);
});

describe('useWorkspaceState', () => {
  it('is empty while no workspace is selected', () => {
    const { result } = renderHook(() => useWorkspaceState());
    expect(result.current.state.selectedWorkspaceId).toBe('');
  });

  it('follows the selected workspace', () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => setGlobalWorkspaceId('ws-123'));
    expect(result.current.state.selectedWorkspaceId).toBe('ws-123');

    act(() => setGlobalWorkspaceId(null));
    expect(result.current.state.selectedWorkspaceId).toBe('');
  });
});

describe('useWorkspaceSelector', () => {
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

  it('does not select a workspace on its own', () => {
    setupWorkspaceQuery([{ id: 'ws-1', name: 'Workspace 1' }]);
    const { wrapper } = createWrapper();
    renderHook(() => useWorkspaceSelector(), { wrapper });
    expect(getGlobalWorkspaceId()).toBeNull();
  });

  it('handleSelectWorkspace switches without invalidating the cache', () => {
    setupWorkspaceQuery([{ id: 'ws-1', name: 'Workspace 1' }]);
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useWorkspaceSelector(), { wrapper });

    act(() => result.current.handleSelectWorkspace('ws-1'));

    expect(result.current.selectedWorkspace).toBe('ws-1');
    expect(getGlobalWorkspaceId()).toBe('ws-1');
    expect(localStorage.getItem(LAST_WORKSPACE_KEY)).toBe('ws-1');
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('useWorkspaceSync', () => {
  const workspaces = [
    { id: 'ws-1', name: 'Workspace 1' },
    { id: 'ws-2', name: 'Workspace 2' },
  ];

  function sync(list: { id: string; name: string }[]) {
    setupWorkspaceQuery(list);
    const { wrapper } = createWrapper();
    return renderHook(() => useWorkspaceSync(), { wrapper });
  }

  it('selects the first workspace when none is selected', () => {
    sync(workspaces);
    expect(getGlobalWorkspaceId()).toBe('ws-1');
    expect(localStorage.getItem(LAST_WORKSPACE_KEY)).toBe('ws-1');
  });

  it('keeps the switched workspace across a reload', () => {
    const { wrapper } = createWrapper();
    setupWorkspaceQuery(workspaces);
    const { result } = renderHook(() => useWorkspaceSelector(), { wrapper });
    act(() => result.current.handleSelectWorkspace('ws-2'));

    // A reload starts with nothing selected in memory.
    setGlobalWorkspaceId(null);
    sync(workspaces);

    expect(getGlobalWorkspaceId()).toBe('ws-2');
  });

  it('falls back to the first workspace when the stored one is gone', () => {
    localStorage.setItem(LAST_WORKSPACE_KEY, 'ws-stale');
    sync(workspaces);
    expect(getGlobalWorkspaceId()).toBe('ws-1');
  });

  it('keeps a selection that still exists', () => {
    setGlobalWorkspaceId('ws-2');
    sync(workspaces);
    expect(getGlobalWorkspaceId()).toBe('ws-2');
  });

  it('moves off a workspace that is gone (deleted, left)', () => {
    setGlobalWorkspaceId('ws-deleted');
    sync(workspaces);
    expect(getGlobalWorkspaceId()).toBe('ws-1');
  });

  it('clears the selection when the user has no workspace', () => {
    setGlobalWorkspaceId('ws-1');
    localStorage.setItem(LAST_WORKSPACE_KEY, 'ws-1');
    sync([]);
    expect(getGlobalWorkspaceId()).toBeNull();
    expect(localStorage.getItem(LAST_WORKSPACE_KEY)).toBeNull();
  });
});
