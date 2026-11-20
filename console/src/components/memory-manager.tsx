import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingsHeaderActions } from '@/components/settings-header-actions';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  getAgentsControllerGetAgentConfigQueryKey,
  useAgentsControllerDeleteWorkspaceMemory,
  useAgentsControllerGetAgentConfig,
  useAgentsControllerGetWorkspaceMemory,
  useAgentsControllerUpsertAgentConfig,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { BrainCircuit, ChevronDown, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n-dictionary';

const PREVIEW_LINES = 3;

function MemoryItem({
  memory,
  onDelete,
  disabled,
}: {
  memory: { id: string; content: string; updatedAt: string };
  onDelete: (id: string) => void;
  /** Memory is off: shown as saved, nothing to click */
  disabled: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const lines = memory.content.split('\n');
  const isLong = lines.length > PREVIEW_LINES;

  return (
    <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-4">
      <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
        {expanded ? memory.content : lines.slice(0, PREVIEW_LINES).join('\n')}
      </pre>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {isLong && (
            <button
              onClick={() => setExpanded((prev) => !prev)}
              disabled={disabled}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:pointer-events-none"
            >
              <ChevronDown
                className={cn(
                  'size-3 transition-transform',
                  expanded && 'rotate-180',
                )}
              />
              {expanded
                ? t('agents.approval.showLess')
                : t('agents.memory.showMore')}
            </button>
          )}
          <p className="text-[10px] text-muted-foreground/60">
            {new Date(memory.updatedAt).toLocaleString()}
          </p>
        </div>
        <ConfirmDialog
          title={t('agents.memory.deleteTitle')}
          description={t('agents.memory.deleteDescription')}
          onConfirm={() => onDelete(memory.id)}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('agents.memory.deleteTitle')}
              disabled={disabled}
              className="size-7 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          }
          confirmText={t('common.delete')}
        />
      </div>
    </div>
  );
}

export function MemoryManager() {
  const t = useT();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const queryClient = useQueryClient();

  const { data: config, isLoading: isConfigLoading } =
    useAgentsControllerGetAgentConfig({
      query: { enabled: !!selectedWorkspaceId },
    });
  const upsert = useAgentsControllerUpsertAgentConfig();
  const memoryEnabled = config?.memoryEnabled ?? false;

  // Only the setting changes: saved memories stay until deleted
  const handleToggleMemory = (next: boolean) => {
    upsert.mutate(
      { data: { memoryEnabled: next } },
      {
        onSuccess: (saved) => {
          queryClient.setQueryData(
            getAgentsControllerGetAgentConfigQueryKey(),
            saved,
          );
          toast.success(
            next
              ? t('agents.memory.turnedOn')
              : t('agents.memory.turnedOff'),
          );
        },
        onError: () => toast.error(t('agents.memory.updateFailed')),
      },
    );
  };

  const { data, isLoading, refetch } = useAgentsControllerGetWorkspaceMemory(
    undefined,
    {
      query: {
        enabled: !!selectedWorkspaceId,
      },
    },
  );

  const deleteMutation = useAgentsControllerDeleteWorkspaceMemory({
    mutation: {
      onSuccess: () => {
        void refetch();
      },
    },
  });

  const memories = data?.data ?? [];

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate({ id });
    },
    [deleteMutation],
  );

  if (!selectedWorkspaceId) return null;

  return (
    <div className="flex flex-col gap-4">
      <SettingsHeaderActions>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="memory-enabled"
            className="text-xs text-muted-foreground"
          >
            {memoryEnabled ? t('agents.memory.on') : t('agents.webSearch.off')}
          </Label>
          <Switch
            id="memory-enabled"
            aria-label={t('agents.memory.label')}
            checked={memoryEnabled}
            onCheckedChange={handleToggleMemory}
            disabled={!config || upsert.isPending}
          />
        </div>
      </SettingsHeaderActions>

      {isLoading || isConfigLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-24 rounded-lg border animate-pulse bg-muted/30"
            />
          ))}
        </div>
      ) : (
        <>
          {!memoryEnabled && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-xl border border-dashed p-4"
            >
              <BrainCircuit className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t('agents.memory.offTitle')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {memories.length > 0
                    ? t('agents.memory.offWithItems')
                    : t('agents.memory.offEmpty')}
                </p>
              </div>
            </div>
          )}

          {memories.length > 0 ? (
            <div
              aria-disabled={!memoryEnabled}
              className={cn(
                'flex flex-col gap-2',
                !memoryEnabled && 'opacity-60',
              )}
            >
              {memories.map((memory) => (
                <MemoryItem
                  key={memory.id}
                  memory={memory}
                  onDelete={handleDelete}
                  disabled={!memoryEnabled}
                />
              ))}
            </div>
          ) : (
            memoryEnabled && (
              <div className="rounded-xl border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {t('agents.memory.empty')}
                </p>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
