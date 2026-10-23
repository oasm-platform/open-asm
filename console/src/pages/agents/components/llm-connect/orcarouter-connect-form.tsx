import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  useAgentsControllerCancelOrcaRouterConnect,
  useAgentsControllerCompleteOrcaRouterConnect,
  useAgentsControllerStartOrcaRouterConnect,
  type LLMConfigWithProviderDto,
} from '@/services/apis/gen/queries';
import type { AxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectForm } from './connect-form';
import type { ConnectFormData } from './schema';

type AuthMethod = 'api_key' | 'pkce';

interface ConnectAttempt {
  attemptId: string;
  authorizeUrl: string;
  expiresAt: string;
}

const errorMessage = (err: unknown): string => {
  const raw = (err as AxiosError<{ message: string | string[] }>).response?.data
    ?.message;
  if (Array.isArray(raw)) return raw.join(', ');
  return raw ?? 'OrcaRouter could not be connected. Please try again.';
};

/**
 * Shows both credential choices for the provider: paste an existing
 * `sk-orca-…` key, or authorize the account with OAuth 2.0 + PKCE. Both
 * produce the same durable key and the same stored configuration.
 */
export function OrcaRouterConnectForm({
  provider,
  onSubmit,
  onCancel,
  isSubmitting,
  onConnected,
}: {
  provider: LLMConfigWithProviderDto;
  onSubmit: (data: ConnectFormData, providerId: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  onConnected: () => void;
}) {
  const [method, setMethod] = useState<AuthMethod>('api_key');
  const [attempt, setAttempt] = useState<ConnectAttempt | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Async responses must confirm they still belong to the current attempt.
  const generation = useRef(0);

  const start = useAgentsControllerStartOrcaRouterConnect();
  const complete = useAgentsControllerCompleteOrcaRouterConnect();
  const cancel = useAgentsControllerCancelOrcaRouterConnect();
  const cancelAttempt = cancel.mutate;

  const clearAttempt = useCallback(() => {
    generation.current += 1;
    setAttempt(null);
    setCode('');
    setBusy(false);
  }, []);

  // Any terminal path (switch, cancel, pagehide, unmount) releases the
  // server-side record; failures there must never leave the dialog stuck.
  const discard = useCallback(
    (attemptId: string) => cancelAttempt({ attemptId }),
    [cancelAttempt],
  );

  useEffect(() => {
    if (method === 'api_key' && attempt) {
      discard(attempt.attemptId);
      clearAttempt();
    }
  }, [method, attempt, discard, clearAttempt]);

  const activeAttemptId = attempt?.attemptId ?? null;

  // Back-forward cache: `pagehide` clears the hint synchronously and bumps the
  // generation, so the pending request cannot restore stale state without a
  // remount. A late `start` result is released instead of being orphaned.
  useEffect(() => {
    const handlePageHide = () => {
      generation.current += 1;
      setBusy(false);
      setAttempt(null);
      setCode('');
      setError(null);
      if (activeAttemptId) discard(activeAttemptId);
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [activeAttemptId, discard]);

  // Closing the dialog, unmounting or replacing the attempt releases it.
  useEffect(
    () => () => {
      if (activeAttemptId) cancelAttempt({ attemptId: activeAttemptId });
    },
    [activeAttemptId, cancelAttempt],
  );

  const handleStart = useCallback(async () => {
    const gen = generation.current + 1;
    generation.current = gen;
    setBusy(true);
    setError(null);
    try {
      const result = await start.mutateAsync();
      if (gen !== generation.current) {
        discard(result.attemptId);
        return;
      }
      setAttempt({ ...result, expiresAt: String(result.expiresAt) });
      setBusy(false);
      window.open(result.authorizeUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      if (gen !== generation.current) return;
      setBusy(false);
      setError(errorMessage(err));
    }
  }, [start, discard]);

  const handleComplete = useCallback(async () => {
    if (!attempt) return;
    const gen = generation.current;
    setBusy(true);
    setError(null);
    try {
      await complete.mutateAsync({
        data: { attemptId: attempt.attemptId, code },
      });
      if (gen !== generation.current) return;
      clearAttempt();
      onConnected();
    } catch (err) {
      if (gen !== generation.current) return;
      setBusy(false);
      setError(errorMessage(err));
    }
  }, [attempt, code, complete, clearAttempt, onConnected]);

  const tab = (value: AuthMethod, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={method === value}
      onClick={() => setMethod(value)}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm',
        method === value
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1"
        role="tablist"
        aria-label="OrcaRouter authentication method"
      >
        {tab('api_key', 'API Key')}
        {tab('pkce', 'Connect with OrcaRouter')}
      </div>

      {method === 'api_key' ? (
        <ConnectForm
          provider={provider}
          onSubmit={onSubmit}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Authorize in your browser, then paste the code shown on the
            OrcaRouter consent screen. The key is issued to your own account and
            can be revoked there at any time.
          </p>

          {!attempt ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void handleStart()}
              disabled={busy}
            >
              {busy ? 'Starting…' : 'Connect with OrcaRouter'}
            </Button>
          ) : (
            <>
              <a
                className="text-xs text-primary underline break-all"
                href={attempt.authorizeUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {attempt.authorizeUrl}
              </a>
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="orcarouter-auth-code"
                >
                  Authorization code
                </label>
                <Input
                  id="orcarouter-auth-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  autoComplete="one-time-code"
                  placeholder="Code from the consent screen"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleComplete()}
                  disabled={busy || code.trim().length === 0}
                >
                  {busy ? 'Finishing…' : 'Finish connection'}
                </Button>
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
