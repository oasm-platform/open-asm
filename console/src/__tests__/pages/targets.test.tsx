import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/node';
import Targets from '@/pages/targets/targets';

describe('Targets Page', () => {
  it('renders targets table with data', async () => {
    renderWithProviders(<Targets />, {
      routePath: '/_authed/targets/',
      initialEntries: ['/_authed/targets/'],
    });

    await waitFor(() => {
      expect(screen.getByText('example.com')).toBeInTheDocument();
      expect(screen.getByText('192.168.1.1')).toBeInTheDocument();
    });

    expect(screen.getByText('Target')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('DOMAIN')).toBeInTheDocument();
    expect(screen.getByText('IP')).toBeInTheDocument();
  });

  it('shows empty state when no targets', async () => {
    server.use(
      http.get('/api/targets', () => {
        return HttpResponse.json({
          data: [],
          total: 0,
          page: 1,
          totalPages: 0,
        });
      }),
    );

    renderWithProviders(<Targets />, {
      routePath: '/_authed/targets/',
      initialEntries: ['/_authed/targets/'],
    });

    await waitFor(() => {
      expect(screen.getByText('No data')).toBeInTheDocument();
    });
  });

  it('handles search/filter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Targets />, {
      routePath: '/_authed/targets/',
      initialEntries: ['/_authed/targets/'],
    });

    await waitFor(() => {
      expect(screen.getByText('example.com')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search');
    await user.type(searchInput, 'example');

    await waitFor(() => {
      expect(searchInput).toHaveValue('example');
    });
  });
});
