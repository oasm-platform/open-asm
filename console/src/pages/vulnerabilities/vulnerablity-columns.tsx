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
  sourceSummaryLabel,
} from '@/components/vulnerabilities/lifecycle';
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
  const d = v.dismissal;
  if (d) {
    if (d.reason === 'risk_accepted') {
      return (
        <Badge
          variant="outline"
          className="h-6 rounded-full border-amber-500/30 text-amber-700 dark:text-amber-300"
          title={d.comment ?? undefined}
        >
          Risk accepted
          {d.expiresAt
            ? ` · until ${format(new Date(d.expiresAt), 'dd MMM yyyy')}`
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
        {DISMISS_REASON_LABELS[d.reason] ?? d.reason}
      </Badge>
    );
  }
  if (v.fixClaimedAt && v.detectionStatus !== 'fixed') {
    return (
      <Badge
        variant="outline"
        className="h-6 rounded-full border-green-500/30 text-green-700 dark:text-green-300"
        title={`Claimed ${format(new Date(v.fixClaimedAt), 'dd MMM yyyy')}; the next covering scan verifies it`}
      >
        Fix claimed
      </Badge>
    );
  }
  return dash;
}

export const vulnerabilityColumns: ColumnDef<
  VulnerabilityListItemDto,
  unknown
>[] = [
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
          aria-label="Select all"
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
          aria-label="Select row"
        />
      </div>
    ),
    size: 40,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'severity',
    header: 'Severity',
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
    header: 'Name',
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
    header: 'Status',
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
    header: 'Detected',
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
              title={`Reported by ${v.timesDetected} scan run(s)`}
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
    header: 'Age',
    size: 110,
    cell: ({ row }) => {
      const v = row.original;
      if (v.detectionStatus === 'fixed' && v.fixedAt && !isProposal(v)) {
        return (
          <div className={`${cellBox} text-sm text-muted-foreground`}>
            fixed {formatDistanceToNowStrict(new Date(v.fixedAt))} ago
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
    header: 'SLA due',
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
    header: 'Triage',
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
    header: 'Issue',
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
