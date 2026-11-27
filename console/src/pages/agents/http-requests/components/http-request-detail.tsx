import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { dateFnsLocale } from '@/lib/date-locale';
import { useT } from '@/lib/i18n-dictionary';
import {
  getAgentHttpRequestsControllerGetHttpRequestQueryKey,
  useAgentHttpRequestsControllerGetHttpRequest,
  type AgentHttpHeaderDto,
  type AgentHttpRequestDetailDto,
} from '@/services/apis/gen/queries';
import { formatBytes } from '@/utils/format-bytes';
import { Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import { useState, type ReactNode } from 'react';
import {
  base64Size,
  displayMethod,
  formatDuration,
  outcomeVariant,
  requestUrl,
  statusVariant,
} from '../format';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{children}</dd>
    </>
  );
}

function Headers({ headers }: { headers: AgentHttpHeaderDto[] }) {
  const t = useT();
  if (headers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('agents.httpRequests.detail.noHeaders')}
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-1 rounded-lg border bg-muted/30 p-3 font-mono text-xs">
      {headers.map((header, i) => (
        <div key={`${header.name}-${i}`} className="contents">
          <dt className="truncate text-muted-foreground">{header.name}</dt>
          <dd className="break-all">{header.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Body({
  body,
  encoding,
  truncated,
}: {
  body: string | null;
  encoding: string | null;
  truncated: boolean;
}) {
  const t = useT();
  const [showBase64, setShowBase64] = useState(false);
  if (!body) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('agents.httpRequests.detail.noBody')}
      </p>
    );
  }
  const binary = encoding === 'base64';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {binary && (
          <>
            <span className="text-xs text-muted-foreground">
              {t('agents.httpRequests.detail.binary', {
                size: formatBytes(base64Size(body)),
              })}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setShowBase64((v) => !v)}
            >
              {showBase64
                ? t('agents.httpRequests.detail.hideBase64')
                : t('agents.httpRequests.detail.showBase64')}
            </Button>
          </>
        )}
        {truncated && (
          <Badge variant="outline">
            {t('agents.httpRequests.detail.truncated')}
          </Badge>
        )}
      </div>
      {(!binary || showBase64) && (
        <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap break-all">
          {body}
        </pre>
      )}
    </div>
  );
}

function DetailBody({ request }: { request: AgentHttpRequestDetailDto }) {
  const t = useT();
  const formatTime = (iso: string) =>
    format(new Date(iso), 'PP HH:mm:ss.SSS', { locale: dateFnsLocale() });
  const payload = request.payload;
  const tunnel = request.method === null;

  return (
    <div className="flex flex-col gap-5 px-4 pb-6">
      <Section title={t('agents.httpRequests.detail.general')}>
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <Field label={t('agents.httpRequests.method')}>
            {displayMethod(request.method)}
          </Field>
          <Field label={t('agents.httpRequests.url')}>
            <span className="font-mono text-xs">{requestUrl(request)}</span>
          </Field>
          <Field label={t('agents.httpRequests.status')}>
            {request.statusCode === null ? (
              '—'
            ) : (
              <Badge variant={statusVariant(request.statusCode)}>
                {request.statusCode}
              </Badge>
            )}
          </Field>
          <Field label={t('agents.httpRequests.detail.outcome')}>
            <Badge
              variant={
                request.outcome === 'allowed'
                  ? 'outline'
                  : outcomeVariant(request.outcome)
              }
            >
              {t(`agents.httpRequests.outcome.${request.outcome}`)}
            </Badge>
          </Field>
          {request.error && (
            <Field label={t('agents.httpRequests.detail.error')}>
              <span className="text-destructive">{request.error}</span>
            </Field>
          )}
          <Field label={t('agents.httpRequests.detail.sent')}>
            {formatTime(request.sentAt)}
          </Field>
          <Field label={t('agents.httpRequests.detail.completed')}>
            {formatTime(request.completedAt)}
          </Field>
          <Field label={t('agents.httpRequests.duration')}>
            {formatDuration(request.durationMs)}
          </Field>
          <Field label={t('agents.httpRequests.detail.bytes')}>
            {t('agents.httpRequests.detail.bytesValue', {
              sent: formatBytes(request.requestBytes),
              received: formatBytes(request.responseBytes),
            })}
          </Field>
          {request.workerId && (
            <Field label={t('agents.httpRequests.detail.worker')}>
              <span className="font-mono text-xs">{request.workerId}</span>
            </Field>
          )}
          <Field label={t('agents.httpRequests.agent')}>
            {request.agentName}
          </Field>
        </dl>
      </Section>

      {request.command && (
        <Section title={t('agents.httpRequests.detail.command')}>
          <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap break-all">
            {request.command}
          </pre>
        </Section>
      )}

      {tunnel ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          {t('agents.httpRequests.detail.tunnelNote')}
        </p>
      ) : (
        <>
          <Section title={t('agents.httpRequests.detail.requestHeaders')}>
            <Headers headers={payload?.requestHeaders ?? []} />
          </Section>
          <Section title={t('agents.httpRequests.detail.requestBody')}>
            <Body
              body={payload?.requestBody ?? null}
              encoding={payload?.requestBodyEncoding ?? null}
              truncated={payload?.requestBodyTruncated ?? false}
            />
          </Section>
          <Section title={t('agents.httpRequests.detail.responseHeaders')}>
            <Headers headers={payload?.responseHeaders ?? []} />
          </Section>
          <Section title={t('agents.httpRequests.detail.responseBody')}>
            <Body
              body={payload?.responseBody ?? null}
              encoding={payload?.responseBodyEncoding ?? null}
              truncated={payload?.responseBodyTruncated ?? false}
            />
          </Section>
        </>
      )}

      <Button asChild variant="outline" size="sm" className="self-start">
        <Link
          to="/aistudio/conversations/$conversationId"
          params={{ conversationId: request.conversationId }}
        >
          {t('agents.httpRequests.detail.openConversation')}
        </Link>
      </Button>
    </div>
  );
}

/** Right-hand sheet with one logged request: timing, command, headers and bodies */
export function HttpRequestDetail({
  requestId,
  onClose,
}: {
  requestId: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data, isLoading, isError } =
    useAgentHttpRequestsControllerGetHttpRequest(requestId ?? '', {
      query: {
        queryKey: [
          ...getAgentHttpRequestsControllerGetHttpRequestQueryKey(requestId ?? ''),
          selectedWorkspaceId,
        ],
        enabled: !!requestId && !!selectedWorkspaceId,
      },
    });

  return (
    <Sheet open={!!requestId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t('agents.httpRequests.detail.title')}</SheetTitle>
          <SheetDescription className="font-mono text-xs break-all">
            {data ? `${displayMethod(data.method)} ${requestUrl(data)}` : ''}
          </SheetDescription>
        </SheetHeader>
        {isLoading ? (
          <div className="space-y-3 px-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : isError || !data ? (
          <p className="px-4 text-sm text-muted-foreground">
            {t('agents.httpRequests.detail.loadFailed')}
          </p>
        ) : (
          <DetailBody request={data} />
        )}
      </SheetContent>
    </Sheet>
  );
}
