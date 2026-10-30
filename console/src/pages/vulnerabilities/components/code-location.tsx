import { Badge } from '@/components/ui/badge';
import { OpenLink } from '@/components/ui/open-link';
import type { Vulnerability } from '@/services/apis/gen/queries';
import { ExternalLink } from 'lucide-react';

/**
 * Link to the exact lines of a code finding, when the asset is a synced
 * repository (its metadata carries the provider and the repository URL).
 */
export function codeFindingUrl(vulnerability: Vulnerability): string | null {
  const meta = (vulnerability.asset?.metadata ?? {}) as Record<string, unknown>;
  const repoUrl = typeof meta.url === 'string' ? meta.url.replace(/\/+$/, '') : '';
  const { filePath, commit, lineStart, lineEnd } = vulnerability;
  if (!repoUrl || !filePath) return null;

  const ref = commit || (typeof meta.defaultBranch === 'string' ? meta.defaultBranch : 'HEAD');
  const path = filePath.split('/').map(encodeURIComponent).join('/');
  const isGitlab = meta.provider === 'gitlab';
  const blob = isGitlab ? `${repoUrl}/-/blob/${ref}/${path}` : `${repoUrl}/blob/${ref}/${path}`;
  if (!lineStart) return blob;
  const end = lineEnd && lineEnd !== lineStart ? lineEnd : null;
  if (!end) return `${blob}#L${lineStart}`;
  return isGitlab ? `${blob}#L${lineStart}-${end}` : `${blob}#L${lineStart}-L${end}`;
}

/** File / line / commit / dependency details of a repository finding. */
export function CodeLocation({
  vulnerability,
  labelClassName,
}: {
  vulnerability: Vulnerability;
  labelClassName: string;
}) {
  const { filePath, lineStart, lineEnd, commit, packageName, installedVersion, fixedVersion } =
    vulnerability;
  const url = codeFindingUrl(vulnerability);
  const lines =
    lineStart && lineEnd && lineEnd !== lineStart
      ? `${lineStart}–${lineEnd}`
      : lineStart
        ? String(lineStart)
        : null;

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
      {filePath && (
        <div className="md:col-span-2">
          <span className={labelClassName}>File</span>
          <div className="flex items-center gap-2">
            <span className="break-all font-mono text-sm">
              {filePath}
              {lines ? `:${lines}` : ''}
            </span>
            {url && (
              <OpenLink
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open in repository"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-4" />
              </OpenLink>
            )}
          </div>
        </div>
      )}
      {commit && (
        <div>
          <span className={labelClassName}>Commit</span>
          <span className="font-mono text-sm">{commit.slice(0, 12)}</span>
        </div>
      )}
      {packageName && (
        <div className="md:col-span-2">
          <span className={labelClassName}>Dependency</span>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono">{packageName}</span>
            {installedVersion && <Badge variant="secondary">{installedVersion}</Badge>}
            {fixedVersion && (
              <span className="text-muted-foreground">
                fixed in <Badge variant="outline">{fixedVersion}</Badge>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
