import type { RepositoryAssetMetadata } from '@/modules/assets/entities/assets.entity';
import type { GitOrgTargetSettings } from '@/modules/targets/entities/target.entity';
import type { SourceRepository } from './connectors/connector.abstract';

/** The slice of an Asset row the plan reads. */
export interface ExistingRepositoryAsset {
  id: string;
  value: string;
  isEnabled: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface PlannedRepositoryAsset {
  value: string;
  isEnabled: boolean;
  metadata: RepositoryAssetMetadata;
}

export interface RepositorySyncPlan {
  inserts: PlannedRepositoryAsset[];
  /** Existing rows to overwrite (rename, metadata, enabled flag). */
  updates: Array<PlannedRepositoryAsset & { id: string }>;
  /** Existing rows whose repository is gone: disabled, never deleted. */
  disableIds: string[];
  /**
   * Unmatched rows whose value a live repository now claims (a repository
   * renamed onto a deleted one's name). Applied FIRST so the (value, target)
   * unique constraint holds; the old row keeps its history under a
   * disambiguated value.
   */
  renames: Array<{ id: string; value: string }>;
}

/**
 * Asset value of a repository: its browser URL without the scheme, lower-cased
 * — `github.com/acme/web`, `gitlab.example.com/group/sub/project`.
 */
export function repositoryAssetValue(repo: Pick<SourceRepository, 'url'>): string {
  const url = new URL(repo.url);
  return `${url.host}${url.pathname}`.replace(/\/+$/, '').toLowerCase();
}

/**
 * Web host a SOURCE_CODE integration serves: github.com / gitlab.com, or the
 * host of its `baseUrl` (GitHub Enterprise API URL, self-managed GitLab). A
 * GIT_ORG target value must start with it.
 */
export function sourceCodeHost(
  appType: string,
  config: Record<string, unknown>,
): string {
  const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl : '';
  if (baseUrl) {
    try {
      return new URL(baseUrl).host.toLowerCase();
    } catch {
      // fall through to the public default
    }
  }
  return appType === 'gitlab' ? 'gitlab.com' : 'github.com';
}

/**
 * Owner a GIT_ORG target syncs: everything after the host —
 * `github.com/acme` → `acme`, `gitlab.com/acme/platform` → `acme/platform`.
 */
export function gitOrgOwner(targetValue: string): string {
  const slash = targetValue.indexOf('/');
  return slash === -1 ? '' : targetValue.slice(slash + 1);
}

/**
 * Whether a repository is scanned under the target's settings. Archived
 * repositories and forks are recorded but disabled unless opted in.
 */
export function isRepositoryEnabled(
  repo: Pick<SourceRepository, 'archived' | 'fork'>,
  settings: GitOrgTargetSettings | null | undefined,
): boolean {
  if (repo.archived && !settings?.includeArchived) return false;
  if (repo.fork && !settings?.includeForks) return false;
  return true;
}

/**
 * Reconciles the repositories the provider reports with the target's
 * existing assets.
 *
 * - Matched by provider id (`metadata.remoteId`) first, so a renamed
 *   repository keeps its asset — and its findings — under the new value.
 * - Falls back to the value, adopting a row that has no (or a stale) id.
 * - A repository no longer reported is disabled, never deleted: its history
 *   stays. When the listing was cut short (`complete` false) nothing is
 *   disabled, because "not seen" no longer means "gone".
 */
export function planRepositorySync(args: {
  existing: ExistingRepositoryAsset[];
  repositories: SourceRepository[];
  provider: string;
  settings: GitOrgTargetSettings | null | undefined;
  complete: boolean;
}): RepositorySyncPlan {
  const byRemoteId = new Map<string, ExistingRepositoryAsset>();
  const byValue = new Map<string, ExistingRepositoryAsset>();
  for (const asset of args.existing) {
    const remoteId = asset.metadata?.remoteId;
    if (typeof remoteId === 'string') byRemoteId.set(remoteId, asset);
    byValue.set(asset.value, asset);
  }

  const plan: RepositorySyncPlan = {
    inserts: [],
    updates: [],
    disableIds: [],
    renames: [],
  };
  const matched = new Set<string>();
  const plannedValues = new Set<string>();

  for (const repo of args.repositories) {
    const value = repositoryAssetValue(repo);
    // Two provider entries can never map to one row (unique value+target).
    if (plannedValues.has(value)) continue;
    plannedValues.add(value);

    const planned: PlannedRepositoryAsset = {
      value,
      isEnabled: isRepositoryEnabled(repo, args.settings),
      metadata: {
        provider: args.provider,
        remoteId: repo.id,
        fullName: repo.fullName,
        url: repo.url,
        defaultBranch: repo.defaultBranch,
        private: repo.private,
        archived: repo.archived,
        fork: repo.fork,
        pushedAt: repo.pushedAt,
      },
    };

    const row = byRemoteId.get(repo.id) ?? byValue.get(value);
    if (row && !matched.has(row.id)) {
      matched.add(row.id);
      plan.updates.push({ ...planned, id: row.id });
    } else {
      plan.inserts.push(planned);
    }
  }

  for (const asset of args.existing) {
    if (matched.has(asset.id)) continue;
    if (plannedValues.has(asset.value)) {
      // A live repository takes this value; move the stale row aside. It is
      // gone from the provider by definition, so it is disabled as well.
      const remoteId = asset.metadata?.remoteId;
      plan.renames.push({
        id: asset.id,
        value: `${asset.value}#${typeof remoteId === 'string' ? remoteId : asset.id}`,
      });
      if (asset.isEnabled) plan.disableIds.push(asset.id);
    } else if (args.complete && asset.isEnabled) {
      plan.disableIds.push(asset.id);
    }
  }

  return plan;
}
