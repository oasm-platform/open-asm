import { Skeleton } from '@/components/ui/skeleton';
import {
  DETECTION_STATUS_LABELS,
  DISMISS_REASON_LABELS,
  labelOf,
} from '@/components/vulnerabilities/lifecycle';
import { t, useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import type {
  DismissReason,
  VulnerabilityTimelineEventDto,
} from '@/services/apis/gen/queries';
import { format } from 'date-fns';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BellOff,
  BellRing,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  GitMerge,
  History,
  Hourglass,
  Radar,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ConversationLink, RunLink } from './links';

interface EventView {
  icon: LucideIcon;
  tone: string;
  title: string;
  detail?: ReactNode;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const statusLabel = (s?: string | null) =>
  s ? labelOf(DETECTION_STATUS_LABELS, s) : '?';

const TONES = {
  primary: 'bg-primary/10 text-primary',
  cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  green: 'bg-green-500/10 text-green-600 dark:text-green-400',
  pink: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  muted: 'bg-muted text-muted-foreground',
};

/** Icon, colour and wording of one timeline event. */
export function describeEvent(e: VulnerabilityTimelineEventDto): EventView {
  const data = (e.data ?? {}) as Record<string, unknown>;
  const quote = (v: unknown) =>
    str(v) ? <q className="italic">{str(v)}</q> : undefined;
  switch (e.type) {
    case 'detected':
      return { icon: Radar, tone: TONES.primary, title: t('vulnerabilities.tl.firstDetected') };
    case 'status_changed': {
      const to = e.toStatus ?? '';
      const title = `${statusLabel(e.fromStatus)} → ${statusLabel(to)}`;
      const reason =
        data.reason === 'not_detected_by_covering_scan'
          ? `${t('vulnerabilities.tl.noLongerReported')}${data.fixClaimVerified ? t('vulnerabilities.tl.fixClaimVerified') : ''}`
          : data.reason === 'detected_by_scan'
            ? t('vulnerabilities.tl.reportedAgain')
            : undefined;
      if (to === 'fixed')
        return { icon: CheckCircle2, tone: TONES.green, title, detail: reason };
      if (to === 'resurfaced')
        return { icon: RotateCcw, tone: TONES.pink, title, detail: reason };
      if (to === 'active')
        return { icon: Activity, tone: TONES.cyan, title, detail: reason };
      return { icon: ArrowRight, tone: TONES.muted, title, detail: reason };
    }
    case 'fix_claimed':
      return {
        icon: Wrench,
        tone: TONES.green,
        title: t('vulnerabilities.tl.markedFixed'),
        detail:
          quote(data.note) ??
          (data.verification === 'not_verifiable_by_scan'
            ? t('vulnerabilities.tl.noScanCovers')
            : t('vulnerabilities.tl.nextScanVerifies')),
      };
    case 'dismissed': {
      const reason = str(data.reason) as DismissReason | undefined;
      const until = str(data.expiresAt);
      return {
        icon: reason === 'risk_accepted' ? ShieldCheck : BellOff,
        tone: TONES.amber,
        title: `${t('vulnerabilities.tl.dismissed', {
          reason: reason
            ? labelOf(DISMISS_REASON_LABELS, reason)
            : t('vulnerabilities.tl.unknownReason'),
        })}${until ? t('vulnerabilities.hero.until', { date: format(new Date(until), 'dd MMM yyyy') }) : ''}`,
        detail: quote(data.comment),
      };
    }
    case 'reopened':
      return { icon: BellRing, tone: TONES.primary, title: t('vulnerabilities.tl.reopened') };
    case 'risk_expired':
      return {
        icon: Hourglass,
        tone: TONES.amber,
        title: t('vulnerabilities.tl.riskExpired'),
        detail: quote(data.comment),
      };
    case 'proposed':
      return {
        icon: Sparkles,
        tone: TONES.amber,
        title: `${t('vulnerabilities.tl.proposedByAi')}${str(data.agentName) ? ` · ${str(data.agentName)}` : ''}`,
        detail: <ConversationLink id={str(data.agentConversationId)} />,
      };
    case 'approved':
      return {
        icon: CheckCheck,
        tone: TONES.green,
        title: `${t('vulnerabilities.tl.approved')}${str(data.severity) ? t('vulnerabilities.tl.approvedAs', { severity: str(data.severity)! }) : ''}${str(data.proposedSeverity) ? t('vulnerabilities.tl.proposedSeverity', { severity: str(data.proposedSeverity)! }) : ''}`,
        detail: quote(data.note),
      };
    case 'rejected':
      return {
        icon: XCircle,
        tone: TONES.red,
        title: t('vulnerabilities.tl.rejected'),
        detail: quote(data.note),
      };
    case 'merged':
      return {
        icon: GitMerge,
        tone: TONES.violet,
        title: `${t('vulnerabilities.tl.mergedProposal')}${str(data.proposalName) ? ` "${str(data.proposalName)}"` : ''}`,
        detail:
          typeof data.movedSources === 'number'
            ? t('vulnerabilities.tl.sourcesMoved', { n: data.movedSources })
            : undefined,
      };
    case 'verified_by_ai':
      return {
        icon: BadgeCheck,
        tone: TONES.violet,
        title: `${t('vulnerabilities.tl.verifiedByAi')}${str(data.agentName) ? ` · ${str(data.agentName)}` : ''}`,
        detail: <ConversationLink id={str(data.agentConversationId)} />,
      };
    case 'issue_linked': {
      const no = data.issueNo ?? data.no;
      return {
        icon: ClipboardList,
        tone: TONES.primary,
        title: `${t('vulnerabilities.tl.linkedToIssue')}${typeof no === 'number' || typeof no === 'string' ? ` #${no}` : ''}`,
      };
    }
    default:
      return { icon: History, tone: TONES.muted, title: String(e.type) };
  }
}

/** What happened to the finding, newest first. */
export function VulnerabilityTimeline({
  events,
  isLoading,
}: {
  events?: VulnerabilityTimelineEventDto[];
  isLoading?: boolean;
}) {
  const tr = useT();
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" data-testid="timeline-loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-7 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (!events?.length) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        <History className="mx-auto mb-2 size-6" />
        {tr('vulnerabilities.tl.noEvents')}
      </div>
    );
  }
  return (
    <ol className="relative flex flex-col gap-4" aria-label={tr('vulnerabilities.tl.aria')}>
      {events.map((e, i) => {
        const view = describeEvent(e);
        const Icon = view.icon;
        return (
          <li
            key={e.id}
            className="relative flex gap-3"
            data-event-type={e.type}
          >
            {i < events.length - 1 && (
              <span
                className="absolute left-3.5 top-8 bottom-[-1rem] w-px bg-border"
                aria-hidden
              />
            )}
            <span
              className={cn(
                'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full',
                view.tone,
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium">{view.title}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(e.occurredAt), 'dd MMM yyyy HH:mm')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>{e.actor?.name ?? tr('vulnerabilities.tl.system')}</span>
                {e.jobHistoryId && (
                  <>
                    <span aria-hidden>·</span>
                    <RunLink id={e.jobHistoryId} />
                  </>
                )}
              </div>
              {view.detail && (
                <div className="mt-1 text-sm text-muted-foreground">
                  {view.detail}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
