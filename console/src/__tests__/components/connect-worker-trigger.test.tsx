import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectWorkerTrigger } from '@/components/ui/connect-worker-trigger';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import React from 'react';

vi.mock('@/hooks/useConnectWorkerState', () => ({
  useConnectWorkerState: vi.fn(),
}));

const mockUseConnectWorkerState = vi.mocked(useConnectWorkerState);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

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

  it('renders button with default text', () => {
    const Wrapper = createWrapper();
    render(<ConnectWorkerTrigger />, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: /connect worker/i })).toBeInTheDocument();
  });

  it('renders button with custom children', () => {
    const Wrapper = createWrapper();
    render(<ConnectWorkerTrigger>Custom Text</ConnectWorkerTrigger>, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: /custom text/i })).toBeInTheDocument();
  });

  it('calls openDialog without networkId when clicked', () => {
    const Wrapper = createWrapper();
    render(<ConnectWorkerTrigger />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('button'));

    expect(mockOpenDialog).toHaveBeenCalledWith(undefined);
  });

  it('calls openDialog with networkId when clicked', () => {
    const Wrapper = createWrapper();
    render(<ConnectWorkerTrigger networkId="network-123" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('button'));

    expect(mockOpenDialog).toHaveBeenCalledWith('network-123');
  });

  it('renders SquareTerminal icon', () => {
    const Wrapper = createWrapper();
    const { container } = render(<ConnectWorkerTrigger />, { wrapper: Wrapper });

    const svgIcon = container.querySelector('svg');
    expect(svgIcon).toBeInTheDocument();
  });
});
