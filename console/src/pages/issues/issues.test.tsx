import { server } from '@/test/mocks/node';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Issues, { tabParams } from './issues';
import { baseHandlers, listItem, paged } from './test-fixtures';

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, isLoading: false }),
}));

let requests: URL[] = [];
/** Requests of the table itself (tab counters ask for one row). */
const tableRequests = () =>
  requests.filter((url) => url.searchParams.get('limit') !== '1');
const lastTableRequest = () => tableRequests().at(-1)!;

beforeEach(() => {
  requests = [];
  server.use(
    ...baseHandlers,
    http.get('/api/issues', ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json(
        paged([
          listItem(),
          listItem({
            id: 'iss-2',
            no: 16,
            title: 'Review partner API keys',
            type: 'task',
            status: 'open',
            priority: 'p3',
            ruleId: null,
            progress: null,
            linkCount: 1,
            assignee: null,
            dueAt: null,
          }),
        ]),
      );
    }),
  );
});

describe('Issues list', () => {
  it('renders number, type, priority, due, progress and source', async () => {
    renderWithProviders(<Issues />);

    expect(await screen.findByText('#12')).toBeInTheDocument();
    expect(screen.getByText('#16')).toBeInTheDocument();
    expect(screen.getByText('3 vulnerabilities')).toBeInTheDocument();
    expect(screen.getByText('1 linked resource')).toBeInTheDocument();
    expect(screen.getByText('Vulnerability remediation')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    // A task has no progress: the cell shows a dash.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    const p1 = screen.getByText('P1');
    expect(p1).toHaveAttribute('data-priority', 'p1');
    expect(screen.getByText(/overdue/)).toHaveAttribute('data-due', 'overdue');
    expect(screen.getByText('Rule')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('defaults to the Open tab (open + in progress)', async () => {
    renderWithProviders(<Issues />);
    await screen.findByText('#12');
    const url = lastTableRequest();
    expect(url.searchParams.getAll('status')).toEqual(['open', 'in_progress']);
    expect(url.searchParams.get('limit')).toBe('20');
  });

  it('switching tabs and filters changes the query params', async () => {
    const { user } = renderWithProviders(<Issues />);
    await screen.findByText('#12');

    await user.click(screen.getByRole('tab', { name: /Overdue/ }));
    await waitFor(() =>
      expect(lastTableRequest().searchParams.get('overdue')).toBe('true'),
    );

    await user.click(screen.getByRole('combobox', { name: 'Type filter' }));
    await user.click(await screen.findByRole('option', { name: 'Task' }));
    await waitFor(() =>
      expect(lastTableRequest().searchParams.getAll('type')).toEqual(['task']),
    );

    await user.click(screen.getByRole('combobox', { name: 'Priority filter' }));
    await user.click(await screen.findByRole('option', { name: 'P1 · Urgent' }));
    await waitFor(() =>
      expect(lastTableRequest().searchParams.getAll('priority')).toEqual(['p1']),
    );

    await user.click(screen.getByRole('combobox', { name: 'Assignee filter' }));
    await user.click(await screen.findByRole('option', { name: 'Le Quang' }));
    await waitFor(() =>
      expect(lastTableRequest().searchParams.get('assigneeId')).toBe('u-2'),
    );

    await user.type(screen.getByRole('textbox', { name: 'Search issues' }), '#12');
    await waitFor(
      () => expect(lastTableRequest().searchParams.get('search')).toBe('#12'),
      { timeout: 2000 },
    );
    // Filters stack on the tab.
    expect(lastTableRequest().searchParams.get('overdue')).toBe('true');
  });

  it('reads filters from the URL', async () => {
    renderWithProviders(<Issues />, {
      initialEntries: ['/?tab=mine&status=in_progress'],
    });
    await screen.findByText('#12');
    const url = lastTableRequest();
    expect(url.searchParams.get('mine')).toBe('true');
    expect(url.searchParams.getAll('status')).toEqual(['in_progress']);
  });

  it('creates an issue from the dialog', async () => {
    let body: unknown;
    server.use(
      http.post('/api/issues', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...listItem({ id: 'iss-9', no: 30 }), links: [] });
      }),
    );
    const { user } = renderWithProviders(<Issues />);
    await user.click(await screen.findByRole('button', { name: 'New issue' }));
    await user.type(screen.getByLabelText('Title'), 'Rotate partner keys');
    await user.click(screen.getByRole('combobox', { name: 'Priority' }));
    await user.click(await screen.findByRole('option', { name: 'P2 · High' }));
    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(await screen.findByRole('option', { name: 'Tran Ha' }));
    await user.type(screen.getByLabelText('Description'), 'Quarterly');
    await user.click(screen.getByRole('button', { name: 'Create issue' }));
    await waitFor(() =>
      expect(body).toEqual({
        title: 'Rotate partner keys',
        type: 'task',
        priority: 'p2',
        dueAt: null,
        assigneeId: 'u-1',
        description: 'Quarterly',
      }),
    );
  });

  it('maps every tab to its base filter', () => {
    expect(tabParams('mine')).toEqual({ mine: true, status: ['open', 'in_progress'] });
    expect(tabParams('resolved')).toEqual({ status: ['resolved', 'closed'] });
    expect(tabParams('all')).toEqual({});
  });
});
