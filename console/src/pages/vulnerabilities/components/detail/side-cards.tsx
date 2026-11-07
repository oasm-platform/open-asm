import { Badge } from '@/components/ui/badge';
import { DetectionStatusBadge } from '@/components/vulnerabilities/lifecycle-badges';
import { DISMISS_REASON_LABELS } from '@/components/vulnerabilities/lifecycle';
import type {
  VulnerabilityDetailDto,
  VulnerabilitySourceDetailDto,
  VulnerabilityTimelineEventDto,
} from '@/services/apis/gen/queries';
import { cn } from '@/lib/utils';
import { parseCVSS } from '@/utils/cvssVectorParser';
import { Link, useNavigate } from '@tanstack/react-router';
import { format } from 'date-fns';
import { ToolLogo } from '@/components/ui/tool-logo';
import { Bot, Tag, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { cweHref, IdGroup } from './overview-content';
import { ConversationLink, RunLink } from './links';

const fmt = (d?: string | null) =>
  d ? format(new Date(d), 'dd MMM yyyy') : '—';

function SideCard({
  title,
  action,
  children,
  testId,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="rounded-xl border bg-card" data-testid={testId}>
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {action}
      </header>
      <div className="flex flex-col gap-2.5 px-4 py-3 text-sm">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-muted-foreground first-letter:uppercase">
        {label}
      </span>
      <span className="flex min-w-0 flex-wrap items-center justify-end gap-1 text-right">
        {children}
      </span>
    </div>
  );
}

/** The run that first reported the finding: its first detection event, else its oldest source. */
export function firstRunId(
  data: Pick<VulnerabilityDetailDto, 'sources'>,
  events?: VulnerabilityTimelineEventDto[],
): string | null {
  const detected = [...(events ?? [])]
    .filter((e) => e.type === 'detected' && e.jobHistoryId)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))[0];
  if (detected?.jobHistoryId) return detected.jobHistoryId;
  const source = [...(data.sources ?? [])]
    .filter((s) => s.jobHistoryId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  return source?.jobHistoryId ?? null;
}

function Triage({ data }: { data: VulnerabilityDetailDto }) {
  const d = data.dismissal;
  if (d) {
    return (
      <span className="flex flex-col items-end">
        <span>
          {DISMISS_REASON_LABELS[d.reason] ?? d.reason}
          {d.reason === 'risk_accepted' && d.expiresAt
            ? ` until ${fmt(d.expiresAt)}`
            : ''}
        </span>
        {d.user && (
          <span className="text-xs text-muted-foreground">
            by {d.user.name}
          </span>
        )}
      </span>
    );
  }
  if (data.fixClaimedAt && data.detectionStatus !== 'fixed') {
    return (
      <span className="flex flex-col items-end">
        <span>Fix claimed {fmt(data.fixClaimedAt)}</span>
        <span className="text-xs text-muted-foreground">
          {data.fixClaimedByUser ? `by ${data.fixClaimedByUser.name} · ` : ''}
          awaiting scan
        </span>
      </span>
    );
  }
  return <span className="text-muted-foreground">Untriaged</span>;
}

/** Detection state, counts, first/last sighting, last fix and triage. */
export function LifecycleCard({
  data,
  events,
}: {
  data: VulnerabilityDetailDto;
  events?: VulnerabilityTimelineEventDto[];
}) {
  return (
    <SideCard title="Lifecycle" testId="lifecycle-card">
      <Row label="Status">
        <DetectionStatusBadge status={data.detectionStatus} />
      </Row>
      <Row label="Detected">
        {data.timesDetected} time{data.timesDetected === 1 ? '' : 's'}
        {data.resurfacedCount > 0 && ` · resurfaced ${data.resurfacedCount}`}
      </Row>
      <Row label="First seen">
        {fmt(data.firstDetectedDate)}
        <RunLink id={firstRunId(data, events)} className="text-xs" />
      </Row>
      <Row label="Last seen">
        {fmt(data.lastSeenDate)}
        <RunLink id={data.lastSeenJobHistoryId} className="text-xs" />
      </Row>
      {data.fixedAt && (
        <Row label="Last fixed">
          {fmt(data.fixedAt)}
          <RunLink id={data.fixedByJobHistoryId} className="text-xs" />
        </Row>
      )}
      <Row label="Triage">
        <Triage data={data} />
      </Row>
    </SideCard>
  );
}

/** Opens the tool's detail page; plain content when the tool id is unknown. */
function ToolLink({
  toolId,
  className,
  children,
}: {
  toolId?: string | null;
  className?: string;
  children: ReactNode;
}) {
  if (!toolId) return <span className={className}>{children}</span>;
  return (
    <Link
      to="/tools/$id"
      params={{ id: toolId }}
      className={cn('hover:underline underline-offset-4', className)}
      data-testid="tool-link"
    >
      {children}
    </Link>
  );
}

