import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { axiosInstance } from '@/services/apis/axios-client';
import { getIntegrationsControllerGetManyIntegrationsQueryKey } from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// ─── Types (mirror core-api aws-sso.dto.ts + DeviceAuthStart) ──────

interface AwsSsoDeviceResponse {
  clientId: string;
  clientSecret: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  interval: number;
  expiresIn: number;
}

interface AwsSsoAccount {
  accountId: string;
  accountName?: string;
  roles: string[];
}

type AwsSsoPollResponse =
  | { status: 'pending' }
  | { status: 'slow_down' }
  | {
      status: 'authorized';
      refreshToken?: string;
      accounts?: AwsSsoAccount[];
    };

type Phase = 'idle' | 'starting' | 'authorizing' | 'authorized' | 'expired';

const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const SLOW_DOWN_PENALTY_SECONDS = 5;
const DEFAULT_REGION = 'us-east-1';

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return '';
}

interface AwsSsoConnectProps {
  /** Integration name typed in the parent sheet. */
  name: string;
  /** `disabled` or a 5-field cron; forwarded to the complete endpoint. */
  syncSchedule: string;
  /** Called after the integration is created (parent closes the sheet). */
  onConnected?: () => void;
}

/**
 * AWS IAM Identity Center (SSO) device-authorization flow.
 *
 * Three raw-axios calls (generated hooks do not exist until todo 18):
 *  device → poll (loop) → complete. Tokens (`clientId`/`clientSecret`/
 * `refreshToken`) live ONLY in component state — never in storage or the URL.
 */
