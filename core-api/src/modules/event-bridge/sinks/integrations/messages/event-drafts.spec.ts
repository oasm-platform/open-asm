import { AuditActorType, AuditOutcome, Severity } from '@/common/enums/enum';
import type { DetectedVulnerability } from '../../../contracts/event-payloads';
import type { ConsumedEvent } from '../../../contracts/event-envelope';
import { describeIncompleteSteps } from '../../shared/run-steps';
import { draftMessage } from './event-drafts';
import { formatForAppType, renderMessage } from './render';

/**
 * The view layer: full event payloads in, rendered chat text out.
 *
 * Run: task api:test:one SPEC=src/modules/event-bridge/sinks/integrations/messages/event-drafts.spec.ts
 */
describe('event drafts + render', () => {
  const base: ConsumedEvent = {
    eventId: 'evt-1',
    workspaceId: 'ws-1',
    outcome: AuditOutcome.Success,
    occurredAt: '2026-10-11T10:05:00.000Z',
  };

  const vuln = (
    id: string,
    severity: Severity,
    extra: Partial<DetectedVulnerability> = {},
  ): DetectedVulnerability => ({ id, name: `Finding ${id}`, severity, ...extra });

  const vulnerabilities: DetectedVulnerability[] = [
    vuln('m1', Severity.MEDIUM),
    vuln('h1', Severity.HIGH, { cvssScore: 7.1 }),
    vuln('c1', Severity.CRITICAL, {
      name: 'SQL Injection <script>',
      cvssScore: 9.8,
      cveId: ['CVE-2024-1234'],
      affectedUrl: 'https://app.example.com/login',
    }),
    vuln('h2', Severity.HIGH, { cvssScore: 8.2 }),
    vuln('m2', Severity.MEDIUM),
    vuln('m3', Severity.MEDIUM),
    vuln('m4', Severity.MEDIUM),
  ];

  const detected: ConsumedEvent = {
    ...base,
    payload: { assetValue: 'app.example.com', vulnerabilities },
  };

  const render = (
    name: Parameters<typeof draftMessage>[0],
    event: ConsumedEvent,
    appType = 'webhook',
  ) => renderMessage(draftMessage(name, event), formatForAppType(appType));

  it('maps app types to their markup dialect', () => {
    expect(formatForAppType('telegram')).toBe('telegram');
    expect(formatForAppType('slack')).toBe('slack');
    expect(formatForAppType('discord')).toBe('discord');
    expect(formatForAppType('webhook')).toBe('plain');
  });

  it('derives counts, severity breakdown and a worst-first preview', () => {
    const text = render('vulnerability.detected', detected);

    expect(text).toContain('🚨 7 new vulnerabilities found');
    expect(text).toContain('Severity: 🔴 1 critical · 🟠 2 high · 🟡 4 medium');
    expect(text).toContain('Top findings');

    const items = text.split('\n').filter((l) => l.startsWith('• '));
    expect(items).toHaveLength(5);
    // critical first, then high by CVSS desc, then medium.
    expect(items[0]).toContain('SQL Injection');
    expect(items[1]).toContain('Finding h2');
    expect(items[2]).toContain('Finding h1');
    expect(text).toContain('…and 2 more');
  });

  it('renders escaped Telegram HTML', () => {
    const text = render('vulnerability.detected', detected, 'telegram');

    expect(text).toContain('🚨 <b>7 new vulnerabilities found</b>');
    expect(text).toContain('<b>Asset:</b> <code>app.example.com</code>');
    expect(text).toContain(
      '• 🔴 <b>SQL Injection &lt;script&gt;</b> — <code>CVE-2024-1234</code> (CVSS 9.8) @ <code>https://app.example.com/login</code>',
    );
    expect(text).toContain('🕒 2026-10-11 10:05 UTC');
    expect(text).not.toContain('<script>');
  });

  it('omits the CVSS score of an unscored finding', () => {
    const text = render('vulnerability.detected', {
      ...base,
      payload: {
        assetValue: 'scanme.sh',
        vulnerabilities: [
          vuln('i1', Severity.INFO, {
            name: 'HTTP Missing Security Headers',
            cvssScore: 0,
            affectedUrl: 'https://scanme.sh',
          }),
        ],
      },
    });
    expect(text).toContain('• 🔵 HTTP Missing Security Headers @ https://scanme.sh');
    expect(text).not.toContain('CVSS');
  });

  it('renders Slack mrkdwn and plain text from the same draft', () => {
    const slack = render('vulnerability.detected', detected, 'slack');
    const plain = render('vulnerability.detected', detected, 'webhook');

    expect(slack).toContain('*Asset:* `app.example.com`');
    expect(plain).toContain('Asset: app.example.com');
    expect(plain).not.toMatch(/[*`]|<b>/);
  });

  it('renders Discord markdown and escapes markup in values', () => {
    const discord = render('vulnerability.detected', detected, 'discord');
    expect(discord).toContain('**Asset:** `app.example.com`');

    const hostile = render(
      'vulnerability.detected',
      { ...detected, payload: { assetValue: 'a`b', vulnerabilities: [] } },
      'discord',
    );
    expect(hostile).toContain("`a'b`");
  });

  it('previews the new URLs of a URL discovery run', () => {
    const text = render('asset.url.discovered', {
      ...base,
      payload: {
        targetValue: 'example.com',
        count: 37,
        urls: Array.from({ length: 10 }, (_, i) => `https://example.com/p${i}`),
      },
    });

    expect(text).toContain('🔗 37 new URLs found');
    expect(text).toContain('Target: example.com');
    const items = text.split('\n').filter((l) => l.startsWith('• '));
    expect(items).toHaveLength(5);
    expect(items[0]).toContain('https://example.com/p0');
    expect(text).toContain('…and 32 more');

    const one = render('asset.url.discovered', {
      ...base,
      payload: { targetValue: 'example.com', count: 1, urls: ['https://example.com/'] },
    });
    expect(one).toContain('🔗 1 new URL found');
    expect(one).not.toContain('more');
  });

  it('describes a complete and an incomplete scan run', () => {
    const payload = {
      targetValue: 'example.com',
      hosts: 3,
      ports: 1,
      techs: 0,
      failedSteps: [],
      blockedSteps: [],
      cancelledSteps: [],
    };

    const done = render('workflow.run.completed', { ...base, payload });
    expect(done).toContain('✅ Scan completed');
    expect(done).toContain('New assets: 3 hosts · 1 port');
    expect(done).not.toContain('Details');

    const partial = render('workflow.run.completed', {
      ...base,
      outcome: AuditOutcome.Failure,
      payload: { ...payload, failedSteps: ['nuclei'] },
    });
    expect(partial).toContain('⚠️ Scan finished incomplete');
    expect(partial).toContain('Details: nuclei failed');
  });

  it('lists the hosts a scan found first', () => {
    const text = render('workflow.run.completed', {
      ...base,
      payload: {
        targetValue: 'example.com',
        hosts: 7,
        failedSteps: [],
        blockedSteps: [],
        cancelledSteps: [],
        newHosts: ['a.example.com', 'b.example.com', 'c.example.com', 'd.example.com', 'e.example.com', 'f.example.com'],
        newHostsTotal: 7,
      },
    });

    expect(text).toContain('New hosts');
    const items = text.split('\n').filter((l) => l.startsWith('• '));
    expect(items).toHaveLength(5);
    expect(items[0]).toContain('a.example.com');
    expect(text).toContain('…and 2 more');
  });

  it('omits the host list for events published before runs named them', () => {
    const text = render('workflow.run.completed', {
      ...base,
      payload: { targetValue: 'example.com', hosts: 3, failedSteps: [], blockedSteps: [], cancelledSteps: [] },
    });
    expect(text).not.toContain('New hosts');
  });

  it('words the unfinished steps', () => {
    expect(
      describeIncompleteSteps({
        failedSteps: ['port_scan'],
        blockedSteps: ['http_probe'],
        cancelledSteps: [],
      }),
    ).toBe('port_scan failed; http_probe skipped after a failure');
    expect(describeIncompleteSteps({})).toBe('');
  });

  it('names the actor on a bulk status change', () => {
    const text = render('vulnerability.status.updated', {
      ...base,
      actor: { type: AuditActorType.User, name: 'Alice' },
      metadata: { action: 'dismiss', count: 3 },
    });
    expect(text).toContain('🔕 3 vulnerabilities dismissed');
    expect(text).toContain('👤 Alice');
  });

  it('falls back to the catalog summary for events without a draft', () => {
    const text = render('integration.sync.failed', {
      ...base,
      outcome: AuditOutcome.Failure,
      payload: { appType: 'aws', reason: 'AccessDenied' },
    });
    expect(text).toContain('❌ Integration sync failed');
    expect(text).toContain('App type: aws');
    expect(text).toContain('Reason: AccessDenied');
  });
});
