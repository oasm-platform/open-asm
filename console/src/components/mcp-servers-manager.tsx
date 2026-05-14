import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import type {
  MCPServerConfigDto,
  MCPServerResponseDto,
} from '@/services/apis/gen/queries';
import {
  agentsControllerPingMCPServer,
  useAgentsControllerDeleteMCPServer,
  useAgentsControllerGetMCPConfig,
  useAgentsControllerToggleMCPServer,
  useAgentsControllerUpsertMCPServer,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Terminal,
  Trash2,
  Wifi,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { cn } from '@/lib/utils';

const MCP_QUERY_KEY = '/api/agents/mcp-configs';

type TransportType = 'sse' | 'stdio';
type MCPServerStatus = 'checking' | 'online' | 'offline' | 'unknown';

const serverSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Server name is required')
      .regex(
        /^[a-z0-9-_]+$/i,
        'Only letters, numbers, hyphens and underscores',
      ),
    transport: z.enum(['sse', 'stdio']),
    url: z.string().optional(),
    command: z.string().optional(),
    args: z.string().optional(),
    apiKey: z.string().optional(),
    timeout: z.coerce.number().min(1),
  })
  .superRefine((data, ctx) => {
    if (data.transport === 'sse' && !data.url) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'URL is required for SSE transport',
      });
    }
    if (data.transport === 'stdio' && !data.command) {
      ctx.addIssue({
        code: 'custom',
        path: ['command'],
        message: 'Command is required for stdio transport',
      });
    }
  });

type ServerFormData = z.input<typeof serverSchema>;

function parseArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if ((char === '"' || char === "'") && (i === 0 || input[i - 1] !== '\\')) {
      if (inQuotes) {
        if (char === quoteChar) {
          inQuotes = false;
          quoteChar = '';
        } else {
          current += char;
        }
      } else {
        inQuotes = true;
        quoteChar = char;
      }
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) args.push(current);
  return args;
}

function detectTransport(server: MCPServerResponseDto): TransportType {
  return server.url ? 'sse' : 'stdio';
}

function StatusDot({ status }: { status: MCPServerStatus }) {
  if (status === 'checking') {
    return (
      <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />
    );
  }

  const configs: Record<
    Exclude<MCPServerStatus, 'checking'>,
    { bg: string; shadow: string; label: string; animate?: string }
  > = {
    online: {
      bg: 'bg-emerald-500',
      shadow: 'shadow-[0_0_8px_rgba(16,185,129,0.6)]',
      label: 'Online',
      animate: 'animate-pulse',
    },
    offline: {
      bg: 'bg-rose-500',
      shadow: 'shadow-[0_0_8px_rgba(244,63,94,0.4)]',
      label: 'Offline',
    },
    unknown: {
      bg: 'bg-slate-500/50',
      shadow: '',
      label: 'Status unknown (stdio)',
    },
  };

  const config = configs[status];

  return (
    <div className="relative flex items-center justify-center">
      {status === 'online' && (
        <span className="absolute inset-0 rounded-full bg-emerald-500/40 animate-ping" />
      )}
      <span
        title={config.label}
        className={cn(
          'relative block size-2 rounded-full shrink-0 transition-all duration-300',
          config.bg,
          config.shadow,
          config.animate,
        )}
      />
    </div>
  );
}

// ─── Add Server Form ─────────────────────────────────────────────────────────

function AddServerForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [transport, setTransport] = useState<TransportType>('sse');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ServerFormData>({
    resolver: zodResolver(serverSchema),
    defaultValues: { transport: 'sse', timeout: 60 },
  });

  const currentTransport = watch('transport');

  const upsert = useAgentsControllerUpsertMCPServer({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: [MCP_QUERY_KEY] });
        toast.success('MCP server added');
        onSuccess();
      },
      onError: () => toast.error('Failed to add MCP server'),
    },
  });

  const onSubmit = (data: ServerFormData) => {
    const config: MCPServerConfigDto = {
      timeout: data.timeout,
      disabled: false,
    };
    if (data.transport === 'sse') {
      config.url = data.url;
      if (data.apiKey?.trim())
        config.headers = { 'api-key': data.apiKey.trim() };
    } else {
      config.command = data.command;
      config.args = data.args ? parseArgs(data.args) : [];
    }
    upsert.mutate({ name: data.name, data: config });
  };

  const handleTransportChange = (t: TransportType) => {
    setTransport(t);
    setValue('transport', t);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="border rounded-xl p-5 bg-card/50 backdrop-blur-sm flex flex-col gap-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold tracking-tight">New MCP Server</p>
        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest bg-muted px-2 py-0.5 rounded-full">
          Configuration
        </span>
      </div>

      <div className="flex p-1 bg-muted/50 rounded-lg w-fit border border-border/50">
        {(['sse', 'stdio'] as TransportType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleTransportChange(t)}
            className={cn(
              'flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition-all duration-200',
              currentTransport === t
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
            )}
          >
            {t === 'sse' ? (
              <Wifi className={cn('size-3.5', currentTransport === t && 'text-blue-500')} />
            ) : (
              <Terminal className={cn('size-3.5', currentTransport === t && 'text-amber-500')} />
            )}
            {t === 'sse' ? 'SSE / HTTP' : 'stdio'}
          </button>
        ))}
      </div>

      <input type="hidden" {...register('transport')} value={transport} />

      <div className="grid gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Server Name</label>
          <Input
            {...register('name')}
            placeholder="e.g. filesystem-server"
            error={errors.name?.message}
            className="bg-background/50 h-10"
          />
        </div>

        {currentTransport === 'sse' && (
          <>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Endpoint URL</label>
              <Input
                {...register('url')}
                type="url"
                placeholder="https://mcp.example.com/sse"
                error={errors.url?.message}
                className="bg-background/50 h-10 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">API Key (Optional)</label>
              <Input
                {...register('apiKey')}
                type="password"
                placeholder="••••••••••••••••"
                autoComplete="new-password"
                className="bg-background/50 h-10"
              />
            </div>
          </>
        )}

        {currentTransport === 'stdio' && (
          <>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Command</label>
              <Input
                {...register('command')}
                placeholder="npx"
                error={errors.command?.message}
                className="bg-background/50 h-10 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Arguments</label>
              <Input
                {...register('args')}
                placeholder="-y @modelcontextprotocol/server-filesystem /path"
                className="bg-background/50 h-10 font-mono text-xs"
              />
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <div className="flex items-center gap-3">
          <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">
            Timeout
          </label>
          <div className="flex items-center gap-2">
            <Input
              {...register('timeout')}
              type="number"
              min={1}
              className="w-20 h-8 text-xs bg-background/50"
            />
            <span className="text-[10px] text-muted-foreground">seconds</span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="font-semibold h-8">
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={upsert.isPending} className="font-bold h-8">
            {upsert.isPending ? (
              <Loader2 className="size-3 animate-spin mr-2" />
            ) : (
              <Plus className="size-3 mr-2" />
            )}
            Add Server
          </Button>
        </div>
      </div>
    </form>
  );
}

// ─── Server Row ───────────────────────────────────────────────────────────────

