import type { Page, Route } from '@playwright/test';
import { test, expect } from '../helpers/auth';

/**
 * Vulnerability lifecycle UI against a stubbed vulnerabilities API, so the
 * specs do not depend on what the shared test database holds. Session,
 * workspace and permission calls still hit the real API.
 */

const day = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * day).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * day).toISOString();

const finding = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'PHP-CGI argument injection',
  severity: 'critical',
  detectionStatus: 'resurfaced',
  reviewStatus: 'approved',
  discoveredBy: 'tool',
  timesDetected: 6,
  resurfacedCount: 1,
  firstDetectedDate: ago(41),
  lastSeenDate: ago(1),
  lastSeenJobHistoryId: 'aaaaaaaa-0000-4000-8000-000000000001',
  fixedAt: ago(30),
  fixedByJobHistoryId: 'aaaaaaaa-0000-4000-8000-000000000002',
  dueAt: ahead(2),
  asset: { id: 'asset-1', value: 'billing.example.com:443', targetId: 'target-1' },
  tool: { id: 'tool-1', name: 'nuclei' },
  host: 'billing.example.com',
  ports: ['443'],
  tags: [],
  references: [],
  authors: [],
  cveId: ['CVE-2024-4577'],
  cweId: [],
  bidId: [],
  ceaId: [],
  iava: [],
  extractedResults: [],
  description: 'Argument injection in PHP-CGI.',
  analyzeStatus: 'not_analyzed',
  analyzeResult: '',
  dismissal: null,
  openIssue: null,
  createdAt: ago(41),
  updatedAt: ago(1),
};

const proposal = {
  ...finding,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'SQL injection (time-based) in id',
  severity: 'high',
  detectionStatus: 'new',
  reviewStatus: 'pending_review',
  discoveredBy: 'ai_tool',
  timesDetected: 0,
  resurfacedCount: 0,
  dueAt: null,
  fixedAt: null,
  cweId: ['CWE-89'],
};

const listSources = { sources: [{ kind: 'tool', toolName: 'nuclei' }] };
const detailSources = [
  {
    id: 'src-ai',
    kind: 'ai_agent',
    tool: null,
    agentName: 'pentest',
    agentConversationId: '33333333-3333-4333-8333-333333333333',
    toolCallIds: ['call-1'],
    evidence: {
      requests: ["GET /api/v1/orders?id=1042' AND SLEEP(5)-- -"],
      responses: ['200 in 5.02 s'],
      baseline: 'SLEEP(0) → 0.09 s',
    },
    createdBy: null,
    createdAt: ago(1),
  },
];

const stats = {
  data: [
    { severity: 'critical', count: 9 },
    { severity: 'high', count: 31 },
  ],
  byDetectionStatus: { new: 12, active: 132, resurfaced: 4, fixed: 412 },
  newLast7Days: 12,
  resurfacedLast30Days: 4,
  fixedLast30Days: 37,
  overdue: 9,
  pendingReview: 1,
  mttr: [{ severity: 'high', days: 18, count: 3 }],
};

const settings = {
  slaDays: { critical: 7, high: 30, medium: 90, low: 120, info: null },
  slaRestartOnResurface: true,
  autoCloseEnabled: true,
  autoCloseMissedScans: 1,
  riskAcceptMaxDays: 180,
};

const timeline = {
  data: [
    {
      id: 'e2',
      type: 'status_changed',
      fromStatus: 'fixed',
      toStatus: 'resurfaced',
      jobHistoryId: 'aaaaaaaa-0000-4000-8000-000000000003',
      actor: null,
      data: { reason: 'detected_by_scan' },
      occurredAt: ago(5),
    },
    {
      id: 'e1',
      type: 'detected',
      toStatus: 'new',
      jobHistoryId: 'aaaaaaaa-0000-4000-8000-000000000004',
      actor: null,
      data: {},
      occurredAt: ago(41),
    },
  ],
};

interface Recorded {
  method: string;
  path: string;
  status?: string | null;
  body?: unknown;
}

