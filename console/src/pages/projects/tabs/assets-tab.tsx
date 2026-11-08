import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Crosshair, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { FilterSelect } from '../components/filter-select';
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
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Crosshair className="size-5 text-primary" />
            Scope
          </CardTitle>
          {scope && (
            <CardDescription>
              {scope.autoAddAssets
                ? 'New assets that match the rules join on their own.'
                : 'Rules apply when they are saved.'}
            </CardDescription>
          )}
        </div>
        <Button variant="outline" disabled={archived} onClick={startEdit}>
          <Pencil className="size-4" />
          Edit rules
        </Button>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {(scope?.rules ?? []).map((rule) => (
          <Badge key={rule.id} variant="outline" className="gap-1.5 py-1 text-sm font-normal">
            {rule.mode === ProjectScopeRuleMode.include ? (
              <Plus className="size-3.5 text-success" />
            ) : (
              <Minus className="size-3.5 text-destructive" />
            )}
            <span className="text-muted-foreground">{TYPE_LABEL[rule.type]}</span>
            {rule.label}
            <span className="tabular-nums text-muted-foreground">· {rule.matched}</span>
          </Badge>
        ))}
        <Badge variant="outline" className="border-dashed py-1 text-sm font-normal text-muted-foreground">
          + {scope?.manualAssets ?? 0} picked by hand
        </Badge>
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
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [text, setText] = useState('');
  const [source, setSource] = useState<ProjectAssetSource | 'all'>('all');
  const [removing, setRemoving] = useState<ProjectAssetDto | null>(null);
  const remove = useProjectsControllerRemoveAssets();
  const onSearch = useCallback((value: string) => {
    setText(value);
    setPage(1);
  }, []);

  const { data, isLoading } = useProjectsControllerGetAssets(projectId, {
    page,
    limit: pageSize,
    search: text,
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
          <span className="font-medium">{row.original.value}</span>
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
        <Badge variant="outline" className="capitalize">
          {row.original.targetType.toLowerCase().replace('_', ' ')}
        </Badge>
      ),
    },
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ row }) =>
        row.original.source === ProjectAssetSource.rule ? (
          <span>
            <span className="text-muted-foreground">Rule · </span>
            {row.original.rule?.label ?? 'deleted rule'}
          </span>
        ) : (
          <span className="text-muted-foreground">Picked by hand</span>
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
            className="hover:underline"
            title={dayjs(row.original.lastScan.createdAt).format('YYYY-MM-DD HH:mm')}
          >
            {dayjs(row.original.lastScan.createdAt).fromNow()}
          </Link>
        ) : (
          <span className="text-muted-foreground">Never</span>
        ),
    },
    {
      accessorKey: 'addedAt',
      header: 'Added',
      cell: ({ row }) => (
        <span className="tabular-nums">
          {new Date(row.original.addedAt).toLocaleDateString()}
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
          disabled={archived}
          aria-label={`Remove ${row.original.value}`}
          onClick={(e) => {
            e.stopPropagation();
            setRemoving(row.original);
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ScopeCard projectId={projectId} archived={archived} />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        pageSize={pageSize}
        totalItems={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        filterColumnKey="value"
        filterValue={text}
        onFilterChange={onSearch}
        filterPlaceholder="Search assets"
        filterComponents={[
          <FilterSelect
            key="source"
            label="Source"
            value={source}
            onValueChange={(value) => {
              setSource(value as ProjectAssetSource | 'all');
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All sources' },
              { value: ProjectAssetSource.rule, label: 'From rules', dot: 'bg-blue-500' },
              { value: ProjectAssetSource.manual, label: 'Picked by hand', dot: 'bg-green-500' },
            ]}
          />,
        ]}
        toolbarComponents={
          archived ? [] : [<SelectAssetsDialog key="add" projectId={projectId} />]
        }
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
