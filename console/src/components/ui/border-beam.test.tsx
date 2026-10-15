import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BorderBeam } from './border-beam';

const motion = vi.hoisted(() => ({ reduce: false }));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => motion.reduce,
}));

describe('BorderBeam', () => {
  it('renders nothing until played', () => {
    render(<BorderBeam playKey={0} />);

    expect(screen.queryByTestId('border-beam')).toBeNull();
  });

  it('replays as a fresh element for each new playKey', () => {
    const { rerender } = render(<BorderBeam playKey={1} />);
    const first = screen.getByTestId('border-beam');
    expect(first.getAttribute('aria-hidden')).toBe('true');

    rerender(<BorderBeam playKey={2} />);

    expect(screen.getByTestId('border-beam')).not.toBe(first);
  });

  it('stays off with reduced motion and reports the lap done at once', () => {
    motion.reduce = true;
    const onComplete = vi.fn();
    render(<BorderBeam playKey={1} onComplete={onComplete} />);
    motion.reduce = false;

    expect(screen.queryByTestId('border-beam')).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
