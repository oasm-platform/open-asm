import { useBlocker, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { yamlSchema } from 'codemirror-json-schema/yaml';
import { AxiosError } from 'axios';
import * as prettierYaml from 'prettier/plugins/yaml';
import * as prettier from 'prettier/standalone';
import { useEffect, useMemo, useState } from 'react';
import { parse } from 'yaml';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/components/ui/theme-provider';
import { usePermission } from '@/hooks/usePermission';
import { handleServerError } from '@/lib/handle-server-error';
import {
  getTemplatesControllerGetContentQueryKey,
  getTemplatesControllerGetManyQueryKey,
  useTemplatesControllerCreate,
  useTemplatesControllerGetContent,
  useTemplatesControllerSaveContent,
} from '@/services/apis/gen/queries';
import {
  DEFAULT_TEMPLATE_NAME,
  useTemplateTabs,
  type TemplateTab,
} from '../hooks/use-template-tabs';
import { TemplateTabs } from './template-tabs';
import { nucleiSchema } from '../nuclei-schema';

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
  const { update, markSaved, load } = useTemplateTabs();
  const saveContent = useTemplatesControllerSaveContent({
    mutation: { onError: () => {} }, // errors are shown here, not by the global handler
  });
  const create = useTemplatesControllerCreate({
    mutation: { onError: () => {} },
  });
  const [saving, setSaving] = useState(false);
  const [yamlError, setYamlError] = useState<string | null>(null);

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
    setSaving(true);
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
      const status = error instanceof AxiosError && error.response?.status;
      const message: unknown = (error as AxiosError<{ message?: unknown }>)
        .response?.data?.message;
      if (status === 409) {
        toast.error(
          typeof message === 'string' ? message : 'Workspace storage is full',
          {
            action: {
              label: 'Manage files',
              onClick: () =>
                void navigate({ to: '/settings/$tab', params: { tab: 'files' } }),
            },
          },
        );
      } else if (status === 400 && typeof message === 'string') {
        setYamlError(message);
      } else if (status === 413) {
        toast.error('Template is too large (256 KB maximum)');
      } else {
        handleServerError(error);
      }
    } finally {
      setSaving(false);
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

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span className="truncate" aria-live="polite">
          {status}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void format()}
            disabled={readOnly || loading || loadFailed}
          >
            Format
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
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
          />
        </div>
      )}
    </div>
  );
}

export function TemplateEditor() {
  const { tabs, activeId, activate, close, openNew } = useTemplateTabs();
  const { hasPermission } = usePermission();
  const { isMobile, setOpenMobile } = useSidebar();
  const [closing, setClosing] = useState<TemplateTab | null>(null);
  const active = tabs.find((t) => t.id === activeId);
  const anyDirty = tabs.some((t) => t.content !== t.savedContent);

  const blocker = useBlocker({
    shouldBlockFn: () => anyDirty,
    enableBeforeUnload: () => anyDirty,
    withResolver: true,
  });

  const requestClose = (tab: TemplateTab) =>
    tab.content !== tab.savedContent ? setClosing(tab) : close(tab.id);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <TemplateTabs
        tabs={tabs}
        activeId={activeId}
        onSelect={activate}
        onClose={requestClose}
        leading={isMobile ? <SidebarTrigger className="m-1" aria-label="Browse templates" /> : undefined}
      />
      {active ? (
        <TemplatePane key={active.id} tab={active} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <p>Select a template or create a new one</p>
          <div className="flex gap-2">
            {hasPermission('artifact.write') && (
              <Button size="sm" onClick={openNew}>
                New template
              </Button>
            )}
            {isMobile && (
              <Button size="sm" variant="outline" onClick={() => setOpenMobile(true)}>
                Browse templates
              </Button>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(o) => !o && blocker.reset?.()}
        title="Discard unsaved changes?"
        description="You have unsaved template changes. Leave this page anyway?"
        confirmText="Discard"
        onConfirm={() => blocker.proceed?.()}
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
