import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentHttpRequestListItemDto } from '@/services/apis/gen/queries';
import { describe, expect, it, vi } from 'vitest';
import {
  NetworkLinkButton,
  NetworkLinkProvider,
  useNetworkLink,
} from './network-link';

const request = (toolCallId: string, statusCode: number) =>
  ({ id: `${toolCallId}-${statusCode}`, toolCallId, statusCode, outcome: 'allowed' }) as AgentHttpRequestListItemDto;

function Harness({ open, toolCallId }: { open: (id: string) => void; toolCallId: string }) {
  const link = useNetworkLink(
    [request('k1', 200), request('k1', 500), request('k2', 200)],
    open,
  );
  return (
    <NetworkLinkProvider value={link}>
      <NetworkLinkButton toolCallId={toolCallId} />
    </NetworkLinkProvider>
  );
}

describe('NetworkLinkButton', () => {
  it("counts a command's requests and opens them", async () => {
    const open = vi.fn();
    render(<Harness open={open} toolCallId="k1" />);

    const button = screen.getByRole('button', {
      name: 'Network: 2 requests, failed: 1',
    });
    await userEvent.click(button);
    expect(open).toHaveBeenCalledWith('k1');
  });

  it('announces only the count when nothing failed', () => {
    render(<Harness open={vi.fn()} toolCallId="k2" />);
    expect(
      screen.getByRole('button', { name: 'Network: 1 request' }),
    ).toBeInTheDocument();
  });

  it('is absent for a command with no logged requests, or outside a conversation', () => {
    const { unmount } = render(<Harness open={vi.fn()} toolCallId="k3" />);
    expect(screen.queryByRole('button')).toBeNull();
    unmount();

    render(<NetworkLinkButton toolCallId="k1" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
