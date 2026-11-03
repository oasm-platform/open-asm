import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import useDebounce from '@/hooks/use-debounce';
import {
  ProjectAssetSource,
  ProjectScopeRuleMode,
  useProjectsControllerGetAssets,
  useProjectsControllerGetScopeRules,
  useProjectsControllerRemoveAssets,
  useProjectsControllerReplaceScopeRules,
  type ProjectAssetDto,
} from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from '@tanstack/react-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  isCompleteRule,
  ScopeRulesEditor,
  type EditableScopeRule,
} from '../components/scope-rules-editor';
import { SelectAssetsDialog } from '../components/select-assets-dialog';
import { SeverityCounts } from '../components/severity-bar';
import { apiErrorMessage, useInvalidateProjects } from '../project-utils';

dayjs.extend(relativeTime);

const PAGE_SIZE = 20;
const RECENT_DAYS = 7;

const TYPE_LABEL: Record<string, string> = {
  target: 'Target',
  hostname: 'Hostname',
  cidr: 'CIDR',
  asset: 'Asset',
};

/** Rule list of the project with an editor dialog. */
function ScopeCard({ projectId, archived }: { projectId: string; archived: boolean }) {
  const invalidate = useInvalidateProjects();
  const { data: scope } = useProjectsControllerGetScopeRules(projectId);
  const replace = useProjectsControllerReplaceScopeRules();
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<EditableScopeRule[]>([]);
  const [autoAdd, setAutoAdd] = useState(true);

  const startEdit = () => {
    setRules(
      (scope?.rules ?? []).map(({ mode, type, value, label }) => ({
        mode,
        type,
        value,
        label,
      })),
    );
    setAutoAdd(scope?.autoAddAssets ?? true);
    setOpen(true);
  };

  const save = () =>
    replace.mutate(
      {
        id: projectId,
        data: {
          rules: rules
            .filter(isCompleteRule)
            .map(({ mode, type, value }) => ({ mode, type, value })),
          autoAddAssets: autoAdd,
        },
      },
      {
        onSuccess: (result) => {
          toast.success(
            `Scope saved: ${result.added} added, ${result.removed} removed`,
          );
          void invalidate();
          setOpen(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, 'Failed to save the rules')),
      },
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle className="text-sm">Scope</CardTitle>
        <div className="flex items-center gap-2">
          {scope && (
            <Badge variant="outline" className="font-normal">
              {scope.autoAddAssets ? 'Adds new matching assets' : 'Rules apply on save only'}
            </Badge>
          )}
          <Button size="sm" variant="outline" disabled={archived} onClick={startEdit}>
            <Pencil className="size-3.5" />
            Edit rules
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 text-sm">
        {(scope?.rules ?? []).map((rule) => (
          <span
            key={rule.id}
            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
          >
            {rule.mode === ProjectScopeRuleMode.include ? (
              <Plus className="size-3 text-emerald-600" />
            ) : (
              <Minus className="size-3 text-destructive" />
            )}
            <span className="text-muted-foreground">{TYPE_LABEL[rule.type]}</span>
            <span className="font-mono">{rule.label}</span>
            <span className="tabular-nums text-muted-foreground">· {rule.matched}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
          + {scope?.manualAssets ?? 0} picked by hand
        </span>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Scope rules</DialogTitle>
            <DialogDescription>
              Include rules add matching assets; exclude rules keep them out.
              Assets picked by hand stay until you remove them.
            </DialogDescription>
          </DialogHeader>
          <ScopeRulesEditor
            rules={rules}
            onChange={setRules}
            autoAddAssets={autoAdd}
            onAutoAddAssetsChange={setAutoAdd}
            projectId={projectId}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={replace.isPending} onClick={save}>
              Save rules
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function AssetsTab({ projectId, archived }: { projectId: string; archived: boolean }) {
  const invalidate = useInvalidateProjects();
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [source, setSource] = useState<ProjectAssetSource | 'all'>('all');
  const [removing, setRemoving] = useState<ProjectAssetDto | null>(null);
  const debounced = useDebounce(text, 400);
  const remove = useProjectsControllerRemoveAssets();

  const { data, isLoading } = useProjectsControllerGetAssets(projectId, {
    page,
    limit: PAGE_SIZE,
    search: debounced,
    sortBy: 'addedAt',
    sortOrder: 'DESC',
    ...(source !== 'all' ? { source } : {}),
  });

  const confirmRemove = () => {
    if (!removing) return;
    remove.mutate(
      { id: projectId, data: { assetIds: [removing.id] } },
      {
        onSuccess: () => {
          toast.success(`${removing.value} removed from the project`);
          void invalidate();
        },
        onError: (error) => toast.error(apiErrorMessage(error, 'Failed to remove the asset')),
      },
    );
  };

  const recent = dayjs().subtract(RECENT_DAYS, 'day');
  const columns: ColumnDef<ProjectAssetDto>[] = [
    {
      accessorKey: 'value',
      header: 'Asset',
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs">{row.original.value}</span>
          {dayjs(row.original.addedAt).isAfter(recent) && (
            <Badge variant="soft">New</Badge>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'targetType',
      header: 'Type',
      cell: ({ row }) => (
        <span className="text-xs capitalize text-muted-foreground">
          {row.original.targetType.toLowerCase().replace('_', ' ')}
        </span>
      ),
    },
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ row }) =>
        row.original.source === ProjectAssetSource.rule ? (
          <span className="text-xs">
            Rule ·{' '}
            <span className="font-mono">{row.original.rule?.label ?? 'deleted rule'}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Picked by hand</span>
        ),
    },
    {
      id: 'vulnerabilities',
      header: 'Vulnerabilities',
      cell: ({ row }) => (
        <SeverityCounts counts={row.original.vulnerabilities} empty="—" />
      ),
    },
    {
      id: 'lastScan',
      header: 'Last scan',
      cell: ({ row }) =>
        row.original.lastScan ? (
          <Link
            to="/jobs/runs/$id"
            params={{ id: row.original.lastScan.runId }}
            className="text-xs hover:underline"
            title={dayjs(row.original.lastScan.createdAt).format('DD MMM YYYY, HH:mm')}
          >
            {dayjs(row.original.lastScan.createdAt).fromNow()}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">Never</span>
        ),
    },
    {
      accessorKey: 'addedAt',
      header: 'Added',
      cell: ({ row }) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {dayjs(row.original.addedAt).format('DD/MM/YYYY')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={archived}
          aria-label={`Remove ${row.original.value}`}
          onClick={(e) => {
            e.stopPropagation();
            setRemoving(row.original);
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ScopeCard projectId={projectId} archived={archived} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search assets..."
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPage(1);
          }}
          className="h-8 w-full text-xs md:w-64"
        />
        <Select
          value={source}
          onValueChange={(value) => {
            setSource(value as ProjectAssetSource | 'all');
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Source" className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value={ProjectAssetSource.rule}>From rules</SelectItem>
            <SelectItem value={ProjectAssetSource.manual}>Picked by hand</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          {!archived && <SelectAssetsDialog projectId={projectId} />}
        </div>
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        pageSize={PAGE_SIZE}
        totalItems={data?.total ?? 0}
        onPageChange={setPage}
        emptyMessage="No assets in this project yet"
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove asset"
        description={
          removing?.source === ProjectAssetSource.rule
            ? `${removing.value} was added by a rule. Removing it adds an exclude rule so it stays out.`
            : `Remove ${removing?.value ?? 'this asset'} from the project? Its findings stay in the workspace.`
        }
        onConfirm={confirmRemove}
        disabled={remove.isPending}
      />
    </div>
  );
}
