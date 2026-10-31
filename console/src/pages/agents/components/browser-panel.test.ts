import { describe, expect, it } from 'vitest';
import {
  MAX_BROWSER_VIEWS,
  mergeBrowserScreenshot,
  type LiveBrowserScreenshot,
} from './browser-panel';

const shot = (
  toolCallId: string,
  extra: Partial<LiveBrowserScreenshot> = {},
): LiveBrowserScreenshot => ({
  toolCallId,
  command: `browser ${toolCallId}`,
  image: toolCallId,
  ...extra,
});

describe('mergeBrowserScreenshot', () => {
  it("replaces only its own session's picture, keeping the order", () => {
    const views = [
      shot('a1', { browserSessionId: 'b-a' }),
      shot('b1', { browserSessionId: 'b-b' }),
    ];
    const next = mergeBrowserScreenshot(
      views,
      shot('a2', { browserSessionId: 'b-a' }),
    );
    expect(next.map((v) => v.toolCallId)).toEqual(['a2', 'b1']);
  });

  it('adds a new session after the others', () => {
    const next = mergeBrowserScreenshot(
      [shot('a1', { browserSessionId: 'b-a' })],
      shot('s1', {
        browserSessionId: 'b-s',
        subagent: { id: 's1', name: 'recon' },
      }),
    );
    expect(next.map((v) => v.toolCallId)).toEqual(['a1', 's1']);
  });

  it('keeps one view per agent when the session is unknown', () => {
    const main = mergeBrowserScreenshot([shot('m1')], shot('m2'));
    expect(main.map((v) => v.toolCallId)).toEqual(['m2']);

    const both = mergeBrowserScreenshot(
      main,
      shot('s1', { subagent: { id: 's1', name: 'recon' } }),
    );
    expect(both.map((v) => v.toolCallId)).toEqual(['m2', 's1']);
  });

  it('drops the view updated longest ago past the cap', () => {
    const views = Array.from({ length: MAX_BROWSER_VIEWS }, (_, i) =>
      shot(`v${i}`, { browserSessionId: `b-${i}`, receivedAt: i === 3 ? 0 : 10 + i }),
    );
    const next = mergeBrowserScreenshot(
      views,
      shot('new', { browserSessionId: 'b-new', receivedAt: 100 }),
    );
    expect(next).toHaveLength(MAX_BROWSER_VIEWS);
    expect(next.map((v) => v.toolCallId)).not.toContain('v3');
    expect(next.at(-1)?.toolCallId).toBe('new');
  });
});