function ServerRow({
  server,
  status,
  onPing,
}: {
  server: MCPServerResponseDto;
  status: MCPServerStatus;
  onPing: (name: string) => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const transport = detectTransport(server);

  const toggle = useAgentsControllerToggleMCPServer({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: [MCP_QUERY_KEY] });
        onPing(server.name);
      },
      onError: () => toast.error('Failed to toggle server'),
    },
  });

  const remove = useAgentsControllerDeleteMCPServer({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: [MCP_QUERY_KEY] });
        toast.success('Server removed');
      },
      onError: () => toast.error('Failed to remove server'),
    },
  });

  const handleToggle = useCallback(
    (checked: boolean) =>
      toggle.mutate({ name: server.name, data: { disabled: !checked } }),
    [toggle, server.name],
  );

  const handleDelete = useCallback(() => {
    remove.mutate({ name: server.name });
  }, [remove, server.name]);

  return (
    <div className="group relative rounded-xl border bg-card transition-all duration-200 hover:shadow-md hover:border-border/80 overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        {/* Status & Icon container */}
        <div className={cn(
          "relative flex items-center justify-center size-10 rounded-xl shrink-0 transition-all duration-300",
          "bg-primary/10 text-primary dark:bg-primary/5 dark:text-primary group-hover:bg-primary/20 dark:group-hover:bg-primary/10"
        )}>
          <Server className="size-5" />
          <div className="absolute -top-1 -right-1 bg-card rounded-full p-0.5">
            <StatusDot status={server.disabled ? 'offline' : status} />
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold tracking-tight truncate">{server.name}</p>
            {server.disabled && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
                Disabled
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-muted-foreground/60 truncate selection:bg-primary/10">
            {transport === 'sse'
              ? server.url
              : `${server.command ?? ''} ${(server.args ?? []).join(' ')}`}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPing(server.name)}
            disabled={status === 'checking' || server.disabled}
            className="text-muted-foreground hover:text-foreground"
            title="Re-check status"
          >
            <RefreshCw className={cn("size-3.5", status === 'checking' && "animate-spin")} />
          </Button>

          <div className="px-2 h-8 flex items-center">
            <Switch
              checked={!server.disabled}
              onCheckedChange={handleToggle}
              disabled={toggle.isPending}
              className="scale-90"
            />
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setExpanded((v) => !v)}
            className={cn("text-muted-foreground", expanded && "bg-accent text-accent-foreground")}
          >
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>

          <ConfirmDialog
            title="Remove MCP Server"
            description={`Are you sure you want to remove the server "${server.name}"? This action cannot be undone.`}
            onConfirm={handleDelete}
            confirmText="Remove"
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={remove.isPending}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/5"
              >
                <Trash2 className="size-4" />
              </Button>
            }
          />
        </div>
      </div>

      {expanded && (
        <div className={cn(
          "border-t px-4 py-3 space-y-2 text-[11px] animate-in fade-in slide-in-from-top-1 duration-200",
          transport === 'sse' ? "bg-blue-500/[0.04] dark:bg-blue-500/[0.02]" : "bg-amber-500/[0.04] dark:bg-amber-500/[0.02]"
        )}>
          {server.url && (
            <div className="flex gap-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase w-20 shrink-0">URL</span>
              <span className="truncate font-mono text-muted-foreground/90 selection:bg-primary/20">{server.url}</span>
            </div>
          )}
          {server.command && (
            <div className="flex gap-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase w-20 shrink-0">
                Command
              </span>
              <span className="font-mono text-muted-foreground/90 selection:bg-primary/20">
                {server.command} {(server.args ?? []).join(' ')}
              </span>
            </div>
          )}
          {server.headers && Object.keys(server.headers).length > 0 && (
            <div className="flex gap-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase w-20 shrink-0">
                Headers
              </span>
              <span className="font-mono text-muted-foreground/90">
                {Object.keys(server.headers).join(', ')}
              </span>
            </div>
          )}
          {Array.isArray(server.allowed_tools) &&
            server.allowed_tools.length > 0 && (
              <div className="flex gap-4">
                <span className="text-[10px] font-bold text-muted-foreground uppercase w-20 shrink-0">
                  Tools
                </span>
                <span className="flex flex-wrap gap-1">
                  {(server.allowed_tools as unknown as string[]).map(t => (
                    <span key={t} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">{t}</span>
                  ))}
                </span>
              </div>
            )}
          <div className="flex gap-4">
            <span className="text-[10px] font-bold text-muted-foreground uppercase w-20 shrink-0">Timeout</span>
            <span className="text-muted-foreground/90 font-semibold">{server.timeout ?? 60}s</span>
          </div>
          <div className="flex gap-4">
            <span className="text-[10px] font-bold text-muted-foreground uppercase w-20 shrink-0">Status</span>
            <span
              className={cn(
                "font-bold uppercase tracking-wider text-[10px]",
                server.disabled
                  ? 'text-muted-foreground'
                  : status === 'online'
                    ? 'text-emerald-500'
                    : status === 'offline'
                      ? 'text-rose-500'
                      : 'text-slate-500'
              )}
            >
              {server.disabled
                ? 'Disabled'
                : status === 'online'
                  ? 'Online • Reachable'
                  : status === 'offline'
                    ? 'Offline • Unreachable'
                    : status === 'checking'
                      ? 'Checking…'
                      : 'Active • Protocol Status Unknown'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function MCPServersManager() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const [showAddForm, setShowAddForm] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, MCPServerStatus>>({});
  const pingInFlight = useRef<Set<string>>(new Set());
  // Always hold latest pingServer reference to avoid stale closure in useEffect
  const pingServerRef = useRef<(name: string) => Promise<void>>(() =>
    Promise.resolve(),
  );

  const { data, isLoading } = useAgentsControllerGetMCPConfig({
    query: {
      queryKey: [MCP_QUERY_KEY],
      enabled: !!selectedWorkspaceId,
    },
  });

  const servers = data?.servers ?? [];

  const pingServer = useCallback(async (name: string) => {
    if (pingInFlight.current.has(name)) return;
    pingInFlight.current.add(name);
    setStatuses((prev) => ({ ...prev, [name]: 'checking' }));
    try {
      const result = await agentsControllerPingMCPServer(name);
      setStatuses((prev) => ({
        ...prev,
        [name]: (result.status as MCPServerStatus) ?? 'unknown',
      }));
    } catch {
      setStatuses((prev) => ({ ...prev, [name]: 'offline' }));
    } finally {
      pingInFlight.current.delete(name);
    }
  }, []);

  // Keep ref up-to-date with the latest callback
  pingServerRef.current = pingServer;

  // Auto-ping all enabled SSE servers when server list changes
  useEffect(() => {
    if (!servers.length) return;
    for (const server of servers) {
      if (!server.disabled && server.url) {
        void pingServerRef.current(server.name);
      } else if (!server.url) {
        setStatuses((prev) => ({ ...prev, [server.name]: 'unknown' }));
      }
    }
    // pingServerRef is a ref — always current, safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!selectedWorkspaceId) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {servers.length === 0
            ? 'No MCP servers configured'
            : `${servers.length} server${servers.length !== 1 ? 's' : ''}`}
        </p>
        {!showAddForm && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddForm(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            Add Server
          </Button>
        )}
      </div>

      {showAddForm && (
        <AddServerForm
          onSuccess={() => setShowAddForm(false)}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-16 rounded-lg border animate-pulse bg-muted/30"
            />
          ))}
        </div>
      ) : servers.length === 0 && !showAddForm ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Server className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Add MCP servers to extend the agent with external tools
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {servers.map((server) => (
            <ServerRow
              key={server.name}
              server={server}
              status={
                statuses[server.name] ??
                (server.disabled ? 'offline' : 'checking')
              }
              onPing={pingServer}
            />
          ))}
        </div>
      )}
    </div>
  );
}
