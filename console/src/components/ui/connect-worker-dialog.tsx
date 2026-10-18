import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConnectWorkerState } from '@/hooks/useConnectWorkerState';
import { useLiveEvents } from '@/hooks/use-live-events';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  type WorkerJoinKeyResponseDto,
  workersControllerCreateJoinKey,
  workersControllerRevokeJoinKey,
  workersControllerRotateJoinKey,
} from '@/services/apis/gen/queries';
import { motion, useReducedMotion } from 'framer-motion';
import { Clock, Code } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { CodeBlock } from '@/components/common/code-block';

const workerTabs: {
  value: string;
  label: string;
  icon: ReactNode;
  env?: 'dev' | 'prod';
}[] = [
  {
    value: 'devmode',
    label: 'DevMode',
    icon: (
      <span className="flex size-5 items-center justify-center rounded-sm bg-white">
        <Code color="black" size={14} />
      </span>
    ),
    env: 'dev',
  },
  // { value: 'docker', label: 'Docker', icon: Package, env: 'prod' },
  {
    value: 'windows',
    label: 'Windows',
    icon: (
      <span className="flex size-5 items-center justify-center rounded-sm bg-white">
        <img src="/windows.svg" width={14} height={14} alt="" />
      </span>
    ),
    env: 'prod',
  },
  {
    value: 'linux',
    label: 'Linux',
    icon: (
      <span className="flex size-5 items-center justify-center rounded-sm bg-white">
        <img src="/linux.svg" width={14} height={14} alt="" />
      </span>
    ),
    env: 'prod',
  },
];

/** A one-time join key with its local expiry deadline (ms since epoch). */
interface JoinKey {
  id: string;
  apiKey: string;
  deadline: number;
}

// Counted from the response, not `expiresAt`, so client clock skew is moot.
const toJoinKey = (dto: WorkerJoinKeyResponseDto): JoinKey => ({
  id: dto.id,
  apiKey: dto.apiKey,
  deadline: Date.now() + dto.expiresInSeconds * 1000,
});

const revokeQuietly = (id: string) => {
  workersControllerRevokeJoinKey(id).catch(() => undefined);
};

const formatRemaining = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/** How long the success check shows before the dialog closes itself. */
const JOIN_SUCCESS_CLOSE_MS = 1600;

/**
 * The joined state, in the Telegram pairing style: a green check that pops
 * in, draws its tick and sends out one ripple.
 */
function JoinSuccess() {
  const reduceMotion = useReducedMotion();
  return (
    <div
      className="flex flex-col items-center gap-2 py-6"
      role="status"
      data-testid="worker-join-success"
    >
      <div className="relative flex size-24 items-center justify-center">
        {!reduceMotion && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-green-500/30"
            initial={{ scale: 0.8, opacity: 0.6 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.9, delay: 0.25, ease: 'easeOut' }}
          />
        )}
        <motion.div
          className="relative flex size-24 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30"
          initial={reduceMotion ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-12 text-green-600 dark:text-green-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <motion.path
              d="M20 6 9 17l-5-5"
              initial={reduceMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
            />
          </svg>
        </motion.div>
      </div>
      <motion.div
        className="flex flex-col items-center gap-1"
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.35 }}
      >
        <p className="mt-2 text-lg font-semibold text-green-600 dark:text-green-400">
          Connected!
        </p>
        <p className="text-sm text-muted-foreground">
          Your worker joined successfully.
        </p>
      </motion.div>
    </div>
  );
}

