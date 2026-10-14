import type { SourceRepository } from './connectors/connector.abstract';
import {
  gitOrgOwner,
  isRepositoryEnabled,
  planRepositorySync,
  repositoryAssetValue,
  sourceCodeHost,
} from './repository-sync.plan';

const repo = (overrides: Partial<SourceRepository> = {}): SourceRepository => ({
  id: '1',
  name: 'web',
  fullName: 'acme/web',
  url: 'https://github.com/acme/web',
  defaultBranch: 'main',
  private: true,
  archived: false,
  fork: false,
  updatedAt: null,
  pushedAt: null,
  ...overrides,
});

describe('repository sync plan', () => {
  describe('helpers', () => {
    it('derives the asset value from the repository URL', () => {
      expect(repositoryAssetValue({ url: 'https://GitHub.com/Acme/Web/' })).toBe(
        'github.com/acme/web',
      );
      expect(
        repositoryAssetValue({ url: 'https://git.acme.com:8443/a/b/c' }),
      ).toBe('git.acme.com:8443/a/b/c');
    });

    it('extracts the owner path of a target', () => {
      expect(gitOrgOwner('github.com/acme')).toBe('acme');
      expect(gitOrgOwner('gitlab.com/acme/platform')).toBe('acme/platform');
    });

    it('resolves the web host of an integration', () => {
      expect(sourceCodeHost('github', {})).toBe('github.com');
      expect(sourceCodeHost('gitlab', {})).toBe('gitlab.com');
      expect(
        sourceCodeHost('github', { baseUrl: 'https://GHE.acme.com/api/v3' }),
      ).toBe('ghe.acme.com');
    });

    it('disables archived repositories and forks unless opted in', () => {
      expect(isRepositoryEnabled({ archived: true, fork: false }, null)).toBe(false);
      expect(isRepositoryEnabled({ archived: false, fork: true }, {})).toBe(false);
      expect(
        isRepositoryEnabled(
          { archived: true, fork: true },
          { includeArchived: true, includeForks: true },
        ),
      ).toBe(true);
    });
  });

  it('inserts new repositories with their metadata', () => {
    const plan = planRepositorySync({
      existing: [],
      repositories: [repo()],
      provider: 'github',
      settings: null,
      complete: true,
    });

    expect(plan.inserts).toEqual([
      {
        value: 'github.com/acme/web',
        isEnabled: true,
        metadata: expect.objectContaining({ provider: 'github', remoteId: '1' }),
      },
    ]);
    expect(plan.updates).toEqual([]);
  });

  it('keeps the asset of a renamed repository (matched by remote id)', () => {
    const plan = planRepositorySync({
      existing: [
        {
          id: 'asset-1',
          value: 'github.com/acme/old-name',
          isEnabled: true,
          metadata: { remoteId: '1' },
        },
      ],
      repositories: [repo({ url: 'https://github.com/acme/new-name' })],
      provider: 'github',
      settings: null,
      complete: true,
    });

    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([
      expect.objectContaining({ id: 'asset-1', value: 'github.com/acme/new-name' }),
    ]);
    expect(plan.disableIds).toEqual([]);
  });

  it('adopts an existing row with the same value but no remote id', () => {
    const plan = planRepositorySync({
      existing: [{ id: 'asset-1', value: 'github.com/acme/web', isEnabled: false }],
      repositories: [repo()],
      provider: 'github',
      settings: null,
      complete: true,
    });

    expect(plan.updates).toEqual([
      expect.objectContaining({ id: 'asset-1', isEnabled: true }),
    ]);
  });

  it('disables repositories that are gone, but only on a complete listing', () => {
    const existing = [
      { id: 'gone', value: 'github.com/acme/gone', isEnabled: true, metadata: { remoteId: '9' } },
    ];
    const args = { existing, repositories: [repo()], provider: 'github', settings: null };

    expect(planRepositorySync({ ...args, complete: true }).disableIds).toEqual(['gone']);
    expect(planRepositorySync({ ...args, complete: false }).disableIds).toEqual([]);
  });

  it('moves a stale row aside when a live repository takes its value', () => {
    const plan = planRepositorySync({
      existing: [
        // Deleted repository that used to be called "web".
        { id: 'stale', value: 'github.com/acme/web', isEnabled: true, metadata: { remoteId: '9' } },
        // Live repository being renamed to "web".
        { id: 'live', value: 'github.com/acme/app', isEnabled: true, metadata: { remoteId: '1' } },
      ],
      repositories: [repo({ id: '1', url: 'https://github.com/acme/web' })],
      provider: 'github',
      settings: null,
      complete: false,
    });

    expect(plan.renames).toEqual([{ id: 'stale', value: 'github.com/acme/web#9' }]);
    expect(plan.disableIds).toEqual(['stale']);
    expect(plan.updates).toEqual([
      expect.objectContaining({ id: 'live', value: 'github.com/acme/web' }),
    ]);
  });
});
