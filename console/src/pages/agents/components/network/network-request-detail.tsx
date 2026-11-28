import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { dateFnsLocale } from '@/lib/date-locale';
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import {
  getAgentHttpRequestsControllerGetHttpRequestQueryKey,
  useAgentHttpRequestsControllerGetHttpRequest,
  type AgentHttpHeaderDto,
  type AgentHttpRequestListItemDto,
} from '@/services/apis/gen/queries';
import { formatBytes } from '@/utils/format-bytes';
import { format } from 'date-fns';
import { LocateFixed, Lock } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PanelTab, PanelTabStrip } from '../panel-tab-strip';
import {
  base64Size,
  formatDuration,
  isErrorRequest,
  isTunnel,
  requestUrl,
} from './format';
import { MethodBadge } from './method-badge';
import { StatusCell } from './status-cell';

type DetailTab = 'headers' | 'payload' | 'response' | 'timing';

/** Titled like the other side panel tabs' sections */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Name/value rows; the names column shrinks first on a narrow panel. `mono`
 * for raw protocol text (headers), which reads as code elsewhere in the app
 */
function Pairs({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-[minmax(5rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5 leading-relaxed',
        mono ? 'font-mono text-xs' : 'text-sm',
      )}
    >
      {children}
    </dl>
  );
}

function Pair({ name, children }: { name: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="max-w-40 truncate text-muted-foreground" title={typeof name === 'string' ? name : undefined}>
        {name}
      </dt>
      <dd className="min-w-0 break-all">{children}</dd>
    </>
  );
}

function HeaderList({ headers }: { headers: AgentHttpHeaderDto[] }) {
  const t = useT();
  if (headers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('agents.network.detail.noHeaders')}
      </p>
    );
  }
  return (
    <Pairs mono>
      {headers.map((header, i) => (
        <Pair key={`${header.name}-${i}`} name={header.name}>
          {header.value}
        </Pair>
      ))}
    </Pairs>
  );
}

function Body({
  body,
  encoding,
  truncated,
  empty,
}: {
  body: string | null | undefined;
  encoding: string | null | undefined;
  truncated: boolean | undefined;
  empty: string;
}) {
  const t = useT();
  const [showBase64, setShowBase64] = useState(false);
  if (!body) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const binary = encoding === 'base64';
  return (
    <div className="space-y-2">
      {(binary || truncated) && (
        <div className="flex flex-wrap items-center gap-2">
          {binary && (
            <>
              <span className="text-sm text-muted-foreground">
                {t('agents.network.detail.binary', {
                  size: formatBytes(base64Size(body)),
                })}
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={showBase64}
                onClick={() => setShowBase64((v) => !v)}
              >
                {showBase64
                  ? t('agents.network.detail.hideBase64')
                  : t('agents.network.detail.showBase64')}
              </Button>
            </>
          )}
          {truncated && (
            <Badge variant="warning">
              {t('agents.network.detail.truncated')}
            </Badge>
          )}
        </div>
      )}
      {(!binary || showBase64) && (
        <pre className="max-h-80 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
          {body}
        </pre>
      )}
    </div>
  );
}

