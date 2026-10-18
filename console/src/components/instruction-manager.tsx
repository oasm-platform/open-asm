import { Button } from '@/components/ui/button';
import { SettingsHeaderActions } from '@/components/settings-header-actions';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  getAgentsControllerGetAgentConfigQueryKey,
  useAgentsControllerGetAgentConfig,
  useAgentsControllerUpsertAgentConfig,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/** AGENT_INSTRUCTION_MAX_LENGTH on the API */
const MAX_LENGTH = 20_000;

export function InstructionManager() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const queryClient = useQueryClient();

  const {
    data: config,
    isLoading,
    isError,
    refetch,
  } = useAgentsControllerGetAgentConfig({
    query: { enabled: !!selectedWorkspaceId },
  });
  const upsert = useAgentsControllerUpsertAgentConfig();

  // null until edited, so the saved value shows once it loads
  const [draft, setDraft] = useState<string | null>(null);
  const saved = config?.instruction ?? '';
  const value = draft ?? saved;
  // The API trims before saving, so whitespace alone is no change
  const dirty = draft !== null && draft.trim() !== saved;

  const save = () => {
    upsert.mutate(
      { data: { instruction: value.trim() || null } },
      {
        onSuccess: (next) => {
          queryClient.setQueryData(
            getAgentsControllerGetAgentConfigQueryKey(),
            next,
          );
          setDraft(null);
          toast.success('Instruction saved');
        },
        onError: () => toast.error('Failed to save instruction'),
      },
    );
  };

  if (!selectedWorkspaceId) return null;

  if (isLoading) {
    return <div className="h-64 rounded-lg border animate-pulse bg-muted/30" />;
  }

  if (isError || !config) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Failed to load the instruction.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => void refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        aria-label="Instruction"
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={MAX_LENGTH}
        disabled={upsert.isPending}
        placeholder={
          'e.g.\n- Prefer passive recon before active scans.\n- Report findings in a table with severity and affected asset.\n- Keep answers short.'
        }
        className="min-h-64 max-h-[60vh] font-mono"
      />
      <p className="text-xs text-muted-foreground">
        Added to the agent&apos;s system prompt in every conversation ·{' '}
        {value.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
      </p>
      <SettingsHeaderActions>
        {dirty && (
          <Button
            size="sm"
            variant="outline"
            disabled={upsert.isPending}
            onClick={() => setDraft(null)}
          >
            Discard
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || upsert.isPending}
          onClick={save}
        >
          {upsert.isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </SettingsHeaderActions>
    </div>
  );
}
