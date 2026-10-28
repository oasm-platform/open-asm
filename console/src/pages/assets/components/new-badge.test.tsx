import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NewBadge } from './new-badge';

describe('NewBadge', () => {
  it('shows "New" for a row the latest finished scan found', () => {
    const { container } = render(<NewBadge isNew />);
    expect(container.textContent).toBe('New');
  });

  it('counts the new services of a port that is only partly new', () => {
    expect(render(<NewBadge count={2} />).container.textContent).toBe('2 new');
    // A fully new port says "New", not a count.
    expect(render(<NewBadge isNew count={2} />).container.textContent).toBe(
      'New',
    );
  });

  it('renders nothing otherwise, including rows from before tracking', () => {
    expect(render(<NewBadge isNew={false} />).container.textContent).toBe('');
    expect(render(<NewBadge count={0} />).container.textContent).toBe('');
    expect(render(<NewBadge />).container.textContent).toBe('');
  });
});