export function ConnectWorkerDialog() {
  const {
    state: { isOpen, networkId, onJoined },
    closeDialog,
  } = useConnectWorkerState();

  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const [joinKey, setJoinKey] = useState<JoinKey | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isRotating, setIsRotating] = useState(false);
  // A worker joined with this dialog's key: the success check replaces the
  // commands until the dialog closes itself.
  const [joined, setJoined] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `joinKey` for event handlers and cleanups.
  const joinKeyRef = useRef<JoinKey | null>(null);
  // Bumped by every request and by closing, so a late response for a key
  // nobody shows any more is revoked instead of displayed.
  const generationRef = useRef(0);
  // The expired key an auto-rotate already ran for, so a failed rotate is not
  // retried every tick.
  const autoRotatedIdRef = useRef<string | null>(null);

  const showKey = useCallback((key: JoinKey | null) => {
    joinKeyRef.current = key;
    setJoinKey(key);
    setNow(Date.now());
  }, []);

  /** Drops every in-flight response; returns the new generation. */
  const nextGeneration = useCallback(() => ++generationRef.current, []);

  // A key exists only while the dialog is open: issued on open, revoked on
  // close (or on a workspace switch, which issues one for the new workspace).
  useEffect(() => {
    if (!isOpen || !selectedWorkspaceId) return;

    const generation = nextGeneration();
    workersControllerCreateJoinKey()
      .then((dto) => {
        if (generation !== generationRef.current) {
          revokeQuietly(dto.id);
          return;
        }
        showKey(toJoinKey(dto));
      })
      .catch(() => {
        if (generation === generationRef.current) {
          toast.error('Failed to create worker API key');
        }
      });

    return () => {
      nextGeneration();
      const current = joinKeyRef.current;
      showKey(null);
      if (current) revokeQuietly(current.id);
    };
  }, [isOpen, selectedWorkspaceId, showKey, nextGeneration]);

  // Opening starts over from the commands. Done on open rather than on close
  // so the check does not flip back to the commands while the dialog fades.
  // Closing by hand drops a pending auto-close, so it cannot shut a dialog
  // reopened right after.
  useEffect(() => {
    if (isOpen) {
      setJoined(false);
    } else if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [isOpen]);

  // A pending auto-close dies with the component.
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const rotate = useCallback(async (): Promise<boolean> => {
    const current = joinKeyRef.current;
    const generation = nextGeneration();
    setIsRotating(true);
    try {
      const dto = current
        ? await workersControllerRotateJoinKey(current.id)
        : await workersControllerCreateJoinKey();
      if (generation !== generationRef.current) {
        revokeQuietly(dto.id);
        return false;
      }
      showKey(toJoinKey(dto));
      return true;
    } catch {
      if (generation === generationRef.current) {
        toast.error('Failed to rotate API key');
      }
      return false;
    } finally {
      setIsRotating(false);
    }
  }, [showKey, nextGeneration]);

  // Countdown tick.
  useEffect(() => {
    if (!joinKey) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [joinKey]);

  const remainingMs = joinKey ? joinKey.deadline - now : 0;
  const isExpired = !!joinKey && remainingMs <= 0;

  // An expired key is replaced right away so the commands stay usable.
  useEffect(() => {
    if (!joinKey || !isExpired || autoRotatedIdRef.current === joinKey.id) {
      return;
    }
    autoRotatedIdRef.current = joinKey.id;
    void rotate();
  }, [joinKey, isExpired, rotate]);

  // Only the worker that joined with THIS dialog's key closes it; another
  // member's key carries a different id. A machine that already ran a worker
  // of this workspace resumes it with the key, which arrives as `rejoined`.
  useLiveEvents(['worker.joined', 'worker.rejoined'], (event) => {
    const current = joinKeyRef.current;
    if (!current || event.joinKeyId !== current.id) return;
    // The join consumed the key: nothing left to revoke, and no countdown or
    // auto-rotate may issue another one.
    showKey(null);
    setJoined(true);
    toast.success('Worker connected successfully');
    // Right away: the caller waits for the worker to be ready meanwhile.
    if (event.resourceId) onJoined?.(event.resourceId);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      closeDialog();
    }, JOIN_SUCCESS_CLOSE_MS);
  });

  const apiKey = joinKey?.apiKey ?? '';
  const isApiKeyReady = !!apiKey && !isExpired;
  const grpcHost = window.location.hostname || 'localhost';
  const grpcFlagPowerShell = ` -GrpcHost "${grpcHost}"`;
  const grpcFlagBash = ` --grpc-host "${grpcHost}"`;
  const networkFlag = networkId ? ` network=${networkId}` : '';
  const networkFlagPowerShell = networkId ? ` -Network "${networkId}"` : '';
  const networkFlagBash = networkId ? ` --network "${networkId}"` : '';

  const getCommand = (value: string): string => {
    if (!isApiKeyReady) return 'Loading...';
    switch (value) {
      case 'devmode':
        return `task worker:dev replicas=1 maxJobs=10 apiKey=${apiKey}${networkFlag}`;
      case 'docker':
        return `docker run -d --name open-asm-worker -e WORKER_API_KEY=${apiKey} -e WORKER_GRPC_HOST=${grpcHost} -e WORKER_GRPC_PORT=16276 -e WORKER_MAX_CONCURRENCY=10 open-asm-worker:latest`;
      case 'windows':
        return `powershell irm https://oasm.dev/install.ps1 -OutFile "$env:TEMP\\install.ps1"; & "$env:TEMP\\install.ps1" -ApiKey "${apiKey}"${grpcFlagPowerShell}${networkFlagPowerShell} -Run`;
      case 'linux':
        return `curl -fsSL https://oasm.dev/install.sh | bash -s -- --api-key "${apiKey}"${grpcFlagBash}${networkFlagBash} --run`;
      default:
        return '';
    }
  };

  const handleRotate = async () => {
    if (await rotate()) {
      toast.success('API key rotated successfully');
    }
  };

  const isDev = import.meta.env.DEV;
  const visibleTabs = workerTabs.filter(
    (tab) => !tab.env || (tab.env === 'dev' ? isDev : !isDev),
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect worker</DialogTitle>
          <DialogDescription>
            Select your environment and copy the command to connect a worker:
          </DialogDescription>
        </DialogHeader>
        {joined ? (
          <JoinSuccess />
        ) : (
          <Tabs defaultValue={visibleTabs[0]?.value} className="space-y-4">
            <TabsList className="w-full">
              {visibleTabs.map(({ value, label, icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="flex-1 gap-1.5"
                >
                  {icon}
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            {visibleTabs.map(({ value }) => (
              <TabsContent key={value} value={value}>
                <CodeBlock language="terminal" value={getCommand(value)} />
              </TabsContent>
            ))}
          </Tabs>
        )}
        {joinKey && !joined && (
          <p
            className="flex items-center gap-1.5 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Clock size={14} />
            {isExpired ? (
              'API key expired, generating a new one…'
            ) : (
              <span>
                One-time API key, expires in{' '}
                <span className="font-mono tabular-nums">
                  {formatRemaining(remainingMs)}
                </span>
              </span>
            )}
          </p>
        )}
        <DialogFooter className="!flex-row !flex-nowrap justify-between items-center gap-2">
          {joined ? (
            <span />
          ) : (
            <Button
              variant="outline"
              type="button"
              onClick={handleRotate}
              disabled={isRotating || !selectedWorkspaceId}
            >
              Rotate API key
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="outline" type="button" onClick={closeDialog}>
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
