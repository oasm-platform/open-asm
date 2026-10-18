import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { ConnectWorkerDialog } from '@/components/ui/connect-worker-dialog';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import type { LiveEvent } from '@/hooks/use-live-events';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { renderWithProviders, screen } from '@/test/utils';
import { toast } from 'sonner';

vi.mock('@/hooks/useConnectWorkerState', () => ({
  useConnectWorkerState: vi.fn(),
}));

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: vi.fn(),
}));

let liveHandler: ((event: LiveEvent) => void) | undefined;
vi.mock('@/hooks/use-live-events', () => ({
  useLiveEvents: vi.fn((_patterns: unknown, handler: (e: LiveEvent) => void) => {
    liveHandler = handler;
  }),
}));

vi.mock('@/services/apis/gen/queries', () => ({
  workersControllerCreateJoinKey: vi.fn(),
  workersControllerRotateJoinKey: vi.fn(),
  workersControllerRevokeJoinKey: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockUseConnectWorkerState = vi.mocked(useConnectWorkerState);
const mockUseWorkspaceState = vi.mocked(useWorkspaceState);

const {
  workersControllerCreateJoinKey,
  workersControllerRotateJoinKey,
  workersControllerRevokeJoinKey,
} = await import('@/services/apis/gen/queries');
const mockCreate = vi.mocked(workersControllerCreateJoinKey);
const mockRotate = vi.mocked(workersControllerRotateJoinKey);
const mockRevoke = vi.mocked(workersControllerRevokeJoinKey);

const joinKey = (id: string, apiKey: string, expiresInSeconds = 300) => ({
  id,
  apiKey,
  expiresInSeconds,
  expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
});

// The command masks the key as <api_key>; reveal it, then wait for it.
const revealKey = async (key: RegExp) => {
  fireEvent.click(
    await screen.findByRole('button', { name: /show sensitive values/i }),
  );
  return screen.findByText(key);
};

describe('ConnectWorkerDialog', () => {
  const mockCloseDialog = vi.fn();

  const setOpen = (isOpen: boolean, networkId?: string) =>
    mockUseConnectWorkerState.mockReturnValue({
      state: { isOpen, networkId },
      openDialog: vi.fn(),
      setState: vi.fn(),
      closeDialog: mockCloseDialog,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    liveHandler = undefined;
    setOpen(false);

    mockUseWorkspaceState.mockReturnValue({
      state: { selectedWorkspaceId: 'ws-123' },
      setState: vi.fn(),
      setSelectedWorkspace: vi.fn(),
      clearSelectedWorkspace: vi.fn(),
    } as unknown as ReturnType<typeof useWorkspaceState>);

    mockCreate.mockResolvedValue(joinKey('jk-1', 'test-api-key-123'));
    mockRotate.mockResolvedValue(joinKey('jk-2', 'rotated-key-456'));
    mockRevoke.mockResolvedValue({ message: 'Join key revoked' });
  });

  it('does not render or issue a key when closed', () => {
    const { container } = renderWithProviders(<ConnectWorkerDialog />);

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('issues a one-time key on open and shows it with a countdown', async () => {
    setOpen(true);
    renderWithProviders(<ConnectWorkerDialog />);

    // The key is masked in the command until revealed.
    await screen.findByText(/<api_key>/);
    expect(screen.queryByText(/test-api-key-123/)).not.toBeInTheDocument();
    await revealKey(/test-api-key-123/);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/expires in/i)).toBeInTheDocument();
    expect(screen.getByText(/0[45]:\d\d/)).toBeInTheDocument();
  });

  it('includes networkId in command when provided', async () => {
    setOpen(true, 'network-456');
    renderWithProviders(<ConnectWorkerDialog />);

    await waitFor(() => {
      expect(screen.getByText(/network=network-456/)).toBeInTheDocument();
    });
  });

  it('calls closeDialog when close button is clicked', async () => {
    setOpen(true);
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

  it('rotates the current key and shows the new one', async () => {
    setOpen(true);
    renderWithProviders(<ConnectWorkerDialog />);
    await revealKey(/test-api-key-123/);

    fireEvent.click(screen.getByRole('button', { name: /rotate api key/i }));

    await screen.findByText(/rotated-key-456/);
    expect(mockRotate).toHaveBeenCalledWith('jk-1');
    expect(toast.success).toHaveBeenCalledWith('API key rotated successfully');
  });

  it('auto-rotates an expired key', async () => {
    mockCreate.mockResolvedValue(joinKey('jk-1', 'short-lived-key', 1));
    setOpen(true);
    renderWithProviders(<ConnectWorkerDialog />);
    await revealKey(/short-lived-key/);

    await waitFor(() => expect(mockRotate).toHaveBeenCalledWith('jk-1'), {
      timeout: 3000,
    });
    await screen.findByText(/rotated-key-456/);
  });

  it('swaps the commands for the success check, then closes itself', async () => {
    setOpen(true);
    renderWithProviders(<ConnectWorkerDialog />);
    await revealKey(/test-api-key-123/);

    act(() => {
      liveHandler?.({ id: 'e1', type: 'worker.joined', joinKeyId: 'jk-1' });
    });

    expect(toast.success).toHaveBeenCalledWith('Worker connected successfully');
    expect(screen.getByTestId('worker-join-success')).toBeInTheDocument();
    expect(screen.getByText('Connected!')).toBeInTheDocument();
    expect(screen.queryByText(/test-api-key-123/)).not.toBeInTheDocument();
    expect(screen.queryByText(/expires in/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /rotate api key/i }),
    ).not.toBeInTheDocument();
    // The check shows first; the dialog closes on its own a moment later.
    expect(mockCloseDialog).not.toHaveBeenCalled();
    await waitFor(() => expect(mockCloseDialog).toHaveBeenCalled(), {
      timeout: 3000,
    });
  });

  it('also closes when a known worker resumes with its key (rejoined)', async () => {
    setOpen(true);
    renderWithProviders(<ConnectWorkerDialog />);
    await revealKey(/test-api-key-123/);

    act(() => {
      liveHandler?.({
        id: 'e1',
        type: 'worker.rejoined',
        resourceId: 'w-old',
        joinKeyId: 'jk-1',
      });
    });

    expect(toast.success).toHaveBeenCalledWith('Worker connected successfully');
    expect(screen.getByTestId('worker-join-success')).toBeInTheDocument();
  });

  it('hands the joined worker id to the onJoined callback right away', async () => {
    const onJoined = vi.fn();
    mockUseConnectWorkerState.mockReturnValue({
      state: { isOpen: true, networkId: undefined, onJoined },
      openDialog: vi.fn(),
      setState: vi.fn(),
      closeDialog: mockCloseDialog,
    });
    renderWithProviders(<ConnectWorkerDialog />);
    await revealKey(/test-api-key-123/);

    act(() => {
      liveHandler?.({
        id: 'e1',
        type: 'worker.joined',
        resourceId: 'w-new',
        joinKeyId: 'jk-1',
      });
    });

    // Before the auto-close: the caller starts waiting for the worker now.
    expect(onJoined).toHaveBeenCalledWith('w-new');
    expect(mockCloseDialog).not.toHaveBeenCalled();
  });

  it('ignores workers joined with another key', async () => {
    setOpen(true);
    renderWithProviders(<ConnectWorkerDialog />);
    await revealKey(/test-api-key-123/);

    act(() => {
      liveHandler?.({ id: 'e1', type: 'worker.joined', joinKeyId: 'jk-other' });
      liveHandler?.({ id: 'e2', type: 'worker.joined' });
    });

    expect(mockCloseDialog).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  // Closing and unmounting run the same effect cleanup; the test router
  // cannot re-render the dialog with new props, so unmount stands in.
  it('revokes the key when the dialog goes away', async () => {
    setOpen(true);
    const { unmount } = renderWithProviders(<ConnectWorkerDialog />);
    await revealKey(/test-api-key-123/);

    unmount();

    expect(mockRevoke).toHaveBeenCalledWith('jk-1');
  });

  it('does not revoke a key that a worker already consumed', async () => {
    setOpen(true);
    const { unmount } = renderWithProviders(<ConnectWorkerDialog />);
    await revealKey(/test-api-key-123/);

    act(() => {
      liveHandler?.({ id: 'e1', type: 'worker.joined', joinKeyId: 'jk-1' });
    });
    unmount();

    expect(mockRevoke).not.toHaveBeenCalled();
  });
});
