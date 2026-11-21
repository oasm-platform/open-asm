import { Badge } from '@/components/ui/badge';
import { DetectionStatusBadge } from '@/components/vulnerabilities/lifecycle-badges';
import {
  DISMISS_REASON_LABELS,
  labelOf,
} from '@/components/vulnerabilities/lifecycle';
import { useT } from '@/lib/i18n-dictionary';
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
import { SideCard } from '../../../issues/components/detail-blocks';
import { cweHref, IdGroup } from './overview-content';
import { ConversationLink, RunLink } from './links';

const fmt = (d?: string | null) =>
  d ? format(new Date(d), 'dd MMM yyyy') : '—';

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
  const t = useT();
  const d = data.dismissal;
  if (d) {
    return (
      <span className="flex flex-col items-end">
        <span>
          {labelOf(DISMISS_REASON_LABELS, d.reason)}
          {d.reason === 'risk_accepted' && d.expiresAt
            ? t('vulnerabilities.hero.until', { date: fmt(d.expiresAt) })
            : ''}
        </span>
        {d.user && (
          <span className="text-xs text-muted-foreground">
            {t('vulnerabilities.side.byName', { name: d.user.name })}
          </span>
        )}
      </span>
    );
  }
  if (data.fixClaimedAt && data.detectionStatus !== 'fixed') {
    return (
      <span className="flex flex-col items-end">
        <span>
          {t('vulnerabilities.side.fixClaimedOn', { date: fmt(data.fixClaimedAt) })}
        </span>
        <span className="text-xs text-muted-foreground">
          {data.fixClaimedByUser
            ? t('vulnerabilities.side.awaitingScanBy', {
                name: data.fixClaimedByUser.name,
              })
            : t('vulnerabilities.side.awaitingScan')}
        </span>
      </span>
    );
  }
  return <span className="text-muted-foreground">
      {t('vulnerabilities.side.untriaged')}
    </span>;
}

/** Detection state, counts, first/last sighting, last fix and triage. */
export function LifecycleCard({
  data,
  events,
}: {
  data: VulnerabilityDetailDto;
  events?: VulnerabilityTimelineEventDto[];
}) {
  const t = useT();
  return (
    <SideCard title={t('vulnerabilities.side.lifecycle')} testId="lifecycle-card">
      <Row label={t('vulnerabilities.side.status')}>
        <DetectionStatusBadge status={data.detectionStatus} />
      </Row>
      <Row label={t('vulnerabilities.side.detected')}>
        {t('vulnerabilities.side.times', { count: data.timesDetected })}
        {data.resurfacedCount > 0 &&
          t('vulnerabilities.side.resurfacedN', { n: data.resurfacedCount })}
      </Row>
      <Row label={t('vulnerabilities.side.firstSeen')}>
        {fmt(data.firstDetectedDate)}
        <RunLink id={firstRunId(data, events)} className="text-xs" />
      </Row>
      <Row label={t('vulnerabilities.side.lastSeen')}>
        {fmt(data.lastSeenDate)}
        <RunLink id={data.lastSeenJobHistoryId} className="text-xs" />
      </Row>
      {data.fixedAt && (
        <Row label={t('vulnerabilities.side.lastFixed')}>
          {fmt(data.fixedAt)}
          <RunLink id={data.fixedByJobHistoryId} className="text-xs" />
        </Row>
      )}
      <Row label={t('vulnerabilities.side.triage')}>
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
  const t = useT();
  if (source.kind === 'ai_agent') {
    return (
      <li className="flex items-center gap-3" data-source-kind="ai_agent">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-300">
          <Bot className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">
              {t('vulnerabilities.side.aiAgent', {
                name: source.agentName ?? t('vulnerabilities.side.agent'),
              })}
            </span>
            {aiVerified && (
              <Badge
                variant="outline"
                className="h-5 rounded-full border-violet-500/30 text-violet-700 dark:text-violet-300"
              >
                {t('vulnerabilities.source.aiVerified')}
              </Badge>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {fmt(source.createdAt)}
            {source.createdBy && (
              <span>
                {t('vulnerabilities.side.runBy', { name: source.createdBy.name })}
              </span>
            )}
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
        {t('vulnerabilities.side.addedBy', {
          name: source.createdBy?.name ?? t('vulnerabilities.side.aMember'),
        })}{' '}
        {fmt(source.createdAt)}
      </li>
    );
  }
  return (
    <li className="flex items-center gap-3" data-source-kind="tool">
      <ToolLink toolId={source.tool?.id} className="shrink-0">
        <ToolLogo
          name={source.tool?.name ?? t('vulnerabilities.discoveredBy.tool')}
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
            {source.tool?.name ?? t('vulnerabilities.discoveredBy.tool')}
          </ToolLink>
          {source.agentConversationId && (
            <span className="text-xs text-muted-foreground">
              {t('vulnerabilities.side.runByAi')}
            </span>
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
  const t = useT();
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
          <p className="text-muted-foreground">
            {t('vulnerabilities.side.noSources')}
          </p>
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
  const t = useT();
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
    <SideCard title={t('vulnerabilities.side.classification')} testId="classification-card">
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
      <IdGroup label={t('vulnerabilities.side.weaknesses')} ids={data.cweId} href={cweHref} />
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
