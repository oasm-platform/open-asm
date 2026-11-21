import { isAfter, subDays } from 'date-fns';
import { formatDate, fromNow } from '@/lib/date-locale';
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
import { useT } from '@/lib/i18n-dictionary';
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


const PAGE_SIZE = 20;
const RECENT_DAYS = 7;

const TYPE_LABEL: Record<string, string> = {
  target: 'projects.scope.type.target',
  hostname: 'projects.scope.type.hostname',
  cidr: 'projects.scope.type.cidr',
  asset: 'projects.scope.type.asset',
};

/** Rule list of the project with an editor dialog. */
function ScopeCard({ projectId, archived }: { projectId: string; archived: boolean }) {
  const t = useT();
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
            t('projects.assets.scopeSaved', {
              added: result.added,
              removed: result.removed,
            }),
          );
          void invalidate();
          setOpen(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, t('projects.assets.saveRulesFailed'))),
      },
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Crosshair className="size-5 text-primary" />
            {t('projects.create.steps.scope')}
          </CardTitle>
          {scope && (
            <CardDescription>
              {scope.autoAddAssets
                ? t('projects.assets.autoAddOn')
                : t('projects.assets.autoAddOff')}
            </CardDescription>
          )}
        </div>
        <Button variant="outline" disabled={archived} onClick={startEdit}>
          <Pencil className="size-4" />
          {t('projects.assets.editRules')}
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
            <span className="text-muted-foreground">{TYPE_LABEL[rule.type] ? t(TYPE_LABEL[rule.type]) : rule.type}</span>
            {rule.label}
            <span className="tabular-nums text-muted-foreground">· {rule.matched}</span>
          </Badge>
        ))}
        <Badge variant="outline" className="border-dashed py-1 text-sm font-normal text-muted-foreground">
          {t('projects.assets.manualCount', { n: scope?.manualAssets ?? 0 })}
        </Badge>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('projects.assets.scopeRules')}</DialogTitle>
            <DialogDescription>
              {t('projects.assets.scopeRulesHint')}
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
              {t('common.cancel')}
            </Button>
            <Button disabled={replace.isPending} onClick={save}>
              {t('projects.assets.saveRules')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function AssetsTab({ projectId, archived }: { projectId: string; archived: boolean }) {
  const t = useT();
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
          toast.success(t('projects.assets.removed', { value: removing.value }));
          void invalidate();
        },
        onError: (error) => toast.error(apiErrorMessage(error, t('projects.assets.removeFailed'))),
      },
    );
  };

  const recent = subDays(new Date(), RECENT_DAYS);
  const columns: ColumnDef<ProjectAssetDto>[] = [
    {
      accessorKey: 'value',
      header: t('projects.assets.colAsset'),
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{row.original.value}</span>
          {isAfter(new Date(row.original.addedAt), recent) && (
            <Badge variant="soft">{t('projects.assets.new')}</Badge>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'targetType',
      header: t('common.type'),
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.original.targetType.toLowerCase().replace('_', ' ')}
        </Badge>
      ),
    },
    {
      accessorKey: 'source',
      header: t('projects.assets.colSource'),
      cell: ({ row }) =>
        row.original.source === ProjectAssetSource.rule ? (
          <span>
            <span className="text-muted-foreground">{t('projects.assets.rulePrefix')} </span>
            {row.original.rule?.label ?? t('projects.assets.deletedRule')}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {t('projects.assets.pickedByHand')}
          </span>
        ),
    },
    {
      id: 'vulnerabilities',
      header: t('projects.tabs.vulnerabilities'),
      cell: ({ row }) => (
        <SeverityCounts counts={row.original.vulnerabilities} empty="—" />
      ),
    },
    {
      id: 'lastScan',
      header: t('projects.assets.colLastScan'),
      cell: ({ row }) =>
        row.original.lastScan ? (
          <Link
            to="/jobs/runs/$id"
            params={{ id: row.original.lastScan.runId }}
            className="hover:underline"
            title={formatDate(row.original.lastScan.createdAt, 'yyyy-MM-dd HH:mm')}
          >
            {fromNow(row.original.lastScan.createdAt)}
          </Link>
        ) : (
          <span className="text-muted-foreground">{t('projects.list.never')}</span>
        ),
    },
    {
      accessorKey: 'addedAt',
      header: t('projects.assets.colAdded'),
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
          aria-label={t('projects.assets.removeAria', { value: row.original.value })}
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
        filterPlaceholder={t('projects.assets.search')}
        filterComponents={[
          <FilterSelect
            key="source"
            label={t('projects.assets.colSource')}
            value={source}
            onValueChange={(value) => {
              setSource(value as ProjectAssetSource | 'all');
              setPage(1);
            }}
            options={[
              { value: 'all', label: t('projects.assets.allSources') },
              { value: ProjectAssetSource.rule, label: t('projects.assets.fromRules'), dot: 'bg-blue-500' },
              { value: ProjectAssetSource.manual, label: t('projects.assets.pickedByHand'), dot: 'bg-green-500' },
            ]}
          />,
        ]}
        toolbarComponents={
          archived ? [] : [<SelectAssetsDialog key="add" projectId={projectId} />]
        }
        emptyMessage={t('projects.assets.empty')}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('projects.assets.removeTitle')}
        description={
          removing?.source === ProjectAssetSource.rule
            ? t('projects.assets.removeRuleDescription', { value: removing.value })
            : t('projects.assets.removeDescription', {
                value: removing?.value ?? t('projects.assets.thisAsset'),
              })
        }
        onConfirm={confirmRemove}
        disabled={remove.isPending}
      />
    </div>
  );
}
