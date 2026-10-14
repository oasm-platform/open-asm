import type { Vulnerability } from '@/services/apis/gen/queries';
import { describe, expect, it } from 'vitest';
import { codeFindingUrl } from './code-location';

const finding = (overrides: Partial<Vulnerability>, provider = 'github'): Vulnerability =>
  ({
    filePath: 'config/prod env.yml',
    commit: 'abc123',
    lineStart: 12,
    lineEnd: 12,
    asset: {
      value: 'github.com/acme/web',
      metadata: { provider, url: 'https://github.com/acme/web/', defaultBranch: 'main' },
    },
    ...overrides,
  }) as unknown as Vulnerability;

describe('codeFindingUrl', () => {
  it('links a GitHub finding to its line at the commit', () => {
    expect(codeFindingUrl(finding({}))).toBe(
      'https://github.com/acme/web/blob/abc123/config/prod%20env.yml#L12',
    );
  });

  it('uses GitLab blob paths and line ranges', () => {
    expect(codeFindingUrl(finding({ lineEnd: 15 }, 'gitlab'))).toBe(
      'https://github.com/acme/web/-/blob/abc123/config/prod%20env.yml#L12-15',
    );
  });

  it('falls back to the default branch without a commit', () => {
    expect(codeFindingUrl(finding({ commit: null, lineStart: null }))).toBe(
      'https://github.com/acme/web/blob/main/config/prod%20env.yml',
    );
  });

  it('returns null for host findings', () => {
    expect(
      codeFindingUrl({ asset: { value: 'example.com' } } as unknown as Vulnerability),
    ).toBeNull();
  });
});
