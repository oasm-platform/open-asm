import Page from '@/components/common/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ReviewStatusBadge,
  SeverityBadge,
} from '@/components/vulnerabilities/lifecycle-badges';
import { sourceSummaryLabel } from '@/components/vulnerabilities/lifecycle';
import { usePermission } from '@/hooks/usePermission';
import {
  useVulnerabilitiesControllerGetProposalDuplicates,
  useVulnerabilitiesControllerGetSettings,
  type VulnerabilityDetailDto,
  type VulnerabilitySourceDetailDto,
  type VulnerabilityTimelineEventDto,
} from '@/services/apis/gen/queries';
import { Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import {
  Check,
  CircleCheck,
  CircleX,
  Clock,
  GitMerge,
  Sparkles,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ConversationLink, RunLink } from '../detail/links';
import { VulnerabilityOverview, cweHref } from '../detail/overview-content';
import { VulnerabilityTimeline } from '../detail/timeline';
import {
  ApproveDialog,
  MergeDialog,
  RejectDialog,
  useMergeProposal,
} from './review-dialogs';

type CitationStatus = 'found' | 'not_found' | 'output_expired';
type EvidenceVerdict = 'evidence_checked' | 'unverified' | 'output_expired';

/** One quote the server looked up in the stored tool output it cites. */
interface CheckedCitation {
  runId: string;
  quote: string;
  status: CitationStatus;
  line?: number;
  excerpt?: string;
}

interface Evidence {
  requests: string[];
  responses: string[];
  baseline?: string;
  notes?: string;
  /** Set by the server when the agent proposed; absent on older proposals. */
  check?: { verdict: EvidenceVerdict; citations: CheckedCitation[] };
}

const VERDICTS: Record<
  EvidenceVerdict,
  { label: string; variant: 'success' | 'warning' | 'secondary'; hint: string }
> = {
  evidence_checked: {
    label: 'Quotes checked',
    variant: 'success',
    hint: 'Every quote was found verbatim in the tool output it cites.',
  },
  unverified: {
    label: 'Unverified',
    variant: 'warning',
    hint: 'Not every quote was found in tool output. Check the proof yourself.',
  },
  output_expired: {
    label: 'Output expired',
    variant: 'secondary',
    hint: 'Some tool output was gone before it could be checked.',
  },
};

const CITATION_STATUS: Record<CitationStatus, { icon: ReactNode; text: string }> = {
  found: {
    icon: <CircleCheck className="size-3.5 text-success" />,
    text: 'found',
  },
  not_found: {
    icon: <CircleX className="size-3.5 text-destructive" />,
    text: 'not in the output',
  },
  output_expired: {
    icon: <Clock className="size-3.5 text-muted-foreground" />,
    text: 'output expired or unknown run',
  },
};

function readCheck(value: unknown): Evidence['check'] {
  if (!value || typeof value !== 'object') return undefined;
  const { verdict, citations } = value as Record<string, unknown>;
  if (typeof verdict !== 'string' || !(verdict in VERDICTS)) return undefined;
  return {
    verdict: verdict as EvidenceVerdict,
    citations: Array.isArray(citations)
      ? (citations as CheckedCitation[]).filter(
          (c) => c && typeof c.quote === 'string' && c.status in CITATION_STATUS,
        )
      : [],
  };
}

const asStrings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
    : [];

/** The agent's evidence: requests, responses, baseline and notes (latest agent source). */
export function readEvidence(
  sources: VulnerabilitySourceDetailDto[],
): Evidence | null {
  const agent = [...sources]
    .filter((s) => s.kind === 'ai_agent' && s.evidence)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!agent?.evidence) return null;
  const e = agent.evidence as Record<string, unknown>;
  return {
    requests: asStrings(e.requests),
    responses: asStrings(e.responses),
    baseline: typeof e.baseline === 'string' ? e.baseline : undefined,
    notes: typeof e.notes === 'string' ? e.notes : undefined,
    check: readCheck(e.check),
  };
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center justify-end gap-1 text-right break-all">
        {children}
      </span>
    </div>
  );
}