function SourceRow({
  source,
  aiVerified,
  fallbackLogoUrl,
}: {
  source: VulnerabilitySourceDetailDto;
  aiVerified: boolean;
  /** Logo of the finding's own tool, for a source row that carries none. */
  fallbackLogoUrl?: string | null;
}) {
  if (source.kind === 'ai_agent') {
    return (
      <li className="flex items-center gap-3" data-source-kind="ai_agent">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-300">
          <Bot className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">
              AI · {source.agentName ?? 'agent'}
            </span>
            {aiVerified && (
              <Badge
                variant="outline"
                className="h-5 rounded-full border-violet-500/30 text-violet-700 dark:text-violet-300"
              >
                AI verified
              </Badge>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {fmt(source.createdAt)}
            {source.createdBy && <span>· run by {source.createdBy.name}</span>}
            <ConversationLink id={source.agentConversationId} />
          </span>
        </span>
      </li>
    );
  }
  if (source.kind === 'user') {
    return (
      <li className="flex items-center gap-1.5" data-source-kind="user">
        <User className="size-3.5" />
        Added by {source.createdBy?.name ?? 'a member'} ·{' '}
        {fmt(source.createdAt)}
      </li>
    );
  }
  return (
    <li className="flex items-center gap-3" data-source-kind="tool">
      <ToolLink toolId={source.tool?.id} className="shrink-0">
        <ToolLogo
          name={source.tool?.name ?? 'Scanner'}
          logoUrl={source.tool?.logoUrl ?? fallbackLogoUrl}
          size={32}
          className="shrink-0 rounded-md"
          alt=""
        />
      </ToolLink>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <ToolLink
            toolId={source.tool?.id}
            className="font-medium capitalize"
          >
            {source.tool?.name ?? 'Scanner'}
          </ToolLink>
          {source.agentConversationId && (
            <span className="text-xs text-muted-foreground">run by AI</span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {fmt(source.createdAt)}
          <RunLink id={source.jobHistoryId} />
          {source.agentConversationId && (
            <ConversationLink id={source.agentConversationId} />
          )}
        </span>
      </span>
    </li>
  );
}

/** One entry per way the finding was found: scanner runs, AI agents, people. */
export function SourcesList({ data }: { data: VulnerabilityDetailDto }) {
  const sources = data.sources ?? [];
  const aiVerified =
    data.discoveredBy === 'tool' || data.discoveredBy === 'manual';
  return (
    <div className="text-sm" data-testid="sources-card">
      {sources.length === 0 ? (
        data.tool?.name ? (
          <ToolLink toolId={data.tool.id} className="flex w-fit items-center gap-3">
            <ToolLogo
              name={data.tool.name}
              logoUrl={data.tool.logoUrl}
              size={32}
              className="shrink-0 rounded-md"
              alt=""
            />
            <span className="font-medium capitalize">{data.tool.name}</span>
          </ToolLink>
        ) : (
          <p className="text-muted-foreground">No sources recorded.</p>
        )
      ) : (
        <ul className="flex flex-wrap gap-x-8 gap-y-3">
          {sources.map((s) => (
            <SourceRow
              key={s.id}
              source={s}
              aiVerified={aiVerified}
              fallbackLogoUrl={
                s.tool && s.tool.id === data.tool?.id
                  ? data.tool?.logoUrl
                  : null
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Tags, identifiers and the CVSS vector broken into its metrics. */
export function ClassificationCard({ data }: { data: VulnerabilityDetailDto }) {
  const navigate = useNavigate();
  const parsed = data.cvssMetric ? parseCVSS(data.cvssMetric) : null;
  const hasIds = !!(
    data.cveId?.length ||
    data.cweId?.length ||
    data.bidId?.length ||
    data.ceaId?.length ||
    data.iava?.length
  );
  if (!data.tags?.length && !hasIds && !parsed && !data.vprScore) return null;
  return (
    <SideCard title="Classification" testId="classification-card">
      {!!data.tags?.length && (
        <div className="flex flex-wrap gap-1">
          {data.tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="h-6 cursor-pointer gap-1 rounded-md font-normal hover:bg-accent"
              onClick={() =>
                navigate({ to: '/vulnerabilities', search: { tags: tag } })
              }
            >
              <Tag className="size-3" /> {tag}
            </Badge>
          ))}
        </div>
      )}
      <IdGroup label="CVE" ids={data.cveId} />
      <IdGroup label="Weaknesses" ids={data.cweId} href={cweHref} />
      <IdGroup label="BID" ids={data.bidId} />
      <IdGroup label="CEA" ids={data.ceaId} />
      <IdGroup label="IAVA" ids={data.iava} />
      {!!data.vprScore && <Row label="VPR">{data.vprScore.toFixed(1)}</Row>}
      {parsed && (
        <div className="flex flex-col gap-1.5 border-t pt-2.5">
          {Object.entries(parsed.normalized).map(([key, metric]) => (
            <Row key={key} label={key.replace(/([A-Z])/g, ' $1').trim()}>
              <span className="font-medium">{metric.name}</span>
            </Row>
          ))}
        </div>
      )}
    </SideCard>
  );
}
