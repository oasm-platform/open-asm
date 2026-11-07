import { server } from '@/test/mocks/node';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import type { IssueRuleDto } from '@/services/apis/gen/queries';
import { within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { members, paged, rule } from '../test-fixtures';
import { conditionsSummary, IssueRulesSection } from './issue-rules-section';

let rules: IssueRuleDto[];

beforeEach(() => {
  rules = [rule(), rule({ id: 'rule-2', name: 'Resurfaced', event: 'vulnerability.resurfaced', enabled: false, priority: 'p2', conditions: {}, defaultAssigneeId: null })];
  server.use(
    http.get('/api/workspaces/members', () => HttpResponse.json(members)),
    http.get('/api/targets', () =>
      HttpResponse.json(paged([{ id: 't-1', value: 'example.com' }])),
    ),
    http.get('/api/issues/rules', () => HttpResponse.json(rules)),
  );
});

describe('IssueRulesSection', () => {
  it('lists rules with event, conditions, priority and assignee', async () => {
    renderWithProviders(<IssueRulesSection />);
    const rows = await screen.findAllByTestId('issue-rule-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Critical & high');
    expect(rows[0]).toHaveTextContent('vulnerability.detected');
    expect(rows[0]).toHaveTextContent('Severity ≥ High');
    expect(rows[0]).toHaveTextContent('priority from severity');
    expect(await within(rows[0]).findByText(/assign Tran Ha/)).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('Every finding');
    expect(within(rows[1]).getByText('P2')).toBeInTheDocument();
  });

  it('toggles a rule with PATCH enabled', async () => {
    let call: unknown;
    server.use(
      http.patch('/api/issues/rules/:id', async ({ request, params }) => {
        call = { id: params.id, body: await request.json() };
        return HttpResponse.json(rule({ enabled: false }));
      }),
    );
    const { user } = renderWithProviders(<IssueRulesSection />);
    await user.click(await screen.findByRole('switch', { name: 'Enable Critical & high' }));
    await waitFor(() =>
      expect(call).toEqual({ id: 'rule-1', body: { enabled: false } }),
    );
  });

  it('creates a rule with the full payload', async () => {
    let body: unknown;
    server.use(
      http.post('/api/issues/rules', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(rule({ id: 'rule-3' }));
      }),
    );
    const { user } = renderWithProviders(<IssueRulesSection />);
    await user.click(await screen.findByRole('button', { name: 'Add rule' }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText('Name'), 'Edge criticals');
    await user.click(within(dialog).getByRole('combobox', { name: 'Minimum severity' }));
    await user.click(await screen.findByRole('option', { name: 'Critical' }));
    await user.type(within(dialog).getByLabelText('Minimum EPSS (0–1)'), '0.5');
    await user.click(within(dialog).getByRole('combobox', { name: 'Group findings by' }));
    await user.click(await screen.findByRole('option', { name: 'Asset' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Priority' }));
    await user.click(await screen.findByRole('option', { name: 'P1 · Urgent' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Default assignee' }));
    await user.click(await screen.findByRole('option', { name: 'Le Quang' }));
    await user.click(within(dialog).getByRole('button', { name: 'Targets' }));
    await user.click(await screen.findByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Create rule' }));

    await waitFor(() =>
      expect(body).toEqual({
        name: 'Edge criticals',
        event: 'vulnerability.detected',
        issueType: 'vulnerability_remediation',
        conditions: { minSeverity: 'critical', minEpss: 0.5, targetIds: ['t-1'] },
        groupBy: 'asset',
        priority: 'p1',
        defaultAssigneeId: 'u-2',
      }),
    );
  });

  it('offers the default rule when there are none', async () => {
    rules = [];
    let posted = false;
    server.use(
      http.post('/api/issues/rules/defaults', () => {
        posted = true;
        rules = [rule()];
        return HttpResponse.json(rules);
      }),
    );
    const { user } = renderWithProviders(<IssueRulesSection />);
    await user.click(await screen.findByRole('button', { name: 'Add default rule' }));
    await waitFor(() => expect(posted).toBe(true));
    expect(await screen.findByText('Critical & high')).toBeInTheDocument();
  });

  it('deletes a rule after confirmation', async () => {
    let deleted: string | undefined;
    server.use(
      http.delete('/api/issues/rules/:id', ({ params }) => {
        deleted = params.id as string;
        return HttpResponse.json({ message: 'ok' });
      }),
    );
    const { user } = renderWithProviders(<IssueRulesSection />);
    await user.click(await screen.findByRole('button', { name: 'Delete Resurfaced' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toBe('rule-2'));
  });

  it('summarises conditions', () => {
    expect(
      conditionsSummary(
        rule({ conditions: { minSeverity: 'medium', minEpss: 0.2, targetIds: ['a', 'b'] } }),
      ),
    ).toBe('Severity ≥ Medium · EPSS ≥ 0.2 · 2 targets');
  });
});
