import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import SeverityBadge from '@/components/ui/severity-badge';
import {
  DetectionStatusBadge,
  IssueRefLink,
  ReviewStatusBadge,
  SlaDue,
} from '@/components/vulnerabilities/lifecycle-badges';
import {
  DISMISS_REASON_LABELS,
  ageLabel,
  isRiskAccepted,
  labelOf,
  sourceSummaryLabel,
} from '@/components/vulnerabilities/lifecycle';
import { useT, t } from '@/lib/i18n-dictionary';
import type { VulnerabilityListItemDto } from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { isProposal } from './vulnerability-status';

const cellBox = 'min-h-[52px] flex items-center';
const dash = <span className="text-muted-foreground">—</span>;

/** "billing.acme.vn:443 · nuclei" under the name. */
export function vulnerabilitySubline(v: VulnerabilityListItemDto): string {
  const where = v.asset?.value || v.affectedUrl || v.host;
  const how = sourceSummaryLabel({
    sources: v.sources,
    discoveredBy: v.discoveredBy,
    reviewStatus: v.reviewStatus,
    fallbackToolName: v.tool?.name,
  });
  return [where, how].filter((p) => p && p !== '—').join(' · ');
}

/** Triage cell: dismissal reason, risk acceptance end, or a fix claim. */
function Triage({ v }: { v: VulnerabilityListItemDto }) {
  const t = useT();
  const d = v.dismissal;
  if (d) {
    if (d.reason === 'risk_accepted') {
      return (
        <Badge
          variant="outline"
          className="h-6 rounded-full border-amber-500/30 text-amber-700 dark:text-amber-300"
          title={d.comment ?? undefined}
        >
          {t('vulnerabilities.triage.riskAccepted')}
          {d.expiresAt
            ? t('vulnerabilities.triage.until', {
                date: format(new Date(d.expiresAt), 'dd MMM yyyy'),
              })
            : ''}
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className="h-6 rounded-full"
        title={d.comment ?? undefined}
      >
        {labelOf(DISMISS_REASON_LABELS, d.reason)}
      </Badge>
    );
  }
  if (v.fixClaimedAt && v.detectionStatus !== 'fixed') {
    return (
      <Badge
        variant="outline"
        className="h-6 rounded-full border-green-500/30 text-green-700 dark:text-green-300"
        title={t('vulnerabilities.triage.fixClaimedTitle', {
          date: format(new Date(v.fixClaimedAt), 'dd MMM yyyy'),
        })}
      >
        {t('vulnerabilities.triage.fixClaimed')}
      </Badge>
    );
  }
  return dash;
}

/** Built at render so headers follow the active language. */
export const vulnerabilityColumns = (): ColumnDef<
  VulnerabilityListItemDto,
  unknown
>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={t('vulnerabilities.col.selectAll')}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    ),
    cell: ({ row }) => (
      <div
        className={`${cellBox} justify-center`}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={t('vulnerabilities.col.selectRow')}
        />
      </div>
    ),
    size: 40,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'severity',
    header: t('vulnerabilities.col.severity'),
    size: 100,
    cell: ({ row }) => (
      <div className={cellBox}>
        <SeverityBadge
          severity={String(row.original.severity ?? 'info').toLowerCase()}
        />
      </div>
    ),
  },
  {
    accessorKey: 'name',
    header: t('vulnerabilities.col.name'),
    size: 420,
    enableHiding: false,
    cell: ({ row }) => {
      const v = row.original;
      return (
        <div className="flex flex-col justify-center gap-0.5 py-2 min-h-[52px] w-[420px] max-w-[420px]">
          <div className="font-medium truncate" title={v.name}>
            {v.name}
          </div>
          <div
            className="text-xs text-muted-foreground truncate"
            title={vulnerabilitySubline(v)}
          >
            {vulnerabilitySubline(v)}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'detectionStatus',
    header: t('vulnerabilities.col.status'),
    size: 120,
    cell: ({ row }) => {
      const v = row.original;
      return (
        <div className={cellBox}>
          {isProposal(v) ? (
            <ReviewStatusBadge status={v.reviewStatus} />
          ) : (
            <DetectionStatusBadge status={v.detectionStatus} />
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'timesDetected',
    header: t('vulnerabilities.col.detected'),
    size: 90,
    cell: ({ row }) => {
      const v = row.original;
      return (
        <div className={cellBox}>
          {isProposal(v) || !v.timesDetected ? (
            dash
          ) : (
            <span
              className="tabular-nums"
              title={t('vulnerabilities.col.reportedBy', { n: v.timesDetected })}
            >
              ×{v.timesDetected}
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'firstDetectedDate',
    header: t('vulnerabilities.col.age'),
    size: 110,
    cell: ({ row }) => {
      const v = row.original;
      if (v.detectionStatus === 'fixed' && v.fixedAt && !isProposal(v)) {
        return (
          <div className={`${cellBox} text-sm text-muted-foreground`}>
            {t('vulnerabilities.col.fixedAgo', {
              time: formatDistanceToNowStrict(new Date(v.fixedAt)),
            })}
          </div>
        );
      }
      return (
        <div
          className={`${cellBox} text-sm`}
          title={
            v.firstDetectedDate
              ? new Date(v.firstDetectedDate).toLocaleString()
              : undefined
          }
        >
          {ageLabel(v.firstDetectedDate)}
        </div>
      );
    },
  },
  {
    accessorKey: 'dueAt',
    header: t('vulnerabilities.col.slaDue'),
    size: 130,
    cell: ({ row }) => {
      const v = row.original;
      return (
        <div className={cellBox}>
          <SlaDue
            dueAt={v.dueAt}
            status={isProposal(v) ? v.reviewStatus : v.detectionStatus}
            paused={isRiskAccepted(v.dismissal)}
          />
        </div>
      );
    },
  },
  {
    id: 'triage',
    header: t('vulnerabilities.col.triage'),
    size: 170,
    enableSorting: false,
    cell: ({ row }) => (
      <div className={cellBox}>
        <Triage v={row.original} />
      </div>
    ),
  },
  {
    id: 'issue',
    header: t('vulnerabilities.col.issue'),
    size: 80,
    enableSorting: false,
    cell: ({ row }) => {
      const issue = row.original.openIssue;
      return (
        <div className={cellBox} onClick={(e) => e.stopPropagation()}>
          {issue ? <IssueRefLink issue={issue} /> : dash}
        </div>
      );
    },
  },
];
