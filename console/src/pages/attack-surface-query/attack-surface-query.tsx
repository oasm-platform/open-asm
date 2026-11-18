import { useQueryClient } from '@tanstack/react-query';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { CircleAlert, FileClock, Gauge, Play, Save, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';

import { CodeBlock } from '@/components/common/code-block';
import Page from '@/components/common/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTheme } from '@/components/ui/theme-provider';
import { usePermission } from '@/hooks/usePermission';
import {
  getAttackSurfaceQueryControllerListSavedQueryKey,
  useAttackSurfaceQueryControllerCreateSaved,
  useAttackSurfaceQueryControllerDeleteSaved,
  useAttackSurfaceQueryControllerExplain,
  useAttackSurfaceQueryControllerJob,
  useAttackSurfaceQueryControllerListSaved,
  useAttackSurfaceQueryControllerQuery,
  useAttackSurfaceQueryControllerUpdateSaved,
  type ExplainResultDto,
  type QueryBatchDto,
  type ReportJobDto,
} from '@/services/apis/gen/queries';

import {
  asqErrorOf,
  DEFAULT_QUERY,
  nextPageBatch,
  parseQueryText,
  type AsqErrorBody,
  type QueryBatch,
} from './asq-utils';
import { QueryResults, type QueryMeta, type QueryOutcome } from './components/query-results';
import { SchemaPanel } from './components/schema-panel';

interface BatchResult {
  data: Record<string, QueryOutcome>;
  meta: { queries?: Record<string, QueryMeta>; tookMs?: number };
}

const asBatchResult = (value: unknown): BatchResult => value as BatchResult;
const isJob = (value: unknown): value is ReportJobDto =>
  typeof value === 'object' && value !== null && 'jobId' in value;

function ErrorPanel({ error }: { error: AsqErrorBody }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="space-y-1">
        <div className="font-medium">
          {error.code}: {error.message}
        </div>
        {error.issues?.map((issue) => (
          <div key={`${issue.path}:${issue.code}`} className="text-muted-foreground">
            <span className="font-mono">{issue.path}</span> ({issue.code}): {issue.message}
          </div>
        ))}
        {error.hints?.length ? <div className="text-muted-foreground">Hints: {error.hints.join('; ')}</div> : null}
      </div>
    </div>
  );
}

/**
 * Attack surface query playground: write a JSON query batch, run or explain
 * it, page through results, run it as a report job, and keep it as a saved
 * query.
 *
 * Not released yet: no route or menu entry points here. To ship it, add
 * `routes/_authed/attack-surface-query.tsx` rendering this page and a "Query"
 * item in `components/common/layout/menu-bar.tsx` (permission `asset.read`).
 */