async function stubVulnerabilities(page: Page): Promise<Recorded[]> {
  const calls: Recorded[] = [];
  await page.route('**/api/vulnerabilities**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    calls.push({
      method: req.method(),
      path,
      status: url.searchParams.get('status'),
      body: req.postDataJSON?.() ?? undefined,
    });
    const json = (body: unknown) => route.fulfill({ json: body });

    if (path.endsWith('/statistics')) return json(stats);
    if (path.endsWith('/settings')) return json(settings);
    if (path.endsWith('/timeline')) return json(timeline);
    if (path.endsWith('/review/duplicates')) return json({ data: [] });
    if (path.endsWith('/review/approve') || path.endsWith('/review/reject'))
      return json({ id: proposal.id, reviewStatus: 'approved', detectionStatus: 'new', severity: 'high' });
    if (path.endsWith(`/${finding.id}`))
      return json({ ...finding, sources: [{ id: 's1', kind: 'tool', tool: finding.tool, jobHistoryId: 'aaaaaaaa-0000-4000-8000-000000000004', createdBy: null, createdAt: ago(41) }], reviewedByUser: null, fixClaimedByUser: null });
    if (path.endsWith(`/${proposal.id}`))
      return json({ ...proposal, sources: detailSources, reviewedByUser: null, fixClaimedByUser: null });
    if (path.endsWith('/api/vulnerabilities')) {
      const status = url.searchParams.get('status') ?? 'open';
      const data =
        status === 'pending_review'
          ? [{ ...proposal, sources: [{ kind: 'ai_agent', agentName: 'pentest' }] }]
          : [{ ...finding, ...listSources }];
      return json({ data, total: data.length, page: 1, limit: 10, hasNextPage: false, pageCount: 1 });
    }
    return route.continue();
  });
  return calls;
}

test.describe('Vulnerability lifecycle', () => {
  test('list shows status tabs with counts and filters by tab', async ({ adminPage: page }) => {
    const calls = await stubVulnerabilities(page);
    await page.goto('/vulnerabilities');

    const tabs = page.getByRole('tablist', { name: 'Vulnerability status' });
    await expect(tabs.getByRole('tab', { name: /Active/ })).toContainText('132');
    await expect(page.getByText('PHP-CGI argument injection')).toBeVisible();
    await expect(page.getByText('billing.example.com:443 · nuclei')).toBeVisible();
    await expect(page.getByText('×6')).toBeVisible();

    await tabs.getByRole('tab', { name: /Pending review \(AI\)/ }).click();
    await expect(page).toHaveURL(/status=pending_review/);
    await expect(page.getByText('SQL injection (time-based) in id')).toBeVisible();
    expect(calls.some((c) => c.status === 'pending_review')).toBe(true);
  });

  test('detail shows the lifecycle card and the timeline', async ({ adminPage: page }) => {
    await stubVulnerabilities(page);
    await page.goto(`/vulnerabilities/${finding.id}`);

    await expect(page.getByTestId('resurfaced-banner')).toBeVisible();
    await expect(page.getByTestId('lifecycle-card')).toContainText('6 times · resurfaced 1');
    await expect(page.getByTestId('sla-card')).toContainText('SLA · Critical 7 days');

    await page.getByRole('tab', { name: 'Timeline' }).click();
    const timelineList = page.getByRole('list', { name: 'Timeline' });
    await expect(timelineList.getByRole('listitem')).toHaveCount(2);
    await expect(timelineList).toContainText('Fixed → Resurfaced');
    await expect(timelineList).toContainText('First detected');
  });

  test('review flow: reject needs a reason, approve posts the decision', async ({
    adminPage: page,
  }) => {
    const calls = await stubVulnerabilities(page);
    await page.goto(`/vulnerabilities/${proposal.id}`);

    await expect(page.getByTestId('evidence-card')).toContainText('SLEEP(5)');
    await expect(page.getByTestId('proposal-card')).toContainText('Pending review');

    await page.getByRole('button', { name: /Reject/ }).click();
    const rejectDialog = page.getByRole('dialog');
    await rejectDialog.getByRole('button', { name: 'Reject' }).click();
    await expect(rejectDialog.getByRole('alert')).toHaveText('A reason is required.');
    await rejectDialog.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: /^Approve$/ }).click();
    const approveDialog = page.getByRole('dialog');
    await approveDialog.getByLabel(/Note/).fill('Reproduced');
    await approveDialog.getByRole('button', { name: 'Approve' }).click();

    await expect
      .poll(() => calls.find((c) => c.path.endsWith('/review/approve'))?.body)
      .toEqual({ note: 'Reproduced' });
  });
});
