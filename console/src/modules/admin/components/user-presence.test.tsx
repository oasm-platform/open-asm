import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserPresence } from './user-presence';

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe('UserPresence', () => {
  it('shows a user active in the last minute as online', () => {
    render(<UserPresence lastActiveAt={ago(30_000)} />);

    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('shows how long ago an older activity was', () => {
    render(<UserPresence lastActiveAt={ago(5 * 60_000)} />);

    expect(screen.queryByText('Online')).not.toBeInTheDocument();
    expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
  });

  it('shows a dash when no activity is recorded', () => {
    render(<UserPresence lastActiveAt={null} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
