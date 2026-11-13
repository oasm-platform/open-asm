import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './command-palette';

const navigateMock = vi.fn();
const searchState = vi.hoisted(() => ({
  current: {} as { data?: unknown; isFetching: boolean },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

// The debounce is not under test: hand the typed value straight through.
vi.mock('@/hooks/use-debounce', () => ({
  default: <T,>(value: T) => value,
}));

vi.mock('@/components/common/layout/menu-bar', () => ({
  menu: [{ items: [{ title: 'Assets', url: '/assets', icon: null }] }],
}));

vi.mock('@/services/apis/gen/queries', () => ({
  useSearchControllerSearchAssetsTargets: () => searchState.current,
}));

const empty = {
  total: 0,
  data: { targets: [], assets: [], vulnerabilities: [] },
};

async function openAndType(text: string) {
  const user = userEvent.setup();
  render(<CommandPalette />);
  await user.click(screen.getByRole('button', { name: 'Open command palette' }));
  await user.type(screen.getByRole('combobox'), text);
  return user;
}

describe('CommandPalette Ask AI', () => {
  beforeAll(() => {
    // jsdom has no ResizeObserver; cmdk measures the list with it
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  beforeEach(() => {
    navigateMock.mockReset();
    searchState.current = { data: empty, isFetching: false };
  });

  it('offers Ask AI when nothing matches and opens AI Studio in ask mode', async () => {
    const user = await openAndType('  zero-day  ');
    await user.click(screen.getByRole('option', { name: /Ask AI about/ }));
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/aistudio',
      search: { text: 'zero-day', mode: 'ask' },
    });
    // The palette closes after the pick
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('opens Ask AI on Enter when it is the only item', async () => {
    const user = await openAndType('zero-day');
    await user.keyboard('{Enter}');
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/aistudio',
      search: { text: 'zero-day', mode: 'ask' },
    });
  });

  it('hides Ask AI while the search is loading', async () => {
    searchState.current = { data: undefined, isFetching: true };
    await openAndType('zero-day');
    expect(screen.queryByText(/Ask AI/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Searching…');
  });

  it('hides Ask AI when the server found something', async () => {
    searchState.current = {
      data: {
        total: 1,
        data: {
          targets: [{ id: 't1', value: 'zero-day.example.com' }],
          assets: [],
          vulnerabilities: [],
        },
      },
      isFetching: false,
    };
    await openAndType('zero-day');
    expect(screen.getByText('zero-day.example.com')).toBeInTheDocument();
    expect(screen.queryByText(/Ask AI/)).not.toBeInTheDocument();
  });

  it('hides Ask AI when a page matches', async () => {
    await openAndType('assets');
    expect(screen.getByRole('option', { name: /Assets/ })).toBeInTheDocument();
    expect(screen.queryByText(/Ask AI/)).not.toBeInTheDocument();
  });

  it('hides Ask AI for an empty input', async () => {
    await openAndType('   ');
    expect(screen.queryByText(/Ask AI/)).not.toBeInTheDocument();
  });
});
