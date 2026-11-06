import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SeverityBadge } from '@/components/vulnerabilities/lifecycle-badges';
import useDebounce from '@/hooks/use-debounce';
import {
  useAssetsControllerGetAssetsInWorkspace,
  useIssuesControllerAddLinks,
  useTargetsControllerGetTargetsInWorkspace,
  useVulnerabilitiesControllerGetVulnerabilities,
} from '@/services/apis/gen/queries';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  apiErrorMessage,
  LINK_RESOURCE_SINGULAR,
  type LinkResourceType,
} from '../issue-utils';

interface PickerOption {
  id: string;
  label: ReactNode;
}

const PICKER_LIMIT = 20;

function usePickerOptions(type: LinkResourceType, search: string) {
  const vulns = useVulnerabilitiesControllerGetVulnerabilities(
    { search: search || undefined, limit: PICKER_LIMIT, status: 'all' },
    { query: { enabled: type === 'vulnerability' } },
  );
  const assets = useAssetsControllerGetAssetsInWorkspace(
    { search: search || undefined, limit: PICKER_LIMIT },
    { query: { enabled: type === 'asset' } },
  );
  const targets = useTargetsControllerGetTargetsInWorkspace(
    { value: search || undefined, limit: PICKER_LIMIT },
    { query: { enabled: type === 'target' } },
  );

  if (type === 'vulnerability') {
    return {
      isLoading: vulns.isLoading,
      options: (vulns.data?.data ?? []).map<PickerOption>((v) => ({
        id: v.id,
        label: (
          <span className="flex min-w-0 items-center gap-2">
            <SeverityBadge severity={v.severity} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{v.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {v.affectedUrl || v.host || v.ipAddress}
              </span>
            </span>
          </span>
        ),
      })),
    };
  }
  if (type === 'asset') {
    return {
      isLoading: assets.isLoading,
      options: (assets.data?.data ?? []).map<PickerOption>((a) => ({
        id: a.id,
        label: <span className="truncate">{a.value}</span>,
      })),
    };
  }
  if (type === 'target') {
    return {
      isLoading: targets.isLoading,
      options: (targets.data?.data ?? []).map<PickerOption>((t) => ({
        id: t.id,
        label: <span className="truncate">{t.value}</span>,
      })),
    };
  }
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function AddLinkDialog({
  issueId,
  open,
  onOpenChange,
  defaultType = 'vulnerability',
  linkedIds,
  onLinked,
}: {
  issueId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: LinkResourceType;
  /** `${resourceType}:${resourceId}` already linked; shown checked and disabled. */
  linkedIds: Set<string>;
  onLinked: () => void;
}) {
  const [type, setType] = useState<LinkResourceType>(defaultType);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const [selected, setSelected] = useState<string[]>([]);
  const [rawId, setRawId] = useState('');
  const picker = usePickerOptions(type, debounced);
  const addLinks = useIssuesControllerAddLinks();

  const reset = () => {
    setSearch('');
    setSelected([]);
    setRawId('');
  };

  const ids = picker ? selected : rawId.trim() ? [rawId.trim()] : [];
  const rawInvalid = !picker && rawId.trim() !== '' && !UUID.test(rawId.trim());

  const submit = () => {
    addLinks.mutate(
      {
        id: issueId,
        data: {
          links: ids.map((resourceId) => ({ resourceType: type, resourceId })),
        },
      },
      {
        onSuccess: () => {
          toast.success(
            ids.length === 1 ? 'Link added' : `${ids.length} links added`,
          );
          reset();
          onOpenChange(false);
          onLinked();
        },
        onError: (error) =>
          toast.error(apiErrorMessage(error, 'Failed to add the link')),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link resources</DialogTitle>
          <DialogDescription>
            Attach vulnerabilities, assets, targets, projects or runs to this
            issue.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="link-type">Resource type</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as LinkResourceType);
                reset();
              }}
            >
              <SelectTrigger id="link-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LINK_RESOURCE_SINGULAR) as LinkResourceType[]).map(
                  (t) => (
                    <SelectItem key={t} value={t}>
                      {LINK_RESOURCE_SINGULAR[t].charAt(0).toUpperCase() +
                        LINK_RESOURCE_SINGULAR[t].slice(1)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          {picker ? (
            <div className="grid gap-2">
              <Input
                aria-label="Search resources"
                placeholder={`Search ${LINK_RESOURCE_SINGULAR[type]}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div
                className="max-h-64 overflow-y-auto rounded-md border"
                data-testid="link-picker"
              >
                {picker.isLoading ? (
                  <div className="flex flex-col gap-2 p-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : picker.options.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Nothing found
                  </p>
                ) : (
                  picker.options.map((option) => {
                    const already = linkedIds.has(`${type}:${option.id}`);
                    const checked = already || selected.includes(option.id);
                    return (
                      <label
                        key={option.id}
                        className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-accent has-[:disabled]:cursor-default has-[:disabled]:opacity-60"
                      >
                        <Checkbox
                          checked={checked}
                          disabled={already}
                          aria-label={`Select ${option.id}`}
                          onCheckedChange={() =>
                            setSelected((prev) =>
                              prev.includes(option.id)
                                ? prev.filter((v) => v !== option.id)
                                : [...prev, option.id],
                            )
                          }
                        />
                        <span className="min-w-0 flex-1">{option.label}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="link-id">
                {LINK_RESOURCE_SINGULAR[type].charAt(0).toUpperCase() +
                  LINK_RESOURCE_SINGULAR[type].slice(1)}{' '}
                ID
              </Label>
              <Input
                id="link-id"
                value={rawId}
                aria-invalid={rawInvalid}
                onChange={(e) => setRawId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
              {rawInvalid && (
                <p className="text-xs text-destructive">Enter a valid ID</p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!ids.length || rawInvalid || addLinks.isPending}
            onClick={submit}
          >
            {ids.length > 1 ? `Link ${ids.length}` : 'Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
