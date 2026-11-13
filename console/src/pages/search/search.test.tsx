import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Search from './search';

const navigateMock = vi.fn();
const refetchMock = vi.fn();
const state = vi.hoisted(() => ({
  query: '',
  search: {} as { data?: unknown; isFetching: boolean; isError: boolean },
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({ useSearch: () => ({ query: state.query }) }),
  useNavigate: () => navigateMock,
}));

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'ws-1' } }),
}));

vi.mock('@/services/apis/gen/queries', () => ({
  useSearchControllerSearchAssetsTargets: () => ({
    ...state.search,
    refetch: refetchMock,
  }),
}));

const empty = {
  total: 0,
  data: { targets: [], assets: [], vulnerabilities: [] },
};

describe('Search page Ask AI', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    state.query = 'nginx 1.18 ';
    state.search = { data: empty, isFetching: false, isError: false };
  });

  it('offers Ask AI on no results and opens AI Studio with the query', async () => {
    const user = userEvent.setup();
    render(<Search />);
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.getByText(/Nothing matched “nginx 1.18”/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/aistudio',
      search: { text: 'nginx 1.18', mode: 'ask' },
    });
  });

  it('clears the query from the URL, not only the input', async () => {
    const user = userEvent.setup();
    render(<Search />);
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/search',
      search: { query: '' },
    });
    expect(screen.getByRole('textbox', { name: 'Search query' })).toHaveValue('');
  });

  it('hides Ask AI while searching', () => {
    state.search = { data: undefined, isFetching: true, isError: false };
    render(<Search />);
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument();
  });

  it('shows only the error state when the search fails', () => {
    state.search = { data: undefined, isFetching: false, isError: true };
    render(<Search />);
    expect(screen.getByText('Search failed')).toBeInTheDocument();
    expect(screen.queryByText('No results')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument();
  });

  it('hides Ask AI before anything was searched', () => {
    state.query = '';
    render(<Search />);
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument();
  });

  it('hides Ask AI when there are results', () => {
    state.search = {
      data: {
        total: 1,
        data: {
          targets: [{ id: 't1', value: 'nginx.example.com' }],
          assets: [],
          vulnerabilities: [],
        },
      },
      isFetching: false,
      isError: false,
    };
    render(<Search />);
    expect(screen.getByText('nginx.example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument();
  });
});
