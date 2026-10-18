import { TargetType } from '@/common/enums/enum';
import { TargetSource } from './entities/target.entity';

/**
 * Logo shown next to a target in lists.
 *
 * - GIT_ORG from GitHub: the owner's avatar, `https://<host>/<owner>.png` —
 *   works for organizations and users, on github.com and GitHub Enterprise.
 *   Other providers (GitLab) have no avatar URL derivable from the path.
 * - DOMAIN / CIDR / IP: the favicon of the asset whose value equals the
 *   target's (looked up by the caller; a CIDR never has one).
 *
 * `null` → the console falls back to its default globe icon.
 */
export function resolveTargetLogo(
  target: { type: TargetType; value: string; source: string },
  faviconUrl: string | null | undefined,
): string | null {
  if (target.type === TargetType.GIT_ORG) {
    // `source` is the raw column value (the list query reads it raw).
    if (target.source !== String(TargetSource.GITHUB)) return null;
    const [host, owner] = target.value.split('/');
    return host && owner
      ? `https://${host}/${encodeURIComponent(owner)}.png`
      : null;
  }
  return faviconUrl || null;
}
