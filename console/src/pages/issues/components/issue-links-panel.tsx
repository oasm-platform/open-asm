import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DetectionStatusBadge,
  SeverityBadge,
  SlaDue,
} from '@/components/vulnerabilities/lifecycle-badges';
import { useT } from '@/lib/i18n-dictionary';
import type { IssueDetailDto, IssueLinkDto } from '@/services/apis/gen/queries';
import { Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import { Plus, ShieldAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { DetailSection, SideCard } from './detail-blocks';
import {
  LINK_RESOURCE_LABELS,
  LINK_RESOURCE_SINGULAR,
  type LinkResourceType,
} from '../issue-utils';

const ORDER: LinkResourceType[] = [
  'vulnerability',
  'asset',
  'target',
  'project',
  'job_history',
];

function LinkTitle({ link }: { link: IssueLinkDto }) {
  const t = useT();
  const { resource } = link;
  if (resource.missing) {
    return (
      <span
        className="text-muted-foreground line-through"
        title={link.resourceId}
      >
        {t('issues.links.deleted', {
          type:
            LINK_RESOURCE_SINGULAR[link.resourceType] ??
            link.resourceType.replace('_', ' '),
        })}
      </span>
    );
  }
  switch (link.resourceType) {
    case 'vulnerability':
      return (
        <Link
          to="/vulnerabilities/$id"
          params={{ id: link.resourceId }}
          className="font-medium hover:underline"
        >
          {resource.name ?? link.resourceId}
        </Link>
      );
    case 'target':
      return (
        <Link
          to="/targets/$id"
          params={{ id: link.resourceId }}
          className="font-medium hover:underline"
        >
          {resource.value ?? link.resourceId}
        </Link>
      );
    case 'project':
      return (
        <Link
          to="/projects/$id"
          params={{ id: link.resourceId }}
          className="font-medium hover:underline"
        >
          {resource.name ?? link.resourceId}
        </Link>
      );
    case 'job_history':
      return (
        <Link
          to="/jobs/runs/$id"
          params={{ id: link.resourceId }}
          className="font-medium hover:underline"
        >
          {t('issues.links.run', { id: link.resourceId.slice(0, 8) })}
        </Link>
      );
    default:
      return (
        <span className="font-medium">{resource.value ?? link.resourceId}</span>
      );
  }
}

function LinkMeta({ link }: { link: IssueLinkDto }): ReactNode {
  const { resource } = link;
  if (resource.missing) return null;
  if (link.resourceType === 'vulnerability') {
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {resource.severity && <SeverityBadge severity={resource.severity} />}
        <DetectionStatusBadge status={resource.detectionStatus} />
        {resource.assetValue && <span>{resource.assetValue}</span>}
      </span>
    );
  }
  if (link.resourceType === 'job_history') {
    return (
      <span className="text-xs text-muted-foreground">
        {resource.status ?? ''}
        {resource.createdAt
          ? ` · ${format(new Date(resource.createdAt), 'dd MMM yyyy HH:mm')}`
          : ''}
      </span>
    );
  }
  return null;
}

/** Every link of the issue, grouped by resource type. */
export function IssueLinksPanel({
  issue,
  onAdd,
  onRemove,
  removingId,
}: {
  issue: IssueDetailDto;
  onAdd: () => void;
  onRemove: (link: IssueLinkDto) => void;
  removingId?: string | null;
}) {
  const t = useT();
  const groups = ORDER.map((type) => ({
    type,
    links: issue.links.filter((link) => link.resourceType === type),
  })).filter((group) => group.links.length > 0);

  return (
    <SideCard
      title={t('issues.links.title', { n: issue.links.length })}
      testId="issue-links"
      action={
        <Button variant="ghost" size="sm" className="h-7" onClick={onAdd}>
          <Plus className="size-4" />
          {t('issues.links.link')}
        </Button>
      }
    >
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('issues.links.empty')}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.type} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {LINK_RESOURCE_LABELS[group.type]} · {group.links.length}
            </span>
            <ul className="flex flex-col gap-1.5">
              {group.links.map((link) => (
                <li
                  key={link.id}
                  className="group flex items-center gap-2 text-sm"
                  data-testid="issue-link"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate">
                      <LinkTitle link={link} />
                    </span>
                    <LinkMeta link={link} />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    aria-label={t('issues.links.remove')}
                    disabled={removingId === link.id}
                    onClick={() => onRemove(link)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </SideCard>
  );
}

/**
 * Vulnerability remediation part: the linked findings and how many are fixed.
 */
export function RemediationSection({
  issue,
  onRemove,
  onAdd,
  removingId,
}: {
  issue: IssueDetailDto;
  onRemove: (link: IssueLinkDto) => void;
  onAdd: () => void;
  removingId?: string | null;
}) {
  const t = useT();
  const links = issue.links.filter((l) => l.resourceType === 'vulnerability');
  const done =
    issue.progress?.done ??
    links.filter((l) => l.resource.detectionStatus === 'fixed').length;
  const total = issue.progress?.total ?? links.length;

  return (
    <DetailSection
      title={t('issues.links.remediationTitle', { done, total })}
      icon={<ShieldAlert />}
      testId="remediation-section"
      action={
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="size-4" />
          {t('issues.links.addVulnerability')}
        </Button>
      }
    >
      {links.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t('issues.links.noVulnerabilities')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">
                  {t('issues.links.colVulnerability')}
                </th>
                <th className="py-2 pr-3 font-medium">
                  {t('issues.links.colAsset')}
                </th>
                <th className="py-2 pr-3 font-medium">
                  {t('issues.links.colStatus')}
                </th>
                <th className="py-2 pr-3 font-medium">
                  {t('issues.links.colDue')}
                </th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {links.map((link) => {
                const r = link.resource;
                return (
                  <tr key={link.id} className="border-b last:border-b-0">
                    <td className="py-2.5 pr-3 align-middle">
                      <div className="flex items-center gap-2">
                        {r.severity && <SeverityBadge severity={r.severity} />}
                        <LinkTitle link={link} />
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 align-middle text-muted-foreground">
                      {r.missing ? '—' : (r.assetValue ?? '—')}
                    </td>
                    <td className="py-2.5 pr-3 align-middle">
                      <span className="flex flex-wrap items-center gap-1">
                        <DetectionStatusBadge status={r.detectionStatus} />
                        {r.dismissed && (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            {t('issues.links.dismissed')}
                          </Badge>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 align-middle text-xs">
                      <SlaDue
                        dueAt={r.dueAt}
                        status={r.detectionStatus}
                        paused={r.dismissed}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={t('issues.links.unlink', {
                          name: r.name ?? link.resourceId,
                        })}
                        disabled={removingId === link.id}
                        onClick={() => onRemove(link)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DetailSection>
  );
}
