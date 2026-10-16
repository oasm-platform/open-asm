import { Button } from '@/components/ui/button';
import { SettingsHeaderActions } from '@/components/settings-header-actions';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  AgentSearchProviderInputDtoProvider,
  getAgentsControllerGetAgentConfigQueryKey,
  useAgentsControllerGetAgentConfig,
  useAgentsControllerUpsertAgentConfig,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

type SearchProvider = AgentSearchProviderInputDtoProvider;

/** Radio value for "no provider": web search stays off. */
const OFF = 'off';
type Choice = SearchProvider | typeof OFF;

const OPTIONS: Array<{ value: Choice; label: string }> = [
  { value: OFF, label: 'Off' },
  { value: AgentSearchProviderInputDtoProvider.exa, label: 'Exa' },
  { value: AgentSearchProviderInputDtoProvider.firecrawl, label: 'Firecrawl' },
  { value: AgentSearchProviderInputDtoProvider.tinyfish, label: 'TinyFish' },
];

export function WebSearchManager() {
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

  // null until picked, so the saved provider shows once it loads
  const [picked, setPicked] = useState<Choice | null>(null);
  const [apiKey, setApiKey] = useState('');

  const savedProvider =
    config?.searchProviders.find((p) => p.isDefault) ??
    config?.searchProviders[0];
  const savedChoice: Choice = savedProvider?.provider ?? OFF;
  const choice = picked ?? savedChoice;
  const label = OPTIONS.find((o) => o.value === choice)?.label;

  // The API keeps the saved key of a provider sent without one
  const hasSavedKey = choice !== OFF && choice === savedProvider?.provider;
  const key = apiKey.trim();
  const dirty = choice !== savedChoice || key !== '';
  const canSave =
    dirty && (choice === OFF || hasSavedKey || key !== '') && !upsert.isPending;

  const reset = () => {
    setPicked(null);
    setApiKey('');
  };

  const save = () => {
    upsert.mutate(
      {
        data: {
          // One provider at most: an empty list turns web search off
          searchProviders:
            choice === OFF
              ? []
              : [{ provider: choice, apiKey: key || undefined, isDefault: true }],
        },
      },
      {
        onSuccess: (next) => {
          queryClient.setQueryData(
            getAgentsControllerGetAgentConfigQueryKey(),
            next,
          );
          reset();
          toast.success(
            choice === OFF ? 'Web search turned off' : 'Web search updated',
          );
        },
        onError: () => toast.error('Failed to update web search'),
      },
    );
  };

  if (!selectedWorkspaceId) return null;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {OPTIONS.map((o) => (
          <div
            key={o.value}
            className="h-12 rounded-lg border animate-pulse bg-muted/30"
          />
        ))}
      </div>
    );
  }

  if (isError || !config) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Failed to load web search settings.
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
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Pick the provider the agent searches the web with. With no provider,
        web search is off.
      </p>

      <RadioGroup
        aria-label="Search provider"
        value={choice}
        disabled={upsert.isPending}
        onValueChange={(value) => {
          setPicked(value as Choice);
          setApiKey('');
        }}
        className="gap-2"
      >
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            htmlFor={`web-search-${option.value}`}
            className="flex cursor-pointer items-center gap-3 rounded-xl border bg-card/50 px-4 py-3 transition-colors hover:bg-accent/40 has-[[data-state=checked]]:border-primary/60"
          >
            <RadioGroupItem
              id={`web-search-${option.value}`}
              value={option.value}
            />
            <span className="text-sm font-medium">{option.label}</span>
            {option.value === savedChoice && (
              <span className="ml-auto text-xs text-muted-foreground">
                {option.value === OFF ? 'Current' : 'In use'}
              </span>
            )}
          </label>
        ))}
      </RadioGroup>

      {choice !== OFF && (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="web-search-api-key"
            className="text-sm font-medium text-foreground"
          >
            {label} API Key{' '}
            {!hasSavedKey && <span className="text-destructive">*</span>}
          </label>
          <Input
            id="web-search-api-key"
            type="password"
            autoComplete="new-password"
            value={apiKey}
            disabled={upsert.isPending}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasSavedKey ? savedProvider?.apiKeyMasked : ''}
          />
          <p className="text-xs text-muted-foreground">
            {hasSavedKey
              ? 'Leave blank to keep the saved key.'
              : 'Required. Your API key is stored securely and never shared.'}
          </p>
        </div>
      )}

      <SettingsHeaderActions>
        {dirty && (
          <Button
            size="sm"
            variant="outline"
            disabled={upsert.isPending}
            onClick={reset}
          >
            Discard
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!canSave}
          onClick={save}
        >
          {upsert.isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </SettingsHeaderActions>
    </div>
  );
}
