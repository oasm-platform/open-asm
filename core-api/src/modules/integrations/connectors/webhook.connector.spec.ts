import { WebhookConnector } from './webhook.connector';

describe('WebhookConnector', () => {
  const url = 'https://hooks.example.com/webhook';
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
  });

  const sentBody = () =>
    JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;

  it('posts the event envelope, not the rendered text', async () => {
    const payload = { vulnerabilities: [{ name: 'XSS', severity: 'high' }] };

    await new WebhookConnector().push({
      url,
      text: '🚨 New vulnerability',
      title: 'New vulnerability',
      type: 'vulnerability.detected',
      eventId: 'evt-1',
      workspaceId: 'ws-1',
      occurredAt: '2026-10-22T10:00:00.000Z',
      outcome: 'success',
      resourceType: 'vulnerability',
      resourceId: 'vuln-1',
      payload,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(sentBody()).toEqual({
      id: 'evt-1',
      type: 'vulnerability.detected',
      workspaceId: 'ws-1',
      occurredAt: '2026-10-22T10:00:00.000Z',
      outcome: 'success',
      resourceType: 'vulnerability',
      resourceId: 'vuln-1',
      payload,
      sentAt: expect.any(String),
    });
  });

  it('never forwards integration config such as secrets or toggles', async () => {
    await new WebhookConnector().push({
      url,
      type: 'integration.test',
      apiToken: 'secret',
      CRITICAL: true,
      integrationId: 'integration-1',
    });

    const body = sentBody();
    expect(body).not.toHaveProperty('url');
    expect(body).not.toHaveProperty('apiToken');
    expect(body).not.toHaveProperty('CRITICAL');
    expect(body).not.toHaveProperty('text');
  });

  it('generates an id and occurredAt for events without them', async () => {
    await new WebhookConnector().push({ url, type: 'integration.test' });

    const body = sentBody();
    expect(body.id).toEqual(expect.any(String));
    expect(body.occurredAt).toBe(body.sentAt);
  });

  it('throws on a non-2xx response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('boom'),
    });

    await expect(
      new WebhookConnector().push({ url, type: 'integration.test' }),
    ).rejects.toThrow(`Webhook returned 500 for ${url}: boom`);
  });

  it('requires url and type', async () => {
    await expect(
      new WebhookConnector().push({ url, text: 'hi' }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
