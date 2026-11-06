import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TypewriterText from '@/components/typewriter-text';

describe('TypewriterText', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts over when switched to a shorter list', () => {
    vi.useFakeTimers();
    // Picks the last text of the long list
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const { rerender } = render(<TypewriterText texts={['a', 'b', 'c', 'd']} />);
    act(() => vi.advanceTimersByTime(50));
    expect(screen.getByText('d')).toBeInTheDocument();

    rerender(<TypewriterText texts={['xy', 'zw']} />);
    // One character per tick
    act(() => vi.advanceTimersByTime(50));
    act(() => vi.advanceTimersByTime(50));
    expect(screen.getByText('zw')).toBeInTheDocument();
  });
});
