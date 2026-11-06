import { server } from '@/test/mocks/node';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import type { IssueDetailDto } from '@/services/apis/gen/queries';
import { within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IssueDetail from './issue-detail';
import { baseHandlers, detail, paged } from './test-fixtures';

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, isLoading: false }),
}));
vi.mock('@/utils/authClient', () => ({
  useSession: () => ({ data: { user: { id: 'u-1', name: 'Tran Ha' } } }),
}));

let current: IssueDetailDto;

function serve(issue: IssueDetailDto) {
  current = issue;
  server.use(
    ...baseHandlers,
    http.get('/api/issues/:id', () => HttpResponse.json(current)),
  );
}

beforeEach(() => serve(detail()));

describe('IssueDetail', () => {
  it('shows the remediation section, links and automation note for remediation issues', async () => {
    renderWithProviders(<IssueDetail issueId="iss-1" />);

    const section = await screen.findByTestId('remediation-section');
    expect(section).toHaveTextContent('Vulnerabilities (1/3 fixed)');
    expect(within(section).getByText('gw.example.com:443')).toBeInTheDocument();
    expect(within(section).getByText('Dismissed')).toBeInTheDocument();
    expect(within(section).getAllByRole('link', { name: 'HTTP/2 Rapid Reset' })[0]).toHaveAttribute(
      'href',
      '/vulnerabilities/vuln-1',
    );

    const links = screen.getByTestId('issue-links');
    expect(links).toHaveTextContent('Links (3)');
    expect(links).toHaveTextContent('Deleted target');
    expect(screen.getByTestId('automation-note')).toBeInTheDocument();
    expect(screen.getByText('#12')).toBeInTheDocument();
    // Source rule name comes from the rules list.
    expect(await screen.findByText('Rule “Critical & high”')).toBeInTheDocument();
  });

  it('skips the remediation section for other types', async () => {
    serve(detail({ type: 'task', progress: null, ruleId: null }));
    renderWithProviders(<IssueDetail issueId="iss-1" />);
    await screen.findByTestId('issue-links');
    expect(screen.queryByTestId('remediation-section')).toBeNull();
    expect(screen.queryByTestId('automation-note')).toBeNull();
    expect(screen.getByText('Manual')).toBeInTheDocument();
  });

  it('asks for a resolution before closing', async () => {
    let body: unknown;
    server.use(
      http.patch('/api/issues/:id/status', async ({ request }) => {
        body = await request.json();
        current = { ...current, status: 'closed', resolution: 'wont_fix' };
        return HttpResponse.json(current);
      }),
    );
    const { user } = renderWithProviders(<IssueDetail issueId="iss-1" />);
    await user.click(await screen.findByRole('button', { name: /Change status/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Closed' }));

    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: "Won't fix" }));
    await user.type(within(dialog).getByRole('textbox'), 'not exposed');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(body).toEqual({
        status: 'closed',
        resolution: 'wont_fix',
        note: 'not exposed',
      }),
    );
  });

  it('shows the 409 explanation when a reopen collides with another open issue', async () => {
    serve(detail({ status: 'resolved', resolution: 'fixed' }));
    server.use(
      http.patch('/api/issues/:id/status', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message:
              'Another open issue already tracks the same group; link its resources there instead',
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderWithProviders(<IssueDetail issueId="iss-1" />);
    await user.click(await screen.findByRole('button', { name: /Change status/ }));
    // Reopening needs no resolution: it is sent straight away.
    await user.click(await screen.findByRole('menuitem', { name: 'Open' }));

    const alert = await screen.findByTestId('status-conflict');
    expect(alert).toHaveTextContent('Cannot reopen this issue');
    expect(alert).toHaveTextContent('Another open issue already tracks the same group');
  });

  it('links vulnerabilities from the searchable picker', async () => {
    let body: unknown;
    server.use(
      http.get('/api/vulnerabilities', () =>
        HttpResponse.json(
          paged([
            { id: 'vuln-1', name: 'HTTP/2 Rapid Reset', severity: 'high', host: 'gw' },
            { id: 'vuln-9', name: 'Exposed .git', severity: 'critical', host: 'dev' },
          ]),
        ),
      ),
      http.post('/api/issues/:id/links', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(current);
      }),
    );
    const { user } = renderWithProviders(<IssueDetail issueId="iss-1" />);
    await user.click(await screen.findByRole('button', { name: 'Add vulnerability' }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Exposed .git')).toBeInTheDocument();
    // Already linked: checked and disabled.
    expect(within(dialog).getByRole('checkbox', { name: 'Select vuln-1' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Select vuln-9' }));
    await user.click(within(dialog).getByRole('button', { name: 'Link' }));

    await waitFor(() =>
      expect(body).toEqual({
        links: [{ resourceType: 'vulnerability', resourceId: 'vuln-9' }],
      }),
    );
  });

  it('links a project by raw id', async () => {
    serve(detail({ type: 'task', progress: null }));
    let body: unknown;
    server.use(
      http.post('/api/issues/:id/links', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(current);
      }),
    );
    const { user } = renderWithProviders(<IssueDetail issueId="iss-1" />);
    const panel = await screen.findByTestId('issue-links');
    await user.click(within(panel).getByRole('button', { name: 'Link' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Project' }));
    const id = '0b9a8f62-6d0e-4a52-9a43-0c51a6f0a1b2';
    await user.type(within(dialog).getByRole('textbox', { name: 'Project ID' }), id);
    await user.click(within(dialog).getByRole('button', { name: 'Link' }));
    await waitFor(() =>
      expect(body).toEqual({ links: [{ resourceType: 'project', resourceId: id }] }),
    );
  });

  it('removes a link', async () => {
    let removed: string | undefined;
    server.use(
      http.delete('/api/issues/:id/links/:linkId', ({ params }) => {
        removed = params.linkId as string;
        return HttpResponse.json({ message: 'ok' });
      }),
    );
    const { user } = renderWithProviders(<IssueDetail issueId="iss-1" />);
    const section = await screen.findByTestId('remediation-section');
    await user.click(within(section).getAllByRole('button', { name: /Unlink/ })[0]);
    await waitFor(() => expect(removed).toBe('link-1'));
  });

  it('deletes the issue after an in-page confirmation', async () => {
    let deleted = false;
    server.use(
      http.delete('/api/issues/:id', () => {
        deleted = true;
        return HttpResponse.json({ message: 'ok' });
      }),
    );
    const { user } = renderWithProviders(<IssueDetail issueId="iss-1" />);
    await user.click(await screen.findByRole('button', { name: 'Delete issue' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete #12?');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it('renames the issue inline', async () => {
    let body: unknown;
    server.use(
      http.patch('/api/issues/:id', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(current);
      }),
    );
    const { user } = renderWithProviders(<IssueDetail issueId="iss-1" />);
    await user.click(await screen.findByRole('button', { name: 'Edit title' }));
    const input = screen.getByRole('textbox', { name: 'Issue title' });
    await user.clear(input);
    await user.type(input, 'Patch edge proxies{Enter}');
    await waitFor(() => expect(body).toEqual({ title: 'Patch edge proxies' }));
  });
});
