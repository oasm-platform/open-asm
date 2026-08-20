import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { useWorkspacesControllerGetWorkspaceApiKey } from '@/services/apis/gen/queries';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Terminal,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface McpClient {
  id: string;
  name: string;
  icon: string;
  iconAlt: string;
  configPath: string;
  /** Human-readable note about where the config file lives */
  configNote: string;
  /** Generate the MCP config JSON string for this client */
  generateConfig: (baseUrl: string, apiKey: string) => string;
}

// ---------------------------------------------------------------------------
// Client definitions
// ---------------------------------------------------------------------------

function baseConfig(baseUrl: string, apiKey: string) {
  return {
    'oasm-platform': {
      type: 'http' as const,
      url: `${baseUrl}/api/mcp`,
      headers: { 'x-oasm-api-key': apiKey },
    },
  };
}

const MCP_CLIENTS: McpClient[] = [
  {
    id: 'vscode',
    name: 'VS Code',
    icon: '/images/mcp/vscode.svg',
    iconAlt: 'VS Code',
    configPath: '.vscode/mcp.json',
    configNote: 'Workspace folder or user profile',
    generateConfig: (b, k) =>
      JSON.stringify({ servers: baseConfig(b, k) }, null, 2),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    icon: '/images/mcp/cursor.svg',
    iconAlt: 'Cursor',
    configPath: '.cursor/mcp.json',
    configNote: 'Project root or ~/.cursor/mcp.json',
    generateConfig: (b, k) =>
      JSON.stringify({ mcpServers: baseConfig(b, k) }, null, 2),
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    icon: '/images/mcp/claude.svg',
    iconAlt: 'Claude Code',
    configPath: '.mcp.json',
    configNote: 'Project root or ~/.claude.json',
    generateConfig: (b, k) =>
      JSON.stringify(
        {
          mcpServers: {
            'oasm-platform': {
              type: 'http',
              url: `${b}/api/mcp`,
              headers: { 'x-oasm-api-key': k },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    icon: '/images/mcp/claude.svg',
    iconAlt: 'Claude Desktop',
    configPath: 'claude_desktop_config.json',
    configNote: '~/Library/Application Support/Claude/ (macOS) or %APPDATA%\\Claude\\ (Windows)',
    generateConfig: (b, k) =>
      JSON.stringify(
        {
          mcpServers: {
            'oasm-platform': {
              command: 'npx',
              args: ['-y', 'mcp-remote', `${b}/api/mcp`, '--header', `x-oasm-api-key: ${k}`],
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    icon: '/images/mcp/windsurf.svg',
    iconAlt: 'Windsurf',
    configPath: 'mcp_config.json',
    configNote: '~/.codeium/windsurf/ (global only)',
    generateConfig: (b, k) =>
      JSON.stringify(
        {
          mcpServers: {
            'oasm-platform': {
              serverUrl: `${b}/api/mcp`,
              headers: { 'x-oasm-api-key': k },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    icon: '/images/mcp/copilot.svg',
    iconAlt: 'GitHub Copilot',
    configPath: '.github/mcp.json',
    configNote: 'Project root or ~/.copilot/mcp-config.json',
    generateConfig: (b, k) =>
      JSON.stringify(
        {
          mcpServers: {
            'oasm-platform': {
              type: 'http',
              url: `${b}/api/mcp`,
              headers: { 'x-oasm-api-key': k },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'kimi-code',
    name: 'Kimi Code',
    icon: '/images/mcp/kimi.svg',
    iconAlt: 'Kimi Code',
    configPath: '.kimi-code/mcp.json',
    configNote: 'Project root or ~/.kimi-code/mcp.json',
    generateConfig: (b, k) =>
      JSON.stringify({ mcpServers: baseConfig(b, k) }, null, 2),
  },
  {
    id: 'devin',
    name: 'Devin',
    icon: '/images/mcp/devin.svg',
    iconAlt: 'Devin',
    configPath: '.devin/mcp_config.json',
    configNote: 'Project root or ~/.config/devin/mcp_config.json',
    generateConfig: (b, k) =>
      JSON.stringify({ mcpServers: baseConfig(b, k) }, null, 2),
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    icon: '/images/mcp/gemini.svg',
    iconAlt: 'Gemini CLI',
    configPath: '.gemini/settings.json',
    configNote: 'Project root or ~/.gemini/settings.json',
    generateConfig: (b, k) =>
      JSON.stringify(
        {
          mcpServers: {
            'oasm-platform': {
              httpUrl: `${b}/api/mcp`,
              headers: { 'x-oasm-api-key': k },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    icon: '/images/mcp/opencode.svg',
    iconAlt: 'OpenCode',
    configPath: 'opencode.json',
    configNote: 'Project root or ~/.config/opencode/opencode.json',
    generateConfig: (b, k) =>
      JSON.stringify(
        {
          mcp: {
            'oasm-platform': {
              type: 'remote',
              url: `${b}/api/mcp`,
              headers: { 'x-oasm-api-key': k },
            },
          },
        },
        null,
        2,
      ),
  },
];

// ---------------------------------------------------------------------------
// Syntax-highlighted config viewer — tokenizes without regex/DOM injection
//                           so values containing colons (e.g. headers) render correctly
// ---------------------------------------------------------------------------

type HlPart = string | { c: string; t: string };

function tokenizeJsonLine(line: string): HlPart[] {
  const parts: HlPart[] = [];
  // Match one quoted string, number, or boolean at the next position; plain
  // punctuation/whitespace is emitted as a raw string part.
  const re =
    /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(\b(?:true|false|null)\b)|(\b-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|./g;
  let m: RegExpExecArray | null;
  let last = 0;
  let afterColon = false;
  while ((m = re.exec(line)) !== null) {
    if (m.index !== last) {
      parts.push(line.slice(last, m.index));
    }
    last = re.lastIndex;
    const tok = m[0];
    if (m[1] !== undefined) {
      // Quoted key (has trailing colon) — keys are blue
      parts.push({ c: 'text-blue-400', t: m[1] });
      const col = tok.slice(m[1].length); // ":" + ws
      if (col) parts.push(col);
      afterColon = true;
    } else if (m[2] !== undefined) {
      // Quoted string value — green
      parts.push({ c: 'text-green-400', t: m[2] });
      afterColon = false;
    } else if (m[3] !== undefined) {
      parts.push({ c: 'text-purple-400', t: m[3] });
      afterColon = false;
    } else if (m[4] !== undefined) {
      parts.push({ c: 'text-amber-400', t: m[4] });
      afterColon = false;
    } else if (tok === ':' && !afterColon) {
      // Top-level separator between blocks (rare in this JSON) — keep plain
      parts.push(tok);
    } else {
      parts.push(tok);
      if (tok.trim()) afterColon = false;
    }
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function McpConnect() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data: apiKeyData, isLoading } =
    useWorkspacesControllerGetWorkspaceApiKey({
      query: {
        queryKey: ['/api/workspaces/api-key', selectedWorkspaceId],
        enabled: !!selectedWorkspaceId,
      },
    });

  const [selectedClientId, setSelectedClientId] = useState('vscode');
  const [copied, setCopied] = useState(false);

  const selectedClient = useMemo(
    () => MCP_CLIENTS.find((c) => c.id === selectedClientId) ?? MCP_CLIENTS[0],
    [selectedClientId],
  );

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  // Empty string must also fall back to the placeholder; real key only on copy.
  const apiKey = (apiKeyData?.apiKey ?? '').trim() || 'YOUR_API_KEY';
  const displayApiKey = 'YOUR_API_KEY';

  // Display config shows placeholder; copy substitutes the real key
  const configJson = useMemo(
    () => selectedClient.generateConfig(baseUrl, displayApiKey),
    [selectedClient, baseUrl],
  );

  const copyConfigJson = useMemo(
    () => selectedClient.generateConfig(baseUrl, apiKey),
    [selectedClient, baseUrl, apiKey],
  );

  const highlightedLines = useMemo(
    () => configJson.split('\n').map((line, i) => ({
      lineNum: i + 1,
      parts: tokenizeJsonLine(line),
    })),
    [configJson],
  );

  // ---- Actions ----

  const copyConfig = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(copyConfigJson);
      setCopied(true);
      toast.success('Configuration copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy configuration');
    }
  }, [copyConfigJson]);

  const openInClient = useCallback(() => {
    const deepLinks: Record<string, string> = {
      cursor: `cursor://open?file=mcp.json`,
    };
    const link = deepLinks[selectedClientId];
    if (link) {
      window.open(link, '_blank');
    } else {
      copyConfig();
    }
  }, [selectedClientId, copyConfig]);

  // ---- Loading state ----

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading configuration...
        </span>
      </div>
    );
  }

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* ---------- Client selector row ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Label + Select */}
        <div className="flex items-center gap-3 sm:w-48 shrink-0">
          <span className="text-sm font-medium">Client</span>
          <Select
            value={selectedClientId}
            onValueChange={setSelectedClientId}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {MCP_CLIENTS.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white p-0.5 ring-1 ring-black/5">
                      <img
                        src={client.icon}
                        alt={client.iconAlt}
                        className="h-full w-full"
                      />
                    </span>
                    <span>{client.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ---------- Config file info ---------- */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Terminal className="h-4 w-4 shrink-0" />
        <span>
          Add this configuration to{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
            {selectedClient.configPath}
          </code>
        </span>
        <span className="text-xs">({selectedClient.configNote})</span>
      </div>

      {/* ---------- Code block with line numbers ---------- */}
      <div className="relative rounded-xl border bg-card overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
          <span className="text-xs text-muted-foreground font-mono">
            {selectedClient.configPath}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={copyConfig}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={openInClient}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </Button>
          </div>
        </div>

        {/* Code area */}
        <div className="overflow-x-auto">
          <pre className="p-4 text-sm font-mono leading-relaxed">
            {highlightedLines.map(({ lineNum, parts }) => (
              <div key={lineNum} className="flex">
                <span className="inline-block w-8 shrink-0 select-none text-right pr-4 text-muted-foreground/50">
                  {lineNum}
                </span>
                <span className="flex-1">
                  {parts.map((p, i) =>
                    typeof p === 'string' ? (
                      <span key={i}>{p}</span>
                    ) : (
                      <span key={i} className={p.c}>
                        {p.t}
                      </span>
                    ),
                  )}
                </span>
              </div>
            ))}
          </pre>
        </div>
      </div>


    </div>
  );
}
