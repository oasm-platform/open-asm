import type { ColumnDef } from '@tanstack/react-table';
import { Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { TargetPicker } from '@/pages/vulnerabilities/components/fast-scan-dialog';
import {
  useAssetGroupControllerGetAll,
  useAssetsControllerGetAssetsInWorkspace,
  useTemplatesControllerGetMany,
  useTemplatesControllerRun,
} from '@/services/apis/gen/queries';

type Scope = 'targets' | 'assets' | 'groups';

const SCOPE_FIELD = {
  targets: 'targetIds',
  assets: 'assetIds',
  groups: 'assetGroupIds',
} as const;

const emptySelection = (): Record<Scope, Set<string>> => ({
  targets: new Set(),
  assets: new Set(),
  groups: new Set(),
});

interface RunTemplatesDialogProps {
  /** The open template, preselected. */
  templateId: string;
  disabled?: boolean;
}

/** Runs saved templates with nuclei on targets, assets or asset groups. */
export function RunTemplatesDialog({ templateId, disabled }: RunTemplatesDialogProps) {
  const [open, setOpen] = useState(false);
  const [templateIds, setTemplateIds] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<Scope>('targets');
  const [selected, setSelected] = useState(emptySelection);
  const run = useTemplatesControllerRun();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setTemplateIds(new Set([templateId]));
      setSelected(emptySelection());
    }
  };
  const setScopeSelection = (ids: Set<string>) =>
    setSelected((prev) => ({ ...prev, [scope]: ids }));

  const ids = Array.from(selected[scope]);
  const handleRun = () => {
    run.mutate(
      { data: { templateIds: Array.from(templateIds), [SCOPE_FIELD[scope]]: ids } },
      {
        onSuccess: (res) => {
          toast.success(res.message);
          setOpen(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        title="Run saved templates against targets, assets or groups"
        onClick={() => handleOpenChange(true)}
      >
        <Play className="h-4 w-4" />
        Run
      </Button>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Run templates</DialogTitle>
          <DialogDescription>
            Nuclei runs only the selected templates, as last saved. Findings appear in
            Vulnerabilities.
          </DialogDescription>
        </DialogHeader>
        <TemplateChecklist selected={templateIds} onSelectedChange={setTemplateIds} />
        <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <TabsList>
            <TabsTrigger value="targets">Targets</TabsTrigger>
            <TabsTrigger value="assets">Assets</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
          </TabsList>
          <TabsContent value="targets">
            <TargetPicker selected={selected.targets} onSelectedChange={setScopeSelection} />
          </TabsContent>
          <TabsContent value="assets">
            <AssetPicker selected={selected.assets} onSelectedChange={setScopeSelection} />
          </TabsContent>
          <TabsContent value="groups">
            <GroupPicker selected={selected.groups} onSelectedChange={setScopeSelection} />
          </TabsContent>
        </Tabs>
        <DialogFooter className="items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {templateIds.size} template(s), {ids.length} {scope} selected
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRun}
              disabled={templateIds.size === 0 || ids.length === 0 || run.isPending}
            >
              {run.isPending ? 'Starting…' : 'Run'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PickerProps {
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
}

function toggled(selected: Set<string>, ids: string[], checked: boolean) {
  const next = new Set(selected);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** Checkbox column over the current page, kept across pages and searches. */
function selectColumn<T extends { id: string }>(
  rows: T[],
  { selected, onSelectedChange }: PickerProps,
): ColumnDef<T> {
  const toggle = (ids: string[], checked: boolean) =>
    onSelectedChange(toggled(selected, ids, checked));
  return {
    id: 'select',
    header: () => {
      const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
      const some = rows.some((r) => selected.has(r.id));
      return (
        <Checkbox
          checked={all || (some && 'indeterminate')}
          onCheckedChange={(value) => toggle(rows.map((r) => r.id), !!value)}
          aria-label="Select all"
        />
      );
    },
    cell: ({ row }) => (
      <Checkbox
        checked={selected.has(row.original.id)}
        onCheckedChange={(value) => toggle([row.original.id], !!value)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  };
}

function usePickerTable() {
  const [filter, setFilter] = useState('');
  const table = useServerDataTable({ isUpdateSearchQueryParam: false, defaultPageSize: 10 });
  return { filter, setFilter, ...table };
}

function AssetPicker(props: PickerProps) {
  const { filter, setFilter, tableParams, tableHandlers } = usePickerTable();
  const { page, pageSize, sortBy, sortOrder } = tableParams;
  const { data, isLoading } = useAssetsControllerGetAssetsInWorkspace({
    page,
    limit: pageSize,
    sortBy,
    sortOrder,
    value: filter || undefined,
  });
  const rows = useMemo(() => data?.data ?? [], [data?.data]);

  return (
    <DataTable
      columns={[selectColumn(rows, props), { accessorKey: 'value', header: 'Asset' }]}
      data={rows}
      isLoading={isLoading}
      page={page}
      pageSize={pageSize}
      totalItems={data?.total ?? 0}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSortChange={(col, order) => tableHandlers.setParams({ sortBy: col, sortOrder: order })}
      filterValue={filter}
      onFilterChange={setFilter}
      filterColumnKey="value"
      filterPlaceholder="Search assets"
      onPageChange={tableHandlers.setPage}
      onPageSizeChange={tableHandlers.setPageSize}
      onRowClick={(row) =>
        props.onSelectedChange(toggled(props.selected, [row.id], !props.selected.has(row.id)))
      }
      emptyMessage="No assets"
    />
  );
}

function GroupPicker(props: PickerProps) {
  const { filter, setFilter, tableParams, tableHandlers } = usePickerTable();
  const { page, pageSize, sortBy, sortOrder } = tableParams;
  const { data, isLoading } = useAssetGroupControllerGetAll({
    page,
    limit: pageSize,
    sortBy,
    sortOrder,
    search: filter || undefined,
  });
  const rows = useMemo(() => data?.data ?? [], [data?.data]);

  return (
    <DataTable
      columns={[
        selectColumn(rows, props),
        { accessorKey: 'name', header: 'Group' },
        { accessorKey: 'totalAssets', header: 'Assets', enableSorting: false },
      ]}
      data={rows}
      isLoading={isLoading}
      page={page}
      pageSize={pageSize}
      totalItems={data?.total ?? 0}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSortChange={(col, order) => tableHandlers.setParams({ sortBy: col, sortOrder: order })}
      filterValue={filter}
      onFilterChange={setFilter}
      filterColumnKey="name"
      filterPlaceholder="Search groups"
      onPageChange={tableHandlers.setPage}
      onPageSizeChange={tableHandlers.setPageSize}
      onRowClick={(row) =>
        props.onSelectedChange(toggled(props.selected, [row.id], !props.selected.has(row.id)))
      }
      emptyMessage="No asset groups"
    />
  );
}

function TemplateChecklist({ selected, onSelectedChange }: PickerProps) {
  // shortcut: first 100 of each list, same as the sidebar; add search/paging if users outgrow it.
  const mine = useTemplatesControllerGetMany({ scope: 'mine', limit: 100, sortBy: 'name' });
  const shared = useTemplatesControllerGetMany({ scope: 'shared', limit: 100, sortBy: 'name' });
  const rows = [...(mine.data?.data ?? []), ...(shared.data?.data ?? [])];

  return (
    <div className="space-y-2">
      <Label>Templates</Label>
      <ScrollArea className="h-36 rounded-md border">
        <div className="p-2">
          {rows.map((row) => (
            <label
              key={row.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={selected.has(row.id)}
                onCheckedChange={(value) =>
                  onSelectedChange(toggled(selected, [row.id], !!value))
                }
              />
              <span className="truncate">{row.name}</span>
            </label>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
