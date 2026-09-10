'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Image } from '@/components/ui/image';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ToolConnectorConfigSheet } from '@/components/tools/tool-connector-config-sheet';
import { cn } from '@/lib/utils';
import {
  ToolType,
  useToolConfigProfilesControllerList,
  type Tool,
} from '@/services/apis/gen/queries';
import {
  ArrowDown,
  ArrowUp,
  CheckIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';

/** A single tool entry in the pipeline. Order in the array = execution order. */
export interface PipelineToolEntry {
  toolId: string;
  config?: Record<string, unknown>;
  configProfileId?: string;
}

interface ToolPipelineBuilderProps {
  /** Full tool objects (with type / hasConfigProfile / isReady / logoUrl). */
  tools: Tool[];
  /** Ordered entries — array order is the execution order. */
  value: PipelineToolEntry[];
  onChange: (next: PipelineToolEntry[]) => void;
  disabled?: boolean;
  emptyMessage?: string;
}

const BLOCKED_MESSAGE = 'This tool needs configuration — add it first, then configure from the panel.';

/**
 * Backend readiness flags. The generated `Tool` type declares
 * `hasConfigProfile` as an object, but the API returns a boolean —
 * accept both shapes (plus the `isReady` shortcut the backend computes).
 */
function getBackendHasProfile(tool: Tool): boolean {
  const raw = (tool as unknown as { hasConfigProfile?: unknown })
    .hasConfigProfile;
  if (raw === true) return true;
  if (raw && typeof raw === 'object') {
    return Object.keys(raw as Record<string, unknown>).length > 0;
  }
  return false;
}

function hasInlineConfig(
  entry?: Pick<PipelineToolEntry, 'config'>,
): boolean {
  return !!entry?.config && Object.keys(entry.config).length > 0;
}

/** True when the entry points at a profile id absent from the fetched list. */
function isProfileOrphan(
  entry: Pick<PipelineToolEntry, 'configProfileId'> | undefined,
  profileIds: readonly string[] | undefined,
): boolean {
  if (!entry?.configProfileId) return false;
  if (profileIds === undefined) return false;
  return !profileIds.includes(entry.configProfileId);
}

/** A connector is ready when it has a backend profile, an inline config, or a linked profile id. */
export function isPipelineToolReady(
  tool: Tool,
  entry?: PipelineToolEntry,
  knownProfileIds?: readonly string[],
): boolean {
  if (tool.type !== ToolType.connector) return true;
  if (tool.isReady === true) return true;
  if (getBackendHasProfile(tool)) return true;
  if (hasInlineConfig(entry)) return true;
  if (!entry?.configProfileId) return false;
  // Orphan guard: a linked id that is absent from the fetched list is NOT
  // ready (unless inline config above already resolved it). Unknown list
  // (panel never opened) preserves the old optimistic behavior.
  if (knownProfileIds !== undefined && !knownProfileIds.includes(entry.configProfileId)) {
    return false;
  }
  return true;
}

/** Every selected connector satisfies the readiness gate. Unknown tools pass through. */
export function isPipelineValid(
  value: PipelineToolEntry[],
  byId: ReadonlyMap<string, Tool>,
  knownProfilesByTool?: Readonly<Record<string, readonly string[]>>,
): boolean {
  return value.every((entry) => {
    const tool = byId.get(entry.toolId);
    if (!tool) return true;
    return isPipelineToolReady(tool, entry, knownProfilesByTool?.[entry.toolId]);
  });
}

/**
 * Profile dropdown for one tool. Mounted only when its panel is open,
 * so profiles are fetched lazily per tool.
 */
const ToolProfileSelect = memo(function ToolProfileSelect({
  toolId,
  value,
  onChange,
  disabled,
  onProfilesLoaded,
}: {
  toolId: string;
  value?: string;
  onChange: (profileId: string | undefined) => void;
  disabled?: boolean;
  onProfilesLoaded?: (toolId: string, ids: string[]) => void;
}) {
  const { data: profiles, isLoading } =
    useToolConfigProfilesControllerList(toolId);

  // The generated type is incomplete — the API returns at least id/name/isDefault.
  const profileList = (profiles ?? []) as unknown as Array<{
    id: string;
    name: string;
    isDefault?: boolean;
  }>;

  useEffect(() => {
    if (!isLoading && profiles !== undefined) {
      const ids = (
        (profiles ?? []) as unknown as Array<{ id: string }>
      ).map((p) => p.id);
      onProfilesLoaded?.(toolId, ids);
    }
  }, [isLoading, profiles, toolId, onProfilesLoaded]);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading profiles...</p>;
  }

  const profileIds = profileList.map((p) => p.id);
  const orphan = isProfileOrphan({ configProfileId: value }, profileIds);

  if (profileList.length === 0 && !orphan) {
    return (
      <p className="text-xs text-muted-foreground">
        No profiles — configure inline
      </p>
    );
  }

  const shortId = value ? `${value.slice(0, 8)}…` : '';

  const select = (
    <Select
      value={value ?? '__none__'}
      onValueChange={(selected) => {
        onChange(selected === '__none__' ? undefined : selected);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        className="w-full"
        title={orphan ? `Linked profile ${value} was deleted` : undefined}
      >
        <SelectValue
          placeholder={orphan ? `Deleted profile (${shortId})` : 'Select a profile'}
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">No profile (use defaults)</SelectItem>
        {orphan && value && (
          <SelectItem value={value} disabled>
            Deleted profile ({shortId})
          </SelectItem>
        )}
        {profileList.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
            {p.isDefault ? ' (default)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {orphan ? (
        <Tooltip>
          <TooltipTrigger asChild>{select}</TooltipTrigger>
          <TooltipContent>
            <p>Linked profile {shortId} was deleted.</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        select
      )}
      {orphan && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-destructive">
            Linked profile was deleted.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
            disabled={disabled}
            onClick={() => onChange(undefined)}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
});

/**
 * Raw circular logo button — the PopoverAnchor / Tooltip target.
 *
 * Must forward its ref: Radix `asChild` (PopoverAnchor / TooltipTrigger)
 * clones this child and relies on the ref being attached to a DOM node.
 * Without it the anchored popover never opens (added + pending tools alike).
 */
const PipelineToolLogo = memo(
  forwardRef<
    HTMLButtonElement,
    {
      tool: Tool;
      added: boolean;
      disabled?: boolean;
      onClick: (tool: Tool) => void;
    }
  >(function PipelineToolLogo(
    { tool, added, disabled, onClick, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={cn(
        'group flex cursor-pointer flex-col items-center gap-2',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      disabled={disabled}
      onClick={() => onClick(tool)}
      aria-pressed={added}
      aria-label={
        added ? `Configure ${tool.name}` : `Add ${tool.name} to pipeline`
      }
    >
      <div className="relative">
        <div
          className={cn(
            'transition-all duration-300',
            !added &&
              'grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100',
          )}
        >
          <Image
            url={tool.logoUrl}
            width={40}
            height={40}
            className="rounded-full border-2 border-[var(--color-primary)]/40 group-hover:border-[var(--color-primary)]"
          />
        </div>
        {!added && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <Plus className="size-5 text-white" />
          </div>
        )}
        {added && (
          <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#10b981]">
            <CheckIcon className="size-3 text-white" />
          </div>
        )}
      </div>
      <span className="text-center text-xs font-medium capitalize">
        {tool.name}
      </span>
      </button>
    );
  }),
);

/** Action panel for a selected tool: order, badges, profile, inline config, move, remove. */
const SelectedToolPanel = memo(function SelectedToolPanel({
  tool,
  entry,
  index,
  total,
  knownProfileIds,
  disabled,
  onClose,
  onPatchEntry,
  onMove,
  onRemove,
  onOpenSheet,
  onProfilesLoaded,
}: {
  tool: Tool;
  entry: PipelineToolEntry;
  index: number;
  total: number;
  knownProfileIds: readonly string[] | undefined;
  disabled?: boolean;
  onClose: () => void;
  onPatchEntry: (id: string, patch: Partial<PipelineToolEntry>) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onOpenSheet: (toolId: string) => void;
  onProfilesLoaded: (toolId: string, ids: string[]) => void;
}) {
  const orphan = isProfileOrphan(entry, knownProfileIds);
  const custom = hasInlineConfig(entry);
  const linked = !!entry.configProfileId && !orphan;
  const usesDefault = !custom && !linked ? getBackendHasProfile(tool) : false;
  const toolLabel = tool.name;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium capitalize">
          {toolLabel}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          #{index + 1} of {total}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={onClose}
          aria-label={`Close ${toolLabel} panel`}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {orphan ? (
          <Badge variant="destructive">Profile deleted</Badge>
        ) : (
          linked && <Badge variant="outline">Profile linked</Badge>
        )}
        {custom && <Badge variant="secondary">Custom</Badge>}
        {usesDefault && <Badge variant="soft">Using default</Badge>}

      </div>
      <ToolProfileSelect
        toolId={tool.id}
        value={entry.configProfileId}
        onChange={(profileId) =>
          onPatchEntry(tool.id, { configProfileId: profileId })
        }
        disabled={disabled}
        onProfilesLoaded={onProfilesLoaded}
      />
      <div>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onOpenSheet(tool.id)}
        >
          <Pencil className="mr-1 size-3" />
          Inline config
        </Button>
      </div>
      <div className="flex items-center justify-between border-t pt-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={disabled || index === 0}
            onClick={() => onMove(index, -1)}
            aria-label={`Move ${toolLabel} up`}
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={disabled || index === total - 1}
            onClick={() => onMove(index, 1)}
            aria-label={`Move ${toolLabel} down`}
          >
            <ArrowDown className="size-3.5" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={disabled}
          onClick={() => onRemove(tool.id)}
        >
          <Trash2 className="mr-1 size-3.5" />
          Remove
        </Button>
      </div>
    </div>
  );
});

/** Panel for a tool not yet in the pipeline — configure before adding. */
const PendingToolPanel = memo(function PendingToolPanel({
  tool,
  pending,
  disabled,
  onChangeProfile,
  onOpenSheet,
  onClose,
  onAdd,
  onProfilesLoaded,
}: {
  tool: Tool;
  pending: Partial<PipelineToolEntry> | undefined;
  disabled?: boolean;
  onChangeProfile: (toolId: string, profileId: string | undefined) => void;
  onOpenSheet: (toolId: string) => void;
  onClose: () => void;
  onAdd: (
    tool: Tool,
    config?: Record<string, unknown>,
    configProfileId?: string,
  ) => void;
  onProfilesLoaded: (toolId: string, ids: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium capitalize">
          {tool.name}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={onClose}
          aria-label={`Close ${tool.name} panel`}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <ToolProfileSelect
        toolId={tool.id}
        value={pending?.configProfileId as string | undefined}
        onChange={(profileId) => onChangeProfile(tool.id, profileId)}
        disabled={disabled}
        onProfilesLoaded={onProfilesLoaded}
      />
      <div>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onOpenSheet(tool.id)}
        >
          <Pencil className="mr-1 size-3" />
          Inline config
        </Button>
      </div>
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => {
          const cfg = pending;
          const hasProfileId = !!cfg?.configProfileId;
          const hasInline = hasInlineConfig(cfg);
          if (!hasProfileId && !hasInline) {
            toast.info('Set a config profile or inline config first.');
            return;
          }
          onAdd(
            tool,
            hasInline ? cfg?.config : undefined,
            hasProfileId ? cfg?.configProfileId : undefined,
          );
        }}
      >
        Add to pipeline
      </Button>
    </div>
  );
});

/** Missing installed tool circle + its remove/move popover. */
const MissingToolPopover = memo(function MissingToolPopover({
  toolId,
  index,
  total,
  open,
  disabled,
  onOpenChange,
  onToggle,
  onMove,
  onRemove,
}: {
  toolId: string;
  index: number;
  total: number;
  open: boolean;
  disabled?: boolean;
  onOpenChange: (toolId: string, open: boolean) => void;
  onToggle: (toolId: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => onOpenChange(toolId, nextOpen)}
    >
      <PopoverAnchor asChild>
        <button
          type="button"
          className="group flex cursor-pointer flex-col items-center gap-2"
          disabled={disabled}
          onClick={() => !disabled && onToggle(toolId)}
          aria-pressed
          aria-label={`Configure ${toolId}`}
        >
          <div className="relative">
            <span className="flex size-10 items-center justify-center rounded-full border-2 border-[var(--color-primary)]/40 text-sm font-semibold uppercase group-hover:border-[var(--color-primary)]">
              {toolId.charAt(0)}
            </span>
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#10b981]">
              <CheckIcon className="size-3 text-white" />
            </span>
          </div>
          <span className="max-w-20 truncate text-center text-xs font-medium">
            {toolId}
          </span>
          <span className="flex h-5 items-center">
            <Badge variant="secondary" className="text-[10px]">
              #{index + 1}
            </Badge>
          </span>
        </button>
      </PopoverAnchor>
      <PopoverContent side="bottom" align="center" className="w-72">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            This tool is no longer installed — it stays in the
            execution order until removed.
          </p>
          <div className="flex items-center justify-between border-t pt-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={disabled || index === 0}
                onClick={() => onMove(index, -1)}
                aria-label="Move up"
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={disabled || index === total - 1}
                onClick={() => onMove(index, 1)}
                aria-label="Move down"
              >
                <ArrowDown className="size-3.5" />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={disabled}
              onClick={() => onRemove(toolId)}
            >
              <Trash2 className="mr-1 size-3.5" />
              Remove
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});

/**
 * Shared Option B pipeline builder for asset-group tool selection.
 * Circular logo grid (old ToolSelector look): click an unselected logo to
 * add it (blocked connectors open the inline config sheet first), click a
 * selected logo to open its action panel (order, profile, inline config,
 * move, remove).
 */
function ToolPipelineBuilderComponent({
  tools,
  value,
  onChange,
  disabled = false,
  emptyMessage = 'No scanning tools installed',
}: ToolPipelineBuilderProps) {
  const [search, setSearch] = useState('');
  // Only one selected-tool panel open at a time (tool id).
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheetToolId, setSheetToolId] = useState<string | null>(null);
  // Inline config for tools not yet in the pipeline (pending configuration).
  const [pendingConfig, setPendingConfig] = useState<
    Record<string, Partial<PipelineToolEntry>>
  >({});
  // Fetched profile ids per tool (filled lazily when a panel opens).
  // Used for orphan detection in badges + the readiness gate.
  const [knownProfilesByTool, setKnownProfilesByTool] = useState<
    Record<string, string[]>
  >({});

  const handleProfilesLoaded = useCallback((toolId: string, ids: string[]) => {
    setKnownProfilesByTool((prev) => {
      const prevIds = prev[toolId];
      if (
        prevIds !== undefined &&
        prevIds.length === ids.length &&
        prevIds.every((id, i) => id === ids[i])
      ) {
        return prev;
      }
      return { ...prev, [toolId]: ids };
    });
  }, []);

  const byId = useMemo(() => new Map(tools.map((t) => [t.id, t])), [tools]);
  const entryById = useMemo(
    () => new Map(value.map((e) => [e.toolId, e])),
    [value],
  );
  const orderById = useMemo(
    () => new Map(value.map((e, index) => [e.toolId, index])),
    [value],
  );

  const filteredTools = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tools;
    return tools.filter((t) => t.name.toLowerCase().includes(query));
  }, [tools, search]);

  // Selected entries whose tool is no longer in the installed list —
  // still rendered (as fallback circles) so they stay removable.
  const missingEntries = useMemo(
    () => value.filter((e) => !byId.get(e.toolId)),
    [value, byId],
  );

  const allValid = useMemo(
    () => isPipelineValid(value, byId, knownProfilesByTool),
    [value, byId, knownProfilesByTool],
  );

  const sheetTool = sheetToolId ? byId.get(sheetToolId) : undefined;
  const sheetEntry = sheetToolId ? entryById.get(sheetToolId) : undefined;

  const patchEntry = useCallback(
    (id: string, patch: Partial<PipelineToolEntry>) => {
      onChange(value.map((e) => (e.toolId === id ? { ...e, ...patch } : e)));
    },
    [onChange, value],
  );

  const handleAdd = useCallback(
    (
      tool: Tool,
      config?: Record<string, unknown>,
      configProfileId?: string,
    ) => {
      if (disabled || entryById.has(tool.id)) return;
      onChange([
        ...value,
        {
          toolId: tool.id,
          ...(config ? { config } : {}),
          ...(configProfileId ? { configProfileId } : {}),
        },
      ]);
      setActiveId(tool.id);
      // Clear pending config for this tool since it's now in the pipeline.
      if (pendingConfig[tool.id]) {
        setPendingConfig((prev) => {
          const next = { ...prev };
          delete next[tool.id];
          return next;
        });
      }
    },
    [disabled, entryById, onChange, value, pendingConfig],
  );

  // Configure-then-add: when the sheet submits for a pending tool (not in
  // pipeline), add it with the config. For existing entries, just patch.
  const handleSheetSubmit = useCallback(
    (tool: Tool, config: Record<string, unknown>) => {
      if (entryById.has(tool.id)) {
        patchEntry(tool.id, { config });
      } else {
        handleAdd(tool, config);
      }
      setSheetToolId(null);
    },
    [entryById, patchEntry, handleAdd],
  );

  const handleRemove = useCallback(
    (id: string) => {
      onChange(value.filter((e) => e.toolId !== id));
      setActiveId((prev) => (prev === id ? null : prev));
      if (sheetToolId === id) setSheetToolId(null);
    },
    [onChange, value, sheetToolId],
  );

  const handleMove = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= value.length) return;
      const next = [...value];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      onChange(next);
    },
    [onChange, value],
  );

  /**
   * Logo click behavior (never an instant toggle):
   * - unselected → open panel (configure first, then add);
   * - selected → open/close its action panel.
   */
  const handleLogoClick = useCallback(
    (tool: Tool) => {
      if (disabled) return;
      // Both added and pending tools toggle their panel open/closed.
      setActiveId((prev) => (prev === tool.id ? null : tool.id));
    },
    [disabled],
  );

  const handleCloseActive = useCallback(() => setActiveId(null), []);

  const handleOpenSheet = useCallback(
    (toolId: string) => setSheetToolId(toolId),
    [],
  );

  const handlePendingProfileChange = useCallback(
    (toolId: string, profileId: string | undefined) => {
      setPendingConfig((prev) => ({
        ...prev,
        [toolId]: { ...prev[toolId], configProfileId: profileId },
      }));
    },
    [],
  );

  const handleMissingOpenChange = useCallback(
    (toolId: string, open: boolean) => setActiveId(open ? toolId : null),
    [],
  );

  const handleMissingToggle = useCallback((toolId: string) => {
    setActiveId((prev) => (prev === toolId ? null : toolId));
  }, []);

  /** Circular logo button wrapped with a blocked-tool tooltip when needed. */
  const renderLogoButton = (tool: Tool) => {
    const entry = entryById.get(tool.id);
    const added = !!entry;
    const ready = isPipelineToolReady(tool, entry, knownProfilesByTool[tool.id]);
    const blocked = !added && !ready;

    const button = (
      <PipelineToolLogo
        tool={tool}
        added={added}
        disabled={disabled}
        onClick={handleLogoClick}
      />
    );

    if (blocked && !disabled) {
      return (
        <Tooltip key={tool.id}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{BLOCKED_MESSAGE}</p>
          </TooltipContent>
        </Tooltip>
      );
    }
    return <span key={tool.id}>{button}</span>;
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveId(null);
              }}
              placeholder="Search tools..."
              className="pl-8"
              disabled={disabled}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {value.length} selected
            {value.length > 0 ? ' · execution runs in # order' : ''}
          </span>
        </div>

        {tools.length === 0 && (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        )}
        <div className="flex flex-wrap gap-5">
          {filteredTools.map((tool) => {
            const added = entryById.has(tool.id);
            if (!added) {
              // Pending tool: show Popover panel when active.
              if (activeId === tool.id) {
                return (
                  <Popover
                    key={tool.id}
                    open
                    onOpenChange={(open) =>
                      setActiveId(open ? tool.id : null)
                    }
                  >
                    <PopoverAnchor asChild>
                      <PipelineToolLogo
                        tool={tool}
                        added={added}
                        disabled={disabled}
                        onClick={handleLogoClick}
                      />
                    </PopoverAnchor>
                    <PopoverContent
                      side="bottom"
                      align="center"
                      className="w-72"
                    >
                      <PendingToolPanel
                        tool={tool}
                        pending={pendingConfig[tool.id]}
                        disabled={disabled}
                        onChangeProfile={handlePendingProfileChange}
                        onOpenSheet={handleOpenSheet}
                        onClose={handleCloseActive}
                        onAdd={handleAdd}
                        onProfilesLoaded={handleProfilesLoaded}
                      />
                    </PopoverContent>
                  </Popover>
                );
              }
              return renderLogoButton(tool);
            }
            const entry = entryById.get(tool.id);
            if (!entry) return renderLogoButton(tool);
            const index = orderById.get(tool.id) ?? 0;
            return (
              <Popover
                key={tool.id}
                open={activeId === tool.id}
                onOpenChange={(open) =>
                  setActiveId(open ? tool.id : null)
                }
              >
                <PopoverAnchor asChild>
                  <PipelineToolLogo
                    tool={tool}
                    added={added}
                    disabled={disabled}
                    onClick={handleLogoClick}
                  />
                </PopoverAnchor>
                <PopoverContent side="bottom" align="center" className="w-72">
                  <SelectedToolPanel
                    tool={tool}
                    entry={entry}
                    index={index}
                    total={value.length}
                    knownProfileIds={knownProfilesByTool[tool.id]}
                    disabled={disabled}
                    onClose={handleCloseActive}
                    onPatchEntry={patchEntry}
                    onMove={handleMove}
                    onRemove={handleRemove}
                    onOpenSheet={handleOpenSheet}
                    onProfilesLoaded={handleProfilesLoaded}
                  />
                </PopoverContent>
              </Popover>
            );
          })}
          {missingEntries.map((entry) => {
            const index = orderById.get(entry.toolId) ?? 0;
            return (
              <MissingToolPopover
                key={entry.toolId}
                toolId={entry.toolId}
                index={index}
                total={value.length}
                open={activeId === entry.toolId}
                disabled={disabled}
                onOpenChange={handleMissingOpenChange}
                onToggle={handleMissingToggle}
                onMove={handleMove}
                onRemove={handleRemove}
              />
            );
          })}
        </div>
        {tools.length > 0 && filteredTools.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No tools match &quot;{search.trim()}&quot;
          </p>
        )}
        {!allValid && value.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Some tools still need configuration before they can run.
          </p>
        )}
      </div>

      {/* Inline config sheet — unified API: mode="inline" + onInlineSubmit */}
      {sheetTool && (
        <ToolConnectorConfigSheet
          open
          onOpenChange={(open) => {
            if (!open) setSheetToolId(null);
          }}
          tool={sheetTool}
          mode="inline"
          defaultConfig={sheetEntry?.config}
          onInlineSubmit={(config) => {
            if (sheetTool) handleSheetSubmit(sheetTool, config);
          }}
        />
      )}
    </TooltipProvider>
  );
}

export const ToolPipelineBuilder = memo(ToolPipelineBuilderComponent);
