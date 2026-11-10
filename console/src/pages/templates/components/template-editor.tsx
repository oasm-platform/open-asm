import { useBlocker, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { yamlSchema } from 'codemirror-json-schema/yaml';
import * as prettierYaml from 'prettier/plugins/yaml';
import * as prettier from 'prettier/standalone';
import {
  CircleAlert,
  CircleCheck,
  FilePlus,
  MoreHorizontal,
  PanelLeftOpen,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { parse } from 'yaml';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import SeverityBadge from '@/components/ui/severity-badge';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/components/ui/theme-provider';
import { usePermission } from '@/hooks/usePermission';
import { handleServerError } from '@/lib/handle-server-error';
import { cn } from '@/lib/utils';
import {
  getTemplatesControllerGetContentQueryKey,
  getTemplatesControllerGetManyQueryKey,
  useTemplatesControllerCreate,
  useTemplatesControllerGetContent,
  useTemplatesControllerSaveContent,
} from '@/services/apis/gen/queries';
import {
  DEFAULT_TEMPLATE_NAME,
  TABS_ROOT,
  isDirty,
  useTemplateTabs,
  type State,
  type TemplateTab,
} from '../hooks/use-template-tabs';
import { useTemplateUpload } from '../hooks/use-template-upload';
import { AiGenButton } from './ai-gen-button';
import { RunTemplatesDialog } from './run-templates-dialog';
import { TemplateActionsMenu } from './template-actions-menu';
import { TemplateTabs } from './template-tabs';
import { nucleiSchema } from '../nuclei-schema';
import { readApiError, toastStorageFull } from '../template-errors';
import { readTemplateMeta } from '../template-meta';

// Server-side cap on template size (TemplatesService).
const MAX_TEMPLATE_BYTES = 256 * 1024;
const MOD = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl+';

const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;

/** `<id>.yaml` from the top-level YAML id, sanitized; the default name if absent or unparsable. */
function nameFromContent(content: string): string {
  try {
    const id = (parse(content) as { id?: unknown } | null)?.id;
    if (typeof id !== 'string') return DEFAULT_TEMPLATE_NAME;
    const base = id.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 195);
    return /[A-Za-z0-9]/.test(base) ? `${base}.yaml` : DEFAULT_TEMPLATE_NAME;
  } catch {
    return DEFAULT_TEMPLATE_NAME;
  }
}

function TemplatePane({ tab }: { tab: TemplateTab }) {
  const { hasPermission } = usePermission();
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { update, markSaved, setSaving, load } = useTemplateTabs();
  const saveContent = useTemplatesControllerSaveContent({
    mutation: { onError: () => {} }, // errors are shown here, not by the global handler
  });
  const create = useTemplatesControllerCreate({
    mutation: { onError: () => {} },
  });
  const { saving } = tab;
  const [yamlError, setYamlError] = useState<string | null>(null);
  const { isMobile } = useSidebar();
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  const { data, isError, isFetchedAfterMount, refetch } =
    useTemplatesControllerGetContent(tab.artifactId ?? '', {
      query: { enabled: !!tab.artifactId },
    });

  // open() adds a blank tab; fill it once from a fresh fetch (never the cache,
  // which may predate another member's edit), unless the user already typed.
  useEffect(() => {
    if (tab.artifactId && !tab.loaded && data && isFetchedAfterMount) {
      load(tab.id, data.artifact, data.content);
    }
  }, [data, isFetchedAfterMount, tab.id, tab.artifactId, tab.loaded, load]);

  const loadFailed = !!tab.artifactId && !tab.loaded && isError;
  const loading = !!tab.artifactId && !tab.loaded && !isError;
  const readOnly = tab.readOnly || !hasPermission('artifact.write');
  const dirty = tab.content !== tab.savedContent;
  const canSave = dirty && !readOnly && !saving && !loading && !loadFailed;

  const save = async () => {
    if (!canSave) return;
    const { content } = tab;
    setSaving(tab.id, true);
    setYamlError(null);
    try {
      const artifact = tab.artifactId
        ? await saveContent.mutateAsync({
            id: tab.artifactId,
            data: { content },
          })
        : await create.mutateAsync({ data: { name: nameFromContent(content), content } });
      markSaved(tab.id, artifact, content);
      queryClient.setQueryData(
        getTemplatesControllerGetContentQueryKey(artifact.id),
        { artifact, content },
      );
      if (!tab.artifactId) {
        await queryClient.invalidateQueries({
          queryKey: getTemplatesControllerGetManyQueryKey(),
        });
      }
    } catch (error) {
      const { status, message } = readApiError(error);
      if (status === 409) {
        toastStorageFull(message, () =>
          void navigate({ to: '/settings/$tab', params: { tab: 'files' } }),
        );
      } else if (status === 400 && message) {
        setYamlError(message);
      } else if (status === 413) {
        toast.error('Template is too large (256 KB maximum)');
      } else {
        handleServerError(error);
      }
    } finally {
      setSaving(tab.id, false);
    }
  };

  const format = async () => {
    try {
      const formatted = await prettier.format(tab.content, {
        parser: 'yaml',
        plugins: [prettierYaml],
      });
      update(tab.id, formatted);
      setYamlError(null);
    } catch {
      toast.error('Fix the YAML errors before formatting');
    }
  };

  const hot = { enableOnContentEditable: true, enableOnFormTags: true };
  useHotkeys(
    'mod+s',
    (e) => {
      e.preventDefault();
      void save();
    },
    hot,
  );
  useHotkeys(
    'mod+shift+f',
    (e) => {
      e.preventDefault();
      if (!readOnly) void format();
    },
    hot,
  );

  const owner =
    data?.artifact.createdBy?.name ?? 'another member';
  const status = tab.readOnly
    ? `Shared by ${owner} · read-only`
    : readOnly
      ? 'Read-only'
      : saving
        ? 'Saving…'
        : dirty
          ? 'Unsaved changes'
          : 'Saved';
  // Esc then Tab leaves the editor; CodeMirror keeps Tab for indentation.
  const extensions = useMemo(
    () => [
      // YAML language plus Nuclei-schema autocomplete, hover docs and lint.
      yamlSchema(nucleiSchema),
      EditorView.contentAttributes.of({
        'aria-label': `${tab.name} YAML. Press Escape then Tab to leave the editor.`,
      }),
    ],
    [tab.name],
  );

  // Parsed off the typing path: a 256 KB template would lag every keystroke.
  const deferred = useDeferredValue(tab.content);
  const meta = useMemo(() => readTemplateMeta(deferred), [deferred]);
  const bytes = useMemo(() => new TextEncoder().encode(deferred).length, [deferred]);
  const ready = !loading && !loadFailed;
  const formatDisabled = readOnly || loading || loadFailed;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Wraps in a narrow pane so Run/Format/Save stay reachable. */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{meta.name ?? tab.name}</span>
            {ready && meta.severity && <SeverityBadge severity={meta.severity} />}
            {ready && meta.protocol && (
              <Badge variant="secondary" className="font-normal">
                {meta.protocol}
              </Badge>
            )}
          </div>
          {ready && (meta.id || meta.tags.length > 0) && (
            <p className="truncate text-xs text-muted-foreground">
              {[meta.id && `id: ${meta.id}`, meta.tags.length && `tags: ${meta.tags.join(', ')}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <span
            aria-live="polite"
            className={cn(
              'max-w-56 truncate rounded-full px-2 py-0.5 text-xs',
              dirty && !readOnly
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {status}
          </span>
          <TemplateActionsMenu
            file={tab.artifactId ? data?.artifact : undefined}
            align="end"
            trigger={
              <Button size="sm" variant="outline" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            }
          >
            {/* Phones keep only Run outside the menu. */}
            {isMobile && (
              <>
                <DropdownMenuItem disabled={formatDisabled} onSelect={() => void format()}>
                  Format
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canSave} onSelect={() => void save()}>
                  {saving ? 'Saving…' : 'Save'}
                </DropdownMenuItem>
              </>
            )}
          </TemplateActionsMenu>
          {!isMobile && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void format()}
                disabled={formatDisabled}
              >
                Format
              </Button>
              <Button
                size="sm"
                variant={dirty ? 'default' : 'outline'}
                onClick={() => void save()}
                disabled={!canSave}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
          {tab.artifactId && (
            <RunTemplatesDialog
              templateId={tab.artifactId}
              // Primary once saved; while dirty, Save is the next step.
              variant={dirty ? 'outline' : 'default'}
              // The server runs the saved version, so unsaved edits must not look runnable.
              disabled={
                dirty || loading || loadFailed || !hasPermission('vulnerability.write')
              }
            />
          )}
        </div>
      </div>
      {yamlError && (
        <p
          role="alert"
          className="border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
        >
          {yamlError}
        </p>
      )}
      {loadFailed ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <p>Could not load this template.</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <CodeMirror
            value={tab.content}
            onChange={(v) => update(tab.id, v)}
            theme={resolvedTheme === 'dark' ? tokyoNight : 'light'}
            extensions={extensions}
            readOnly={readOnly}
            editable={!readOnly}
            className="text-sm h-full"
            height="100%"
            onStatistics={(s) =>
              setCursor({
                line: s.line.number,
                col: s.selectionAsSingle.head - s.line.from + 1,
              })
            }
          />
        </div>
      )}
      {ready && (
        <div className="flex items-center gap-4 border-t px-3 py-1 text-xs text-muted-foreground">
          {meta.error ? (
            <span
              className="flex min-w-0 items-center gap-1 text-destructive"
              title={meta.error.message}
            >
              <CircleAlert className="size-3.5 shrink-0" />
              <span className="truncate">
                {meta.error.line ? `YAML error on line ${meta.error.line}` : 'YAML error'}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CircleCheck className="size-3.5" /> Valid YAML
            </span>
          )}
          <span className="whitespace-nowrap">
            Ln {cursor.line}, Col {cursor.col}
          </span>
          <span
            className={cn('whitespace-nowrap', bytes > MAX_TEMPLATE_BYTES && 'text-destructive')}
          >
            {formatBytes(bytes)} / 256 KB
          </span>
          {!readOnly && (
            <span className="ml-auto hidden whitespace-nowrap lg:inline">
              {MOD}S save · {MOD}Shift+F format
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function TemplateEditor({ onShowList }: { onShowList?: () => void } = {}) {
  const { tabs, activeId, activate, close, discardDirty } = useTemplateTabs();
  const queryClient = useQueryClient();
  const { isMobile } = useSidebar();
  const [closing, setClosing] = useState<TemplateTab | null>(null);
  const active = tabs.find((t) => t.id === activeId);
  const anyDirty = tabs.some(isDirty);

  const blocker = useBlocker({
    shouldBlockFn: () => anyDirty,
    // Reload/close loses every workspace's drafts, not just the current one's.
    enableBeforeUnload: () =>
      queryClient
        .getQueriesData<State>({ queryKey: [TABS_ROOT] })
        .some(([, s]) => s?.tabs.some(isDirty)),
    withResolver: true,
  });

  const requestClose = (tab: TemplateTab) =>
    isDirty(tab) ? setClosing(tab) : close(tab.id);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <TemplateTabs
        tabs={tabs}
        activeId={activeId}
        onSelect={activate}
        onClose={requestClose}
        leading={
          isMobile ? (
            <SidebarTrigger className="m-1" aria-label="Browse templates" />
          ) : onShowList ? (
            <Button
              size="icon"
              variant="ghost"
              className="m-1 size-7"
              aria-label="Show template list"
              title="Show template list"
              onClick={onShowList}
            >
              <PanelLeftOpen />
            </Button>
          ) : undefined
        }
      />
      {active ? (
        <TemplatePane key={active.id} tab={active} />
      ) : (
        <EmptyState />
      )}
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(o) => !o && blocker.reset?.()}
        title="Discard unsaved changes?"
        description="You have unsaved template changes. Leave this page anyway?"
        confirmText="Discard"
        onConfirm={() => {
          discardDirty();
          blocker.proceed?.();
        }}
      />
      <ConfirmDialog
        open={!!closing}
        onOpenChange={(o) => !o && setClosing(null)}
        title="Discard unsaved changes?"
        description={`${closing?.name ?? 'This template'} has changes that are not saved.`}
        confirmText="Discard"
        onConfirm={() => closing && close(closing.id)}
      />
    </div>
  );
}

/** No open tab: every way to start a template, plus a drop target for YAML files. */
function EmptyState() {
  const { hasPermission } = usePermission();
  const { openNew } = useTemplateTabs();
  const { isMobile, setOpenMobile } = useSidebar();
  const { upload, pick, input } = useTemplateUpload();
  const [dragging, setDragging] = useState(false);
  const canWrite = hasPermission('artifact.write');
  const tile = 'h-auto min-w-28 flex-col gap-1.5 py-3';

  return (
    <div
      className={cn(
        'm-3 flex flex-1 flex-col items-center justify-center gap-4 rounded-md text-sm text-muted-foreground',
        dragging && 'border-2 border-dashed border-primary bg-primary/5',
      )}
      onDragOver={(e) => {
        if (!canWrite || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!canWrite) return;
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <p className="font-medium text-foreground">
        {canWrite ? 'Start a template' : 'Select a template to view it'}
      </p>
      {canWrite && (
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" className={tile} onClick={openNew}>
            <FilePlus className="size-5" />
            Blank
          </Button>
          <AiGenButton className={tile}>
            <Sparkles className="size-5" />
            AI gen
          </AiGenButton>
          <Button variant="outline" className={tile} onClick={pick}>
            <Upload className="size-5" />
            Upload YAML
          </Button>
          {input}
        </div>
      )}
      {canWrite && <p className="text-xs">Or drop .yaml files here</p>}
      {isMobile && (
        <Button size="sm" variant="outline" onClick={() => setOpenMobile(true)}>
          Browse templates
        </Button>
      )}
    </div>
  );
}