export default function AttackSurfaceQuery() {
  const { resolvedTheme } = useTheme();
  const { hasPermission } = usePermission();
  const queryClient = useQueryClient();
  const canWriteSaved = hasPermission('report.write');

  const [text, setText] = useState(DEFAULT_QUERY);
  const [lastBatch, setLastBatch] = useState<QueryBatch | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [explain, setExplain] = useState<ExplainResultDto | null>(null);
  const [error, setError] = useState<AsqErrorBody | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string>('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const parsed = useMemo(() => parseQueryText(text), [text]);
  const extensions = useMemo(() => [EditorView.lineWrapping], []);

  // Errors are shown here (panel or toast), so the global mutation toast is replaced.
  const ownErrors = { mutation: { onError: () => undefined } };
  const runMutation = useAttackSurfaceQueryControllerQuery(ownErrors);
  const explainMutation = useAttackSurfaceQueryControllerExplain(ownErrors);
  const { data: savedQueries } = useAttackSurfaceQueryControllerListSaved({
    query: { enabled: hasPermission('report.read') },
  });
  const refreshSaved = () =>
    queryClient.invalidateQueries({ queryKey: getAttackSurfaceQueryControllerListSavedQueryKey() });
  const createSaved = useAttackSurfaceQueryControllerCreateSaved(ownErrors);
  const updateSaved = useAttackSurfaceQueryControllerUpdateSaved(ownErrors);
  const deleteSaved = useAttackSurfaceQueryControllerDeleteSaved(ownErrors);

  const { data: job } = useAttackSurfaceQueryControllerJob(jobId ?? '', {
    query: {
      enabled: Boolean(jobId),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === 'completed' || status === 'failed' ? false : 1500;
      },
    },
  });
  const jobResult = job?.status === 'completed' && job.result ? asBatchResult(job.result) : null;
  const shown = jobResult ?? result;

  const run = useCallback(
    (mode: 'interactive' | 'report') => {
      if (!parsed.ok) return;
      const batch: QueryBatch = {
        ...parsed.value,
        options: { ...(parsed.value.options ?? {}), mode },
      };
      setError(null);
      setExplain(null);
      setJobId(null);
      runMutation.mutate(
        { data: batch as QueryBatchDto },
        {
          onSuccess: (response) => {
            if (isJob(response)) {
              setResult(null);
              setJobId(response.jobId);
              toast.info('Report job queued');
              return;
            }
            setLastBatch(batch);
            setResult(asBatchResult(response));
          },
          onError: (err) => setError(asqErrorOf(err)),
        },
      );
    },
    [parsed, runMutation],
  );

  const runExplain = () => {
    if (!parsed.ok) return;
    setError(null);
    explainMutation.mutate(
      { data: parsed.value as QueryBatchDto },
      { onSuccess: setExplain, onError: (err) => setError(asqErrorOf(err)) },
    );
  };

  const loadMore = (name: string, cursor: string) => {
    if (!lastBatch || !result) return;
    setLoadingMore(name);
    runMutation.mutate(
      { data: nextPageBatch(lastBatch, name, cursor) as QueryBatchDto },
      {
        onSuccess: (response) => {
          const page = asBatchResult(response).data[name];
          setResult((current) => {
            if (!current) return current;
            const previous = current.data[name];
            if (!previous || 'error' in previous || 'error' in page) {
              return { ...current, data: { ...current.data, [name]: page } };
            }
            return {
              ...current,
              data: { ...current.data, [name]: { ...page, rows: [...previous.rows, ...page.rows], total: previous.total } },
            };
          });
        },
        onError: (err) => setError(asqErrorOf(err)),
        onSettled: () => setLoadingMore(null),
      },
    );
  };

  const loadSaved = (id: string) => {
    setSavedId(id);
    const saved = savedQueries?.find((q) => q.id === id);
    if (saved) {
      setText(`${JSON.stringify(saved.spec, null, 2)}\n`);
      setSaveName(saved.name);
    }
  };

  const save = () => {
    if (!parsed.ok || !saveName.trim()) return;
    const onError = (err: unknown) => toast.error(asqErrorOf(err).message);
    const spec = parsed.value as Record<string, unknown>;
    if (savedId) {
      updateSaved.mutate(
        { id: savedId, data: { name: saveName.trim(), spec } },
        {
          onSuccess: () => {
            toast.success('Saved query updated');
            setSaveOpen(false);
            void refreshSaved();
          },
          onError,
        },
      );
    } else {
      createSaved.mutate(
        { data: { name: saveName.trim(), spec } },
        {
          onSuccess: (created) => {
            toast.success('Query saved');
            setSavedId(created.id);
            setSaveOpen(false);
            void refreshSaved();
          },
          onError,
        },
      );
    }
  };

  const remove = () => {
    if (!savedId) return;
    deleteSaved.mutate(
      { id: savedId },
      {
        onSuccess: () => {
          toast.success('Saved query deleted');
          setSavedId('');
          setSaveName('');
          void refreshSaved();
        },
        onError: (err) => toast.error(asqErrorOf(err).message),
      },
    );
  };

  useHotkeys('mod+enter', () => run('interactive'), { enableOnContentEditable: true, preventDefault: true }, [run]);

  const busy = runMutation.isPending && !loadingMore;

  return (
    <Page
      title="Attack Surface Query"
      permission="asset.read"
      description="Query hosts, services, technologies, TLS, URLs, IPs, DNS and findings with a JSON query batch."
      action={
        <div className="flex items-center gap-2">
          {savedQueries && savedQueries.length > 0 && (
            <Select value={savedId} onValueChange={loadSaved}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Saved queries" />
              </SelectTrigger>
              <SelectContent>
                {savedQueries.map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canWriteSaved && (
            <Button variant="outline" disabled={!parsed.ok} onClick={() => setSaveOpen(true)}>
              <Save className="size-4" /> Save
            </Button>
          )}
          {canWriteSaved && savedId && (
            <ConfirmDialog
              title="Delete saved query"
              description={`Delete "${saveName}"?`}
              confirmText="Delete"
              disabled={deleteSaved.isPending}
              onConfirm={remove}
              trigger={
                <Button variant="ghost" size="icon" aria-label="Delete saved query">
                  <Trash2 className="size-4" />
                </Button>
              }
            />
          )}
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">
          <div className="overflow-hidden rounded-md border">
            <CodeMirror
              value={text}
              onChange={setText}
              theme={resolvedTheme === 'dark' ? tokyoNight : 'light'}
              extensions={extensions}
              height="340px"
              className="text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => run('interactive')} disabled={!parsed.ok || busy}>
              <Play className="size-4" /> {busy ? 'Running…' : 'Run'}
            </Button>
            <Button variant="outline" onClick={runExplain} disabled={!parsed.ok || explainMutation.isPending}>
              <Gauge className="size-4" /> Explain
            </Button>
            <Button variant="outline" onClick={() => run('report')} disabled={!parsed.ok || busy}>
              <FileClock className="size-4" /> Run as report
            </Button>
            <span className="text-xs text-muted-foreground">Ctrl/⌘ + Enter to run</span>
            {!parsed.ok && <span className="text-xs text-destructive">{parsed.message}</span>}
            {result?.meta.tookMs !== undefined && !jobResult && (
              <span className="ml-auto text-xs text-muted-foreground">{result.meta.tookMs} ms</span>
            )}
          </div>

          {error && <ErrorPanel error={error} />}
          {jobId && job?.status !== 'completed' && (
            <div className="rounded-md border p-3 text-sm">
              Report job <span className="font-mono">{jobId}</span>: {job?.status ?? 'queued'}
              {job?.status === 'failed' && job.error ? ` (${String((job.error as { message?: unknown }).message ?? '')})` : ''}
            </div>
          )}
          {explain && (
            <CodeBlock language="json" value={JSON.stringify(explain.queries, null, 2)} className="max-h-80 overflow-auto" />
          )}
          {shown && (
            <QueryResults
              data={shown.data}
              meta={shown.meta.queries ?? {}}
              loadingMore={jobResult ? null : loadingMore}
              onLoadMore={loadMore}
            />
          )}
        </div>
        <div className="lg:h-[calc(100vh-12rem)]">
          <SchemaPanel />
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{savedId ? 'Update saved query' : 'Save query'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="asq-save-name">Name</Label>
            <Input id="asq-save-name" maxLength={120} value={saveName} onChange={(e) => setSaveName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={!saveName.trim() || createSaved.isPending || updateSaved.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
