import { EventBusGroup } from '@/common/enums/enum';
import type { ConsumedEvent } from '../../contracts/event-envelope';
import { SUBSCRIPTIONS } from '../../routing/subscriptions';
import { issueFactOf, IssuesSink } from './issues.sink';

const event = (payload: unknown, eventId = 'e-1'): ConsumedEvent => ({
  eventId,
  workspaceId: 'ws-1',
  payload,
});

function setup() {
  const issues = { onVulnerabilityEvent: jest.fn() };
  const handled = new Set<string>();
  const redis = {
    get: jest.fn((key: string) => Promise.resolve(handled.has(key) ? '1' : null)),
    setex: jest.fn((key: string) => {
      handled.add(key);
      return Promise.resolve('OK');
    }),
  };
  const sink = new IssuesSink(issues, redis as never);
  return { sink, issues, redis };
}

describe('IssuesSink', () => {
  it('is the issues lane on the vulnerability domain, taking the three finding events', () => {
    const { sink } = setup();
    expect(sink.group).toBe(EventBusGroup.Issues);
    expect(sink.domains).toBe(SUBSCRIPTIONS[EventBusGroup.Issues]);
    expect(SUBSCRIPTIONS[EventBusGroup.Issues]).toEqual(['vulnerability']);
    expect(sink.accepts('vulnerability.detected')).toBe(true);
    expect(sink.accepts('vulnerability.resurfaced')).toBe(true);
    expect(sink.accepts('vulnerability.fixed')).toBe(true);
    expect(sink.accepts('vulnerability.dismissed')).toBe(false);
    expect(sink.accepts('vulnerability.proposed')).toBe(false);
    expect(sink.accepts('issue.created')).toBe(false);
  });

  it('routes detected findings with their ids, de-duplicated', async () => {
    const { sink, issues } = setup();
    await sink.handle(
      'vulnerability.detected',
      event({
        jobId: 'j-1',
        assetId: 'a-1',
        vulnerabilities: [{ id: 'v-1' }, { id: 'v-1' }, { id: 'v-2' }, {}],
      }),
    );
    expect(issues.onVulnerabilityEvent).toHaveBeenCalledWith({
      event: 'vulnerability.detected',
      workspaceId: 'ws-1',
      vulnerabilityIds: ['v-1', 'v-2'],
      jobId: 'j-1',
    });
  });

  it('routes resurfaced and fixed findings', async () => {
    const { sink, issues } = setup();
    await sink.handle(
      'vulnerability.resurfaced',
      event({ vulnerabilities: [{ id: 'v-1' }] }, 'e-1'),
    );
    await sink.handle(
      'vulnerability.fixed',
      event({ vulnerabilityIds: ['v-2'], jobHistoryId: 'run-1' }, 'e-2'),
    );
    expect(issues.onVulnerabilityEvent).toHaveBeenNthCalledWith(1, {
      event: 'vulnerability.resurfaced',
      workspaceId: 'ws-1',
      vulnerabilityIds: ['v-1'],
    });
    expect(issues.onVulnerabilityEvent).toHaveBeenNthCalledWith(2, {
      event: 'vulnerability.fixed',
      workspaceId: 'ws-1',
      vulnerabilityIds: ['v-2'],
      jobHistoryId: 'run-1',
    });
  });

  it('acknowledges payloads without findings without work', async () => {
    const { sink, issues } = setup();
    await sink.handle('vulnerability.detected', event(null));
    await sink.handle('vulnerability.fixed', event({ vulnerabilityIds: [] }));
    await sink.handle('vulnerability.fixed', event({ vulnerabilityIds: 'v-1' }));
    expect(issues.onVulnerabilityEvent).not.toHaveBeenCalled();
  });

  it('handles an event once, however often it is delivered', async () => {
    const { sink, issues } = setup();
    const fixed = event({ vulnerabilityIds: ['v-1'] });
    await sink.handle('vulnerability.fixed', fixed);
    await sink.handle('vulnerability.fixed', fixed);
    expect(issues.onVulnerabilityEvent).toHaveBeenCalledTimes(1);
  });

  it('redoes the work after a failure, since nothing marked it handled', async () => {
    const { sink, issues } = setup();
    issues.onVulnerabilityEvent.mockRejectedValueOnce(new Error('db down'));
    const fixed = event({ vulnerabilityIds: ['v-1'] });
    await expect(sink.handle('vulnerability.fixed', fixed)).rejects.toThrow('db down');
    await sink.handle('vulnerability.fixed', fixed);
    expect(issues.onVulnerabilityEvent).toHaveBeenCalledTimes(2);
  });

  it('reads no fact from other events', () => {
    expect(issueFactOf('asset.discovered', event({ assetIds: ['a'] }))).toBeNull();
  });
});
