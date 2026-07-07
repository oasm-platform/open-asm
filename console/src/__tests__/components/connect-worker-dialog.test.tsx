import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import { ConnectWorkerDialog } from '@/components/ui/connect-worker-dialog';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { renderWithProviders, screen } from '@/test/utils';

vi.mock('@/hooks/useConnectWorkerState', () => ({
  useConnectWorkerState: vi.fn(),
}));

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: vi.fn(),
}));

vi.mock('@/services/apis/gen/queries', () => ({
  useWorkspacesControllerGetWorkspaceApiKey: vi.fn(),
  useWorkspacesControllerRotateApiKey: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockUseConnectWorkerState = vi.mocked(useConnectWorkerState);
const mockUseWorkspaceState = vi.mocked(useWorkspaceState);

const { useWorkspacesControllerGetWorkspaceApiKey, useWorkspacesControllerRotateApiKey } = await import('@/services/apis/gen/queries');
const mockUseApiKey = vi.mocked(useWorkspacesControllerGetWorkspaceApiKey);
const mockUseRotateApiKey = vi.mocked(useWorkspacesControllerRotateApiKey);

describe('ConnectWorkerDialog', () => {
  const mockCloseDialog = vi.fn();
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseConnectWorkerState.mockReturnValue({
      state: { isOpen: false, networkId: undefined },
      openDialog: vi.fn(),
      setState: vi.fn(),
      closeDialog: mockCloseDialog,
    });

    mockUseWorkspaceState.mockReturnValue({
      state: { selectedWorkspaceId: 'ws-123' },
      setState: vi.fn(),
      setSelectedWorkspace: vi.fn(),
      clearSelectedWorkspace: vi.fn(),
    } as unknown as ReturnType<typeof useWorkspaceState>);

    mockUseApiKey.mockReturnValue({
      data: { apiKey: 'test-api-key-123' },
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useWorkspacesControllerGetWorkspaceApiKey>);

    mockUseRotateApiKey.mockReturnValue({
      mutate: mockMutate,
    } as unknown as ReturnType<typeof useWorkspacesControllerRotateApiKey>);
  });

  it('does not render dialog when isOpen is false', () => {
    const { container } = renderWithProviders(<ConnectWorkerDialog />);

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('renders dialog when isOpen is true', async () => {
    mockUseConnectWorkerState.mockReturnValue({
      state: { isOpen: true, networkId: undefined },
      openDialog: vi.fn(),
      setState: vi.fn(),
      closeDialog: mockCloseDialog,
    });

    renderWithProviders(<ConnectWorkerDialog />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Connect worker')).toBeInTheDocument();
    });
  });

  it('displays API key in command for dev mode', async () => {
    mockUseConnectWorkerState.mockReturnValue({
      state: { isOpen: true, networkId: undefined },
      openDialog: vi.fn(),
      setState: vi.fn(),
      closeDialog: mockCloseDialog,
    });

    renderWithProviders(<ConnectWorkerDialog />);

    await waitFor(() => {
      expect(screen.getByText(/test-api-key-123/)).toBeInTheDocument();
    });
  });

  it('includes networkId in command when provided', async () => {
    mockUseConnectWorkerState.mockReturnValue({
      state: { isOpen: true, networkId: 'network-456' },
      openDialog: vi.fn(),
      setState: vi.fn(),
      closeDialog: mockCloseDialog,
    });

    renderWithProviders(<ConnectWorkerDialog />);

    await waitFor(() => {
      expect(screen.getByText(/network=network-456/)).toBeInTheDocument();
    });
  });

  it('calls closeDialog when close button is clicked', async () => {
    mockUseConnectWorkerState.mockReturnValue({
      state: { isOpen: true, networkId: undefined },
      openDialog: vi.fn(),
      setState: vi.fn(),
      closeDialog: mockCloseDialog,
    });

    renderWithProviders(<ConnectWorkerDialog />);

    let closeButton: HTMLElement | undefined;
    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /close/i });
      closeButton = buttons.find(
        (btn) => btn.textContent?.trim() === 'Close',
      );
      expect(closeButton).toBeInTheDocument();
    });

    fireEvent.click(closeButton!);
    expect(mockCloseDialog).toHaveBeenCalled();
  });

  it('renders rotate API key button', async () => {
    mockUseConnectWorkerState.mockReturnValue({
      state: { isOpen: true, networkId: undefined },
      openDialog: vi.fn(),
      setState: vi.fn(),
      closeDialog: mockCloseDialog,
    });

    renderWithProviders(<ConnectWorkerDialog />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /rotate api key/i })).toBeInTheDocument();
    });
  });
});
