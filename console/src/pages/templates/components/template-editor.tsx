import { yaml } from '@codemirror/lang-yaml';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import CodeMirror from '@uiw/react-codemirror';
import { AxiosError } from 'axios';
import * as prettierYaml from 'prettier/plugins/yaml';
import * as prettier from 'prettier/standalone';
import { useEffect, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/usePermission';
import { handleServerError } from '@/lib/handle-server-error';
import {
  getTemplatesControllerGetManyQueryKey,
  useTemplatesControllerCreate,
  useTemplatesControllerGetContent,
  useTemplatesControllerSaveContent,
} from '@/services/apis/gen/queries';
import { useTemplateTabs, type TemplateTab } from '../hooks/use-template-tabs';
import { TemplateTabs } from './template-tabs';

function TemplatePane({ tab }: { tab: TemplateTab }) {
  const { hasPermission } = usePermission();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { update, markSaved } = useTemplateTabs();
  const saveContent = useTemplatesControllerSaveContent();
  const create = useTemplatesControllerCreate();
  const [saving, setSaving] = useState(false);
  const [yamlError, setYamlError] = useState<string | null>(null);

  const { data, isLoading } = useTemplatesControllerGetContent(
    tab.artifactId ?? '',
    { query: { enabled: !!tab.artifactId } },
  );

  // open() adds a blank tab; fill it once, unless the user already typed.
  useEffect(() => {
    if (data && !tab.content && !tab.savedContent) {
      markSaved(tab.id, data.artifact, data.content);
    }
  }, [data, tab.id, tab.content, tab.savedContent, markSaved]);

  const loading = !!tab.artifactId && isLoading && !tab.content;
  const readOnly = tab.readOnly || !hasPermission('artifact.write');
  const dirty = tab.content !== tab.savedContent;
  const canSave = dirty && !readOnly && !saving && !loading;

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
        : await create.mutateAsync({ data: { name: tab.name, content } });
      markSaved(tab.id, artifact, content);
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
      : dirty
        ? 'Unsaved changes'
        : 'Saved';

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span className="truncate">{status}</span>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void format()}
            disabled={readOnly || loading}
          >
            Format
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!canSave}>
            Save
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
      {loading ? (
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
            theme={tokyoNight}
            extensions={[yaml()]}
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
  const { tabs, activeId, activate, close } = useTemplateTabs();
  const [closing, setClosing] = useState<TemplateTab | null>(null);
  const active = tabs.find((t) => t.id === activeId);
  const anyDirty = tabs.some((t) => t.content !== t.savedContent);

  useEffect(() => {
    if (!anyDirty) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [anyDirty]);

  const requestClose = (tab: TemplateTab) =>
    tab.content !== tab.savedContent ? setClosing(tab) : close(tab.id);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <TemplateTabs
        tabs={tabs}
        activeId={activeId}
        onSelect={activate}
        onClose={requestClose}
      />
      {active ? (
        <TemplatePane key={active.id} tab={active} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Select a template or create a new one
        </div>
      )}
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