function TunnelNote() {
  const t = useT();
  return (
    <p className="flex gap-2.5 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
      {t('agents.network.detail.tunnelNote')}
    </p>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

/**
 * One request unfolded under its row in the Network tab: the command that
 * made it, and DevTools' Headers / Payload / Response / Timing views. A
 * tunnel has only metadata, so it gets Headers and Timing.
 */
export function NetworkRequestDetail({
  request,
  onShowInChat,
}: {
  /** The unfolded row; the rest loads from the detail API */
  request: AgentHttpRequestListItemDto;
  onShowInChat?: (toolCallId: string) => void;
}) {
  const t = useT();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const [tab, setTab] = useState<DetailTab>('headers');
  const { data, isLoading, isError } =
    useAgentHttpRequestsControllerGetHttpRequest(request.id, {
      query: {
        queryKey: [
          ...getAgentHttpRequestsControllerGetHttpRequestQueryKey(request.id),
          selectedWorkspaceId,
        ],
        enabled: !!selectedWorkspaceId,
      },
    });
  const tunnel = isTunnel(request);
  const payload = data?.payload;
  const formatTime = (iso: string) =>
    format(new Date(iso), 'PP HH:mm:ss.SSS', { locale: dateFnsLocale() });

  const pending = isLoading ? (
    <DetailSkeleton />
  ) : isError || !data ? (
    <p role="status" className="text-sm text-muted-foreground">
      {t('agents.network.detail.loadFailed')}
    </p>
  ) : null;

  return (
    <div className="border-t border-border/60 bg-muted/20">
      {data?.command && (
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
          <code
            className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
            title={data.command}
          >
            <span className="text-emerald-600 dark:text-emerald-400">$ </span>
            {data.command}
          </code>
          {onShowInChat && request.toolCallId && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-muted-foreground"
              onClick={() => onShowInChat(request.toolCallId!)}
            >
              <LocateFixed />
              {t('agents.network.detail.showInChat')}
            </Button>
          )}
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as DetailTab)}
        className="gap-0"
      >
        <div className="@container/tabs flex h-9 items-center border-b border-border/60 px-3">
          <PanelTabStrip
            value={tab}
            className="gap-4"
            aria-label={t('agents.network.detail.sections')}
          >
            <PanelTab
              value="headers"
              active={tab === 'headers'}
              label={t('agents.network.detail.headers')}
            />
            {!tunnel && (
              <PanelTab
                value="payload"
                active={tab === 'payload'}
                label={t('agents.network.detail.payload')}
              />
            )}
            {!tunnel && (
              <PanelTab
                value="response"
                active={tab === 'response'}
                label={t('agents.network.detail.response')}
              />
            )}
            <PanelTab
              value="timing"
              active={tab === 'timing'}
              label={t('agents.network.detail.timing')}
            />
          </PanelTabStrip>
        </div>

        <TabsContent
          value="headers"
          className="space-y-5 px-3 py-3"
        >
          <Section title={t('agents.network.detail.general')}>
            <Pairs>
              <Pair name={t('agents.network.detail.url')}>
                {requestUrl(request)}
              </Pair>
              <Pair name={t('agents.network.detail.method')}>
                <MethodBadge method={request.method} />
              </Pair>
              <Pair name={t('agents.network.detail.status')}>
                <StatusCell request={request} />
              </Pair>
              <Pair name={t('agents.network.detail.outcome')}>
                {t(`agents.network.outcome.${request.outcome}`)}
              </Pair>
              {request.error && (
                <Pair name={t('agents.network.detail.error')}>
                  <span className="text-destructive">
                    {request.error}
                  </span>
                </Pair>
              )}
              <Pair name={t('agents.network.detail.remote')}>
                {`${request.host}:${request.port}`}
              </Pair>
              <Pair name={t('agents.network.detail.agent')}>
                {request.agentName}
              </Pair>
              {request.workerId && (
                <Pair name={t('agents.network.detail.worker')}>
                  {request.workerId}
                </Pair>
              )}
            </Pairs>
          </Section>
          {tunnel ? (
            <TunnelNote />
          ) : (
            (pending ?? (
              <>
                <Section title={t('agents.network.detail.responseHeaders')}>
                  <HeaderList headers={payload?.responseHeaders ?? []} />
                </Section>
                <Section title={t('agents.network.detail.requestHeaders')}>
                  <HeaderList headers={payload?.requestHeaders ?? []} />
                </Section>
              </>
            ))
          )}
        </TabsContent>
        {!tunnel && (
          <TabsContent
            value="payload"
            className="px-3 py-3"
          >
            {pending ?? (
              <Body
                body={payload?.requestBody}
                encoding={payload?.requestBodyEncoding}
                truncated={payload?.requestBodyTruncated}
                empty={t('agents.network.detail.noPayload')}
              />
            )}
          </TabsContent>
        )}
        {!tunnel && (
          <TabsContent
            value="response"
            className="px-3 py-3"
          >
            {pending ?? (
              <Body
                body={payload?.responseBody}
                encoding={payload?.responseBodyEncoding}
                truncated={payload?.responseBodyTruncated}
                empty={t('agents.network.detail.noResponse')}
              />
            )}
          </TabsContent>
        )}
        <TabsContent
          value="timing"
          className="space-y-5 px-3 py-3"
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{t('agents.network.detail.duration')}</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatDuration(request.durationMs)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full w-full rounded-full',
                  isErrorRequest(request) ? 'bg-destructive/70' : 'bg-primary/70',
                )}
              />
            </div>
          </div>
          <Pairs>
            <Pair name={t('agents.network.detail.sent')}>
              {formatTime(request.sentAt)}
            </Pair>
            <Pair name={t('agents.network.detail.completed')}>
              {formatTime(request.completedAt)}
            </Pair>
            <Pair name={t('agents.network.detail.bytes')}>
              {t('agents.network.detail.bytesValue', {
                sent: formatBytes(request.requestBytes),
                received: formatBytes(request.responseBytes),
              })}
            </Pair>
          </Pairs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