const pre =
  'whitespace-pre-wrap break-all rounded bg-muted/60 p-2 font-mono text-xs';

function QuotedOutput({ check }: { check: NonNullable<Evidence['check']> }) {
  return (
    <div data-testid="evidence-check">
      <span className="text-xs font-medium text-muted-foreground">
        Quoted tool output
      </span>
      <p className="mt-1 text-xs text-muted-foreground">
        {check.citations.length === 0
          ? 'The agent quoted no tool output.'
          : VERDICTS[check.verdict].hint}
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {check.citations.map((c, i) => (
          <li key={i} className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-1.5 text-xs">
              {CITATION_STATUS[c.status].icon}
              <span>{CITATION_STATUS[c.status].text}</span>
              <span className="font-mono text-muted-foreground" title={c.runId}>
                run {c.runId.slice(0, 8)}
                {c.line ? `, line ${c.line}` : ''}
              </span>
            </span>
            <pre className={pre}>{c.excerpt ?? c.quote}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceCard({ evidence }: { evidence: Evidence | null }) {
  const verdict = evidence?.check && VERDICTS[evidence.check.verdict];
  return (
    <Card className="gap-3 py-4 shadow-none" data-testid="evidence-card">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
        <CardTitle className="text-sm">
          Evidence provided by the agent
        </CardTitle>
        {verdict && (
          <Badge variant={verdict.variant} title={verdict.hint}>
            {verdict.label}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        {!evidence ? (
          <p className="text-sm text-muted-foreground">
            The agent attached no evidence.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="w-1/2 pb-1 pr-2 font-medium">Request</th>
                    <th className="w-1/2 pb-1 font-medium">Response</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {evidence.requests.map((req, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-2 pr-2">
                        <pre className={pre}>{req}</pre>
                      </td>
                      <td className="py-2">
                        <pre className={pre}>
                          {evidence.responses[i] ?? '—'}
                        </pre>
                      </td>
                    </tr>
                  ))}
                  {evidence.responses
                    .slice(evidence.requests.length)
                    .map((res, i) => (
                      <tr key={`extra-${i}`} className="border-t">
                        <td className="py-2 pr-2 text-muted-foreground">—</td>
                        <td className="py-2">
                          <pre className={pre}>{res}</pre>
                        </td>
                      </tr>
                    ))}
                  {evidence.baseline && (
                    <tr className="border-t">
                      <td className="py-2 pr-2 text-xs font-medium text-muted-foreground">
                        Baseline (negative control)
                      </td>
                      <td className="py-2">
                        <pre className={pre}>{evidence.baseline}</pre>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {evidence.check && <QuotedOutput check={evidence.check} />}
            {evidence.notes && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">
                  Agent notes
                </span>
                <p className="mt-1 whitespace-pre-line text-sm">
                  {evidence.notes}
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ToolCallsCard({
  sources,
}: {
  sources: VulnerabilitySourceDetailDto[];
}) {
  const tools = sources.filter((s) => s.kind === 'tool');
  const callIds = [...new Set(sources.flatMap((s) => s.toolCallIds ?? []))];
  const conversationId = sources.find(
    (s) => s.agentConversationId,
  )?.agentConversationId;
  return (
    <Card className="gap-3 py-4 shadow-none" data-testid="tool-calls-card">
      <CardHeader className="flex flex-row items-center justify-between px-4">
        <CardTitle className="text-sm">Related tool calls</CardTitle>
        <ConversationLink
          id={conversationId}
          label="Open conversation"
          className="text-xs"
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4 text-sm">
        {tools.length === 0 && callIds.length === 0 && (
          <p className="text-muted-foreground">
            The agent cited no tool calls.
          </p>
        )}
        {tools.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {tools.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <Wrench className="size-3.5 text-primary" />
                <span className="font-medium">{t.tool?.name ?? 'tool'}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(t.createdAt), 'dd MMM HH:mm')}
                </span>
                <RunLink id={t.jobHistoryId} className="text-xs" />
              </li>
            ))}
          </ul>
        )}
        {callIds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {callIds.map((c) => (
              <Badge
                key={c}
                variant="outline"
                className="font-mono text-xs"
                title="Tool call id"
              >
                {c}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DuplicatesCard({
  id,
  canWrite,
  onChange,
}: {
  id: string;
  canWrite: boolean;
  onChange: () => void;
}) {
  const { data, isLoading } =
    useVulnerabilitiesControllerGetProposalDuplicates(id);
  const { merge, isPending } = useMergeProposal(id, onChange);
  const list = data?.data ?? [];
  return (
    <Card className="gap-3 py-4 shadow-none" data-testid="duplicates-card">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Possible duplicates</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4 text-sm">
        {isLoading ? (
          <>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground">
            No approved finding on this asset shares a CWE/CVE, the URL or the
            name.
          </p>
        ) : (
          list.map((d) => (
            <div
              key={d.id}
              className="flex items-start justify-between gap-2"
              data-duplicate-id={d.id}
            >
              <div className="min-w-0 flex-1">
                <Link
                  to="/vulnerabilities/$id"
                  params={{ id: d.id }}
                  className="font-medium hover:underline"
                >
                  {d.name}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <SeverityBadge severity={d.severity} />
                  <span>
                    matches{' '}
                    {d.reasons.join(', ').replace('affected_url', 'URL')}
                  </span>
                </div>
              </div>
              {canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => merge(d.id)}
                  aria-label={`Merge into ${d.name}`}
                >
                  <GitMerge className="mr-1 size-3.5" />
                  Merge
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Proposal from an AI agent: evidence, tool calls, facts, duplicates and the review decision. */
export function ProposalReview({
  data,
  events,
  onChange,
}: {
  data: VulnerabilityDetailDto;
  events?: VulnerabilityTimelineEventDto[];
  onChange: () => void;
}) {
  const { hasPermission } = usePermission();
  const { data: settings } = useVulnerabilitiesControllerGetSettings();
  const canWrite = hasPermission('vulnerability.write');
  const pending = data.reviewStatus === 'pending_review';
  const sources = data.sources ?? [];
  const agentSource = sources.find((s) => s.kind === 'ai_agent');
  const evidence = readEvidence(sources);
  const severity = (data.severity ?? 'info').toLowerCase();
  const slaDays =
    settings?.slaDays?.[severity as keyof typeof settings.slaDays];
  const { data: duplicates } =
    useVulnerabilitiesControllerGetProposalDuplicates(data.id, {
      query: { enabled: pending },
    });

  const actions =
    pending && canWrite ? (
      <div className="flex flex-wrap items-center gap-2">
        <RejectDialog
          id={data.id}
          onDone={onChange}
          trigger={
            <Button variant="outline" size="sm">
              <X className="mr-1 size-4" />
              Reject…
            </Button>
          }
        />
        <MergeDialog
          id={data.id}
          duplicates={duplicates?.data ?? []}
          onDone={onChange}
          trigger={
            <Button variant="outline" size="sm">
              <GitMerge className="mr-1 size-4" />
              Merge into…
            </Button>
          }
        />
        <ApproveDialog
          id={data.id}
          severity={severity}
          onDone={onChange}
          trigger={
            <Button size="sm">
              <Check className="mr-1 size-4" />
              Approve
            </Button>
          }
        />
      </div>
    ) : undefined;

  return (
    <Page
      title={
        <span className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={severity} />
          {data.name}
        </span>
      }
      description={pending ? 'AI proposal waiting for review' : 'AI proposal'}
      permission="vulnerability.read"
      action={actions}
    >
      <div className="flex flex-col gap-4">
        {data.reviewStatus === 'rejected' && (
          <Alert data-testid="rejected-banner">
            <XCircle className="size-4" />
            <AlertTitle>
              Rejected
              {data.reviewedByUser ? ` by ${data.reviewedByUser.name}` : ''}
              {data.reviewedAt
                ? ` on ${format(new Date(data.reviewedAt), 'dd MMM yyyy')}`
                : ''}
            </AlertTitle>
            <AlertDescription>
              {data.reviewNote ? (
                <q className="italic">{data.reviewNote}</q>
              ) : (
                'No reason recorded.'
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
            <EvidenceCard evidence={evidence} />
            <ToolCallsCard sources={sources} />
            <Card className="py-4 shadow-none">
              <CardContent className="px-4">
                <VulnerabilityOverview data={data} />
              </CardContent>
            </Card>
            {!pending && (
              <Card className="gap-3 py-4 shadow-none">
                <CardHeader className="px-4">
                  <CardTitle className="text-sm">Timeline</CardTitle>
                </CardHeader>
                <CardContent className="px-4">
                  <VulnerabilityTimeline events={events} />
                </CardContent>
              </Card>
            )}
          </div>
          <div className="flex flex-col gap-4 lg:sticky lg:top-4">
            <Card
              className="gap-3 py-4 shadow-none"
              data-testid="proposal-card"
            >
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <Sparkles className="size-4 text-amber-500" />
                  Proposal
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 px-4">
                <Fact label="Status">
                  <ReviewStatusBadge status={data.reviewStatus} />
                </Fact>
                <Fact label="Source">
                  {sourceSummaryLabel({
                    sources: sources.map((s) => ({
                      kind: s.kind,
                      toolName: s.tool?.name,
                      agentName: s.agentName,
                    })),
                    discoveredBy: data.discoveredBy,
                  })}
                </Fact>
                {data.asset && <Fact label="Asset">{data.asset.value}</Fact>}
                {data.affectedUrl && (
                  <Fact label="URL">{data.affectedUrl}</Fact>
                )}
                {!!data.cweId?.length && (
                  <Fact label="CWE">
                    {data.cweId.map((c) => (
                      <a
                        key={c}
                        href={cweHref(c)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {c}
                      </a>
                    ))}
                  </Fact>
                )}
                {!!data.cveId?.length && (
                  <Fact label="CVE">{data.cveId.join(', ')}</Fact>
                )}
                <Fact label="Severity">
                  <SeverityBadge severity={severity} />
                  {pending && (
                    <span className="text-xs text-muted-foreground">
                      editable on approve
                    </span>
                  )}
                </Fact>
                {agentSource?.agentName && (
                  <Fact label="Agent">{agentSource.agentName}</Fact>
                )}
                {agentSource?.agentConversationId && (
                  <Fact label="Conversation">
                    <ConversationLink
                      id={agentSource.agentConversationId}
                      label="Open"
                    />
                  </Fact>
                )}
                {agentSource?.createdBy && (
                  <Fact label="Run by">{agentSource.createdBy.name}</Fact>
                )}
                <Fact label="Proposed">
                  {format(
                    new Date(agentSource?.createdAt ?? data.createdAt),
                    'dd MMM yyyy HH:mm',
                  )}
                </Fact>
              </CardContent>
            </Card>
            {pending && (
              <DuplicatesCard
                id={data.id}
                canWrite={canWrite}
                onChange={onChange}
              />
            )}
            {pending && (
              <Card className="gap-2 py-4 shadow-none">
                <CardHeader className="px-4">
                  <CardTitle className="text-sm">After approval</CardTitle>
                </CardHeader>
                <CardContent className="px-4 text-sm text-muted-foreground">
                  The finding joins the list as New
                  {slaDays
                    ? `, its ${severity} SLA of ${slaDays} days starts`
                    : ''}{' '}
                  and it is announced like any detection, so issue rules and
                  notifications apply.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}
