import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useAgentsControllerDeleteWorkspaceMemory,
  useAgentsControllerGetWorkspaceMemory,
} from '@/services/apis/gen/queries';
import { ChevronDown, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

const PREVIEW_LINES = 3;

function MemoryItem({
  memory,
  onDelete,
}: {
  memory: { id: string; content: string; updatedAt: string };
  onDelete: (id: string) => void;
}) {
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
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                className={cn(
                  'size-3 transition-transform',
                  expanded && 'rotate-180',
                )}
              />
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          <p className="text-[10px] text-muted-foreground/60">
            {new Date(memory.updatedAt).toLocaleString()}
          </p>
        </div>
        <ConfirmDialog
          title="Delete memory"
          description="Are you sure you want to delete this memory record? This action cannot be undone."
          onConfirm={() => onDelete(memory.id)}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          }
          confirmText="Delete"
        />
      </div>
    </div>
  );
}

export function MemoryManager() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const { data, isLoading, refetch, isFetching } =
    useAgentsControllerGetWorkspaceMemory(undefined, {
      query: {
        enabled: !!selectedWorkspaceId,
      },
    });

  const deleteMutation = useAgentsControllerDeleteWorkspaceMemory({
    mutation: {
      onSuccess: () => {
        void refetch();
      },
    },
  });

  const memories = data?.data ?? [];

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate({ id });
    },
    [deleteMutation],
  );

  if (!selectedWorkspaceId) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Long-term memory content used by the AI agent
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          className="gap-1.5"
        >
          {isFetching ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-24 rounded-lg border animate-pulse bg-muted/30"
            />
          ))}
        </div>
      ) : memories.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No memory content yet. The AI agent will automatically store
            important information here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {memories.map((memory) => (
            <MemoryItem
              key={memory.id}
              memory={memory}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
