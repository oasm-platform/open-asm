import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import { ConnectWorkerTrigger } from '@/components/ui/connect-worker-trigger';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import { renderWithProviders, screen } from '@/test/utils';

vi.mock('@/hooks/useConnectWorkerState', () => ({
  useConnectWorkerState: vi.fn(),
}));

const mockUseConnectWorkerState = vi.mocked(useConnectWorkerState);

describe('ConnectWorkerTrigger', () => {
  const mockOpenDialog = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConnectWorkerState.mockReturnValue({
      state: { isOpen: false, networkId: undefined },
      openDialog: mockOpenDialog,
      setState: vi.fn(),
      closeDialog: vi.fn(),
    });
  });

  it('renders button with default text', async () => {
    renderWithProviders(<ConnectWorkerTrigger />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connect worker/i })).toBeInTheDocument();
    });
  });

  it('renders button with custom children', async () => {
    renderWithProviders(<ConnectWorkerTrigger>Custom Text</ConnectWorkerTrigger>);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /custom text/i })).toBeInTheDocument();
    });
  });

  it('calls openDialog without networkId when clicked', async () => {
    renderWithProviders(<ConnectWorkerTrigger />);

    const button = await screen.findByRole('button');
    fireEvent.click(button);

    expect(mockOpenDialog).toHaveBeenCalledWith(undefined);
  });

  it('calls openDialog with networkId when clicked', async () => {
    renderWithProviders(<ConnectWorkerTrigger networkId="network-123" />);

    const button = await screen.findByRole('button');
    fireEvent.click(button);

    expect(mockOpenDialog).toHaveBeenCalledWith('network-123');
  });

  it('renders SquareTerminal icon', async () => {
    const { container } = renderWithProviders(<ConnectWorkerTrigger />);

    await waitFor(() => {
      const svgIcon = container.querySelector('svg');
      expect(svgIcon).toBeInTheDocument();
    });
  });
});
