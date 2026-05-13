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

function detectTransport(server: MCPServerResponseDto): TransportType {
  return server.url ? 'sse' : 'stdio';
}

function StatusDot({ status }: { status: MCPServerStatus }) {
  if (status === 'checking') {
    return (
      <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />
    );
  }
  const cls: Record<Exclude<MCPServerStatus, 'checking'>, string> = {
    online: 'bg-green-500 shadow-[0_0_6px_1px] shadow-green-500/60',
    offline: 'bg-red-500 shadow-[0_0_6px_1px] shadow-red-500/50',
    unknown: 'bg-muted-foreground/40',
  };
  const titles: Record<Exclude<MCPServerStatus, 'checking'>, string> = {
    online: 'Online',
    offline: 'Offline',
    unknown: 'Status unknown (stdio)',
  };
  return (
    <span
      title={titles[status]}
      className={`block size-2 rounded-full shrink-0 ${cls[status]}`}
    />
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
      config.args = data.args ? data.args.split(' ').filter(Boolean) : [];
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
      className="border rounded-lg p-4 bg-muted/20 flex flex-col gap-3"
    >
      <p className="text-sm font-medium">New MCP Server</p>

      <div className="flex gap-2">
        {(['sse', 'stdio'] as TransportType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleTransportChange(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
              currentTransport === t
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'
            }`}
          >
            {t === 'sse' ? (
              <Wifi className="size-3.5" />
            ) : (
              <Terminal className="size-3.5" />
            )}
            {t === 'sse' ? 'SSE / HTTP' : 'stdio'}
          </button>
        ))}
      </div>

      <input type="hidden" {...register('transport')} value={transport} />

      <Input
        {...register('name')}
        placeholder="server-name"
        error={errors.name?.message}
      />

      {currentTransport === 'sse' && (
        <>
          <Input
            {...register('url')}
            type="url"
            placeholder="https://mcp.example.com/sse"
            error={errors.url?.message}
          />
          <Input
            {...register('apiKey')}
            type="password"
            placeholder="API key (optional)"
            autoComplete="new-password"
          />
        </>
      )}

      {currentTransport === 'stdio' && (
        <>
          <Input
            {...register('command')}
            placeholder="npx"
            error={errors.command?.message}
          />
          <Input
            {...register('args')}
            placeholder="Arguments (e.g. -y @modelcontextprotocol/server-filesystem /path)"
          />
        </>
      )}

      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground shrink-0">
          Timeout (s)
        </label>
        <Input
          {...register('timeout')}
          type="number"
          min={1}
          className="w-20"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={upsert.isPending}>
          {upsert.isPending ? 'Adding…' : 'Add Server'}
        </Button>
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
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        {/* Status dot */}
        <div className="flex items-center justify-center size-8 rounded-md bg-muted shrink-0 relative">
          {transport === 'sse' ? (
            <Wifi className="size-4 text-muted-foreground" />
          ) : (
            <Terminal className="size-4 text-muted-foreground" />
          )}
          <span className="absolute -top-0.5 -right-0.5">
            <StatusDot status={server.disabled ? 'offline' : status} />
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{server.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {transport === 'sse'
              ? server.url
              : `${server.command ?? ''} ${(server.args ?? []).join(' ')}`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Re-ping button */}
          <button
            type="button"
            onClick={() => onPing(server.name)}
            disabled={status === 'checking' || server.disabled}
            className="rounded-md p-1 hover:bg-accent transition-colors disabled:opacity-40"
            aria-label="Re-check status"
            title="Re-check status"
          >
            <RefreshCw className="size-3.5 text-muted-foreground" />
          </button>

          <Switch
            checked={!server.disabled}
            onCheckedChange={handleToggle}
            disabled={toggle.isPending}
          />

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md p-1 hover:bg-accent transition-colors"
            aria-label="Expand"
          >
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </button>

          <ConfirmDialog
            title="Remove MCP Server"
            description={`Are you sure you want to remove the server "${server.name}"? This action cannot be undone.`}
            onConfirm={handleDelete}
            confirmText="Remove"
            trigger={
              <button
                type="button"
                disabled={remove.isPending}
                className="rounded-md p-1 hover:bg-destructive/10 text-destructive transition-colors disabled:opacity-50"
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
              </button>
            }
          />
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/30 px-3 py-2 space-y-1 text-xs">
          {server.url && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">URL</span>
              <span className="truncate font-mono">{server.url}</span>
            </div>
          )}
          {server.command && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">
                Command
              </span>
              <span className="font-mono">
                {server.command} {(server.args ?? []).join(' ')}
              </span>
            </div>
          )}
          {server.headers && Object.keys(server.headers).length > 0 && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">
                Headers
              </span>
              <span className="font-mono">
                {Object.keys(server.headers).join(', ')}
              </span>
            </div>
          )}
          {Array.isArray(server.allowed_tools) &&
            server.allowed_tools.length > 0 && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0">
                  Tools
                </span>
                <span>
                  {(server.allowed_tools as unknown as string[]).join(', ')}
                </span>
              </div>
            )}
          <div className="flex gap-2">
            <span className="text-muted-foreground w-20 shrink-0">Timeout</span>
            <span>{server.timeout ?? 60}s</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-20 shrink-0">Status</span>
            <span
              className={
                server.disabled
                  ? 'text-muted-foreground'
                  : status === 'online'
                    ? 'text-green-500'
                    : status === 'offline'
                      ? 'text-red-500'
                      : 'text-muted-foreground'
              }
            >
              {server.disabled
                ? 'Disabled'
                : status === 'online'
                  ? 'Online'
                  : status === 'offline'
                    ? 'Offline'
                    : status === 'checking'
                      ? 'Checking…'
                      : 'Unknown (stdio)'}
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
