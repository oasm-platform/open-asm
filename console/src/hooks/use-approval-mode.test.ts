import { afterEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'agent-approval-mode';

/** The module reads the stored choice once, when it loads. */
const load = async (stored: string | null) => {
  vi.resetModules();
  if (stored === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, stored);
  return import('./use-approval-mode');
};

describe('approval mode', () => {
  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  it('offers only Auto and Manual', async () => {
    const { isApprovalMode } = await load(null);
    expect(isApprovalMode('auto')).toBe(true);
    expect(isApprovalMode('manual')).toBe(true);
    expect(isApprovalMode('plan')).toBe(false);
  });

  it('reads a stored choice of the retired plan mode as Manual', async () => {
    const mode = await load('plan');
    expect(mode.getApprovalMode()).toBe('manual');

    mode.setApprovalMode('auto');
    localStorage.setItem(STORAGE_KEY, 'plan');
    mode.restoreApprovalMode();
    expect(mode.getApprovalMode()).toBe('manual');
  });

  it('keeps a stored Auto choice', async () => {
    const mode = await load('auto');
    expect(mode.getApprovalMode()).toBe('auto');
  });
});
