import { DiscordConnector } from './discord.connector';

describe('DiscordConnector', () => {
  const webhookUrl = 'https://discord.com/api/webhooks/1/token';
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
  });

  const sentBody = () =>
    JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;

  it('posts content (not text) with mentions disabled', async () => {
    await new DiscordConnector().push({ webhookUrl, username: 'OASM', text: 'hi @everyone' });

    expect(fetchMock).toHaveBeenCalledWith(webhookUrl, expect.objectContaining({ method: 'POST' }));
    expect(sentBody()).toEqual({
      content: 'hi @everyone',
      username: 'OASM',
      allowed_mentions: { parse: [] },
    });
  });

  it('truncates content to the 2000 character limit', async () => {
    await new DiscordConnector().push({ webhookUrl, text: 'x'.repeat(2500) });

    expect((sentBody().content as string).length).toBe(2000);
  });

  it('throws on a non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: () => Promise.resolve('bad') });

    await expect(new DiscordConnector().push({ webhookUrl, text: 'hi' })).rejects.toThrow(
      'Discord webhook returned 400: bad',
    );
  });

  it('requires webhookUrl and text', async () => {
    await expect(new DiscordConnector().push({ webhookUrl })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