export function AwsSsoConnect({
  name,
  syncSchedule,
  onConnected,
}: AwsSsoConnectProps) {
  const queryClient = useQueryClient();

  const [region, setRegion] = useState(DEFAULT_REGION);
  const [startUrl, setStartUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [device, setDevice] = useState<AwsSsoDeviceResponse | null>(null);
  const [accounts, setAccounts] = useState<AwsSsoAccount[]>([]);
  const [refreshToken, setRefreshToken] = useState<string>('');
  const [accountId, setAccountId] = useState('');
  const [roleName, setRoleName] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  // Poll cadence is mutable (slow_down adds 5s) so it lives in a ref.
  const intervalRef = useRef(DEFAULT_POLL_INTERVAL_SECONDS);

  // Poll until authorized / terminal error. The first poll runs immediately;
  // subsequent ones are scheduled at the current interval.
  useEffect(() => {
    if (phase !== 'authorizing' || !device) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const result = (await axiosInstance.post(
          '/api/integrations/aws/sso/poll',
          {
            region,
            clientId: device.clientId,
            clientSecret: device.clientSecret,
            deviceCode: device.deviceCode,
          },
        )) as unknown as AwsSsoPollResponse;
        if (cancelled) return;

        if (result.status === 'authorized') {
          setRefreshToken(result.refreshToken ?? '');
          setAccounts(result.accounts ?? []);
          setPhase('authorized');
          return;
        }
        if (result.status === 'slow_down') {
          intervalRef.current += SLOW_DOWN_PENALTY_SECONDS;
        }
        timer = setTimeout(poll, intervalRef.current * 1000);
      } catch (err) {
        if (cancelled) return;
        const message = errorMessage(err);
        setPhase('expired');
        toast.error(
          message ||
            'AWS SSO authorization expired — restart the connect flow',
        );
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [phase, device, region]);

  const resetToIdle = () => {
    setPhase('idle');
    setDevice(null);
    setAccounts([]);
    setRefreshToken('');
    setAccountId('');
    setRoleName('');
    intervalRef.current = DEFAULT_POLL_INTERVAL_SECONDS;
  };

  const handleStart = async () => {
    if (!region.trim() || !startUrl.trim()) {
      toast.error('Region and Start URL are required');
      return;
    }
    setIsStarting(true);
    try {
      const result = (await axiosInstance.post(
        '/api/integrations/aws/sso/device',
        { region: region.trim(), startUrl: startUrl.trim() },
      )) as unknown as AwsSsoDeviceResponse;
      intervalRef.current =
        result.interval > 0 ? result.interval : DEFAULT_POLL_INTERVAL_SECONDS;
      setDevice(result);
      setPhase('authorizing');
    } catch {
      toast.error('Failed to start AWS SSO authorization');
    } finally {
      setIsStarting(false);
    }
  };

  const handleConnect = async () => {
    if (!name.trim()) {
      toast.error('Integration name is required');
      return;
    }
    if (!device || !accountId || !roleName || !refreshToken) {
      toast.error('Select an account and role before connecting');
      return;
    }
    setIsCompleting(true);
    try {
      await axiosInstance.post('/api/integrations/aws/sso/complete', {
        name: name.trim(),
        region: region.trim(),
        startUrl: startUrl.trim(),
        accountId,
        roleName,
        clientId: device.clientId,
        clientSecret: device.clientSecret,
        refreshToken,
        syncSchedule: syncSchedule || 'disabled',
      });
      toast.success('AWS integration connected');
      queryClient.invalidateQueries({
        queryKey: getIntegrationsControllerGetManyIntegrationsQueryKey(),
      });
      onConnected?.();
    } catch {
      toast.error('Failed to connect AWS integration');
    } finally {
      setIsCompleting(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.accountId === accountId);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="aws-sso-region">
          Region <span className="text-destructive">*</span>
        </Label>
        <Input
          id="aws-sso-region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="us-east-1"
          disabled={phase === 'authorizing'}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="aws-sso-start-url">
          Start URL <span className="text-destructive">*</span>
        </Label>
        <Input
          id="aws-sso-start-url"
          value={startUrl}
          onChange={(e) => setStartUrl(e.target.value)}
          placeholder="https://my-sso-portal.awsapps.com/start"
          disabled={phase === 'authorizing'}
        />
      </div>

      {phase === 'idle' || phase === 'expired' ? (
        <div className="space-y-2 rounded-lg border p-3">
          {phase === 'expired' && (
            <p className="text-sm text-destructive">
              The device code expired before authorization. Restart to
              continue.
            </p>
          )}
          <Button
            type="button"
            onClick={() => {
              if (phase === 'expired') resetToIdle();
              void handleStart();
            }}
            disabled={isStarting}
            className="w-full gap-2"
          >
            {isStarting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            {phase === 'expired'
              ? 'Restart authorization'
              : 'Start authorization'}
          </Button>
        </div>
      ) : null}

      {phase === 'authorizing' && device && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Waiting for authorization…
          </div>
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Enter this code in the AWS access portal:
            </p>
            <code className="rounded-md bg-muted px-4 py-2 font-mono text-lg tracking-widest">
              {device.userCode}
            </code>
            {device.verificationUri && (
              <Button asChild variant="outline" className="gap-2">
                <a
                  href={device.verificationUriComplete || device.verificationUri}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-4" />
                  Open verification page
                </a>
              </Button>
            )}
          </div>
        </div>
      )}

      {phase === 'authorized' && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
            <ShieldCheck className="size-4" />
            Authorization complete
          </div>

          <div className="space-y-2">
            <Label htmlFor="aws-sso-account">Account ID</Label>
            <Select
              name="accountId"
              value={accountId || undefined}
              onValueChange={(val) => {
                setAccountId(val);
                setRoleName('');
              }}
            >
              <SelectTrigger
                id="aws-sso-account"
                aria-label="Account ID"
                className="w-full"
              >
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.accountId} value={account.accountId}>
                    {account.accountName
                      ? `${account.accountName} (${account.accountId})`
                      : account.accountId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="aws-sso-role">Role name</Label>
            <Select
              name="roleName"
              value={roleName || undefined}
              onValueChange={(val) => setRoleName(val)}
              disabled={!accountId}
            >
              <SelectTrigger
                id="aws-sso-role"
                aria-label="Role name"
                className="w-full"
              >
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {(selectedAccount?.roles ?? []).map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={resetToIdle}
            >
              <RefreshCw className="size-3.5" />
              Restart
            </Button>
            <Button
              type="button"
              className="flex-1 gap-2"
              onClick={() => void handleConnect()}
              disabled={isCompleting || !accountId || !roleName}
            >
              {isCompleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Connect
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
