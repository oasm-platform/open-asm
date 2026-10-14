import { describe, expect, it } from 'vitest';

import { getToolStatus } from './chat-helpers';

describe('getToolStatus', () => {
  it('maps stream states', () => {
    expect(getToolStatus(undefined)).toBe('pending');
    expect(getToolStatus('input-available')).toBe('executing');
    expect(getToolStatus('output-error')).toBe('error');
    expect(getToolStatus('output-available', { ok: true })).toBe('completed');
  });

  it('recognises calls the user rejected', () => {
    expect(
      getToolStatus('output-available', {
        error: 'Tool call was not approved by the user and was not executed.',
      }),
    ).toBe('rejected');
  });

  it('recognises calls refused until a plan is approved', () => {
    expect(
      getToolStatus('output-available', {
        error:
          'Not executed: this conversation needs an approved plan first. Call formulate_plan ...',
      }),
    ).toBe('needs-plan');
  });
});
