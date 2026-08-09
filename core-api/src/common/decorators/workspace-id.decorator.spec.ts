import {
  getWorkspaceIdFromRequest,
} from '@/common/decorators/workspace-id.decorator';
import type { Request } from 'express';

describe('getWorkspaceIdFromRequest', () => {
  it('reads the X-Workspace-Id header (lowercased by Node http)', () => {
    // Node/Express normalizes incoming header names to lowercase, so a real
    // request exposes `x-workspace-id`, never `X-Workspace-Id`.
    const req = {
      headers: { 'x-workspace-id': '11111111-1111-4111-8111-111111111111' },
    } as unknown as Request;
    expect(getWorkspaceIdFromRequest(req)).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('prefers the header over the wid cookie', () => {
    const req = {
      headers: { 'x-workspace-id': '11111111-1111-4111-8111-111111111111' },
      cookies: { wid: '22222222-2222-4222-8222-222222222222' },
    } as unknown as Request;
    expect(getWorkspaceIdFromRequest(req)).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('falls back to the wid cookie when no header is present', () => {
    const req = {
      headers: {},
      cookies: { wid: '22222222-2222-4222-8222-222222222222' },
    } as unknown as Request;
    expect(getWorkspaceIdFromRequest(req)).toBe(
      '22222222-2222-4222-8222-222222222222',
    );
  });

  it('handles an array header value by taking the first entry', () => {
    const req = {
      headers: {
        'x-workspace-id': [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ],
      },
    } as unknown as Request;
    expect(getWorkspaceIdFromRequest(req)).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('returns undefined when neither header nor cookie is present', () => {
    const req = { headers: {} } as unknown as Request;
    expect(getWorkspaceIdFromRequest(req)).toBeUndefined();
  });
});
