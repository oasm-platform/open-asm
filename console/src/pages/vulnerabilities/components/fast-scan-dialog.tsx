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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import { TargetTypeBadge } from '@/pages/targets/components/target-type-badge';
import {
  JobStatus,
  useTargetsControllerGetTargetsInWorkspace,
  useVulnerabilitiesControllerScan,
  type GetManyTargetResponseDto,
  type TargetType,
} from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import { Bug } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

interface FastScanDialogProps {
  /** Fixed target (target detail page): no picker, the target is pre-filled. */
  target?: { id: string; value: string };
  disabled?: boolean;
}

export function FastScanDialog({ target, disabled }: FastScanDialogProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { mutate: scan, isPending } = useVulnerabilitiesControllerScan();

  const targetIds = target ? [target.id] : Array.from(selected);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSelected(new Set());
  };

  const handleRun = () => {
    scan(
      { data: { targetIds } },
      {
        onSuccess: () => {
          toast.success('Scan started successfully');
          handleOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        disabled={disabled}
        variant="secondary"
        className="hover:cursor-pointer text-sm h-9"
        title="Start a vulnerability scan"
        onClick={() => setOpen(true)}
      >
        <Bug className="h-4 w-4" />
        Fast scan
      </Button>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Scan vulnerabilities</DialogTitle>
          <DialogDescription>
            {target
              ? 'Run a vulnerability scan on this target.'
              : 'Choose the targets to scan. Only targets that finished discovery are listed.'}
          </DialogDescription>
        </DialogHeader>
        {target ? (
          <div className="space-y-2">
            <Label htmlFor="fast-scan-target">Target</Label>
            <Input id="fast-scan-target" value={target.value} readOnly />
          </div>
        ) : (
          <TargetPicker selected={selected} onSelectedChange={setSelected} />
        )}
        <DialogFooter className="items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {!target && `${selected.size} selected`}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRun}
              disabled={targetIds.length === 0 || isPending}
            >
              {isPending ? 'Starting...' : 'Run'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TargetPickerProps {
  /** Selected target IDs, kept across pages and searches. */
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
  /** Only list targets of this type. */
  type?: TargetType;
}

export function TargetPicker({
  selected,
  onSelectedChange,
  type,
}: TargetPickerProps) {
  const [filter, setFilter] = useState('');
  const {
    tableParams: { page, pageSize, sortBy, sortOrder },
    tableHandlers: { setPage, setPageSize, setParams },
  } = useServerDataTable({
    isUpdateSearchQueryParam: false,
    defaultPageSize: 10,
  });

  const { data, isLoading } = useTargetsControllerGetTargetsInWorkspace({
    page,
    limit: pageSize,
    sortBy,
    sortOrder,
    value: filter || undefined,
    type,
    status: JobStatus.completed,
  });
  const targets = useMemo(() => data?.data ?? [], [data?.data]);

  const toggle = (rows: GetManyTargetResponseDto[], checked: boolean) => {
    const next = new Set(selected);
    for (const row of rows) {
      if (checked) next.add(row.id);
      else next.delete(row.id);
    }
    onSelectedChange(next);
  };

  const columns: ColumnDef<GetManyTargetResponseDto>[] = [
    {
      id: 'select',
      header: () => {
        const all = targets.length > 0 && targets.every((t) => selected.has(t.id));
        const some = targets.some((t) => selected.has(t.id));
        return (
          <Checkbox
            checked={all || (some && 'indeterminate')}
            onCheckedChange={(value) => toggle(targets, !!value)}
            aria-label="Select all"
          />
        );
      },
      cell: ({ row }) => (
        <Checkbox
          checked={selected.has(row.original.id)}
          onCheckedChange={(value) => toggle([row.original], !!value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    { accessorKey: 'value', header: 'Target' },
    {
      accessorKey: 'type',
      header: 'Type',
      enableSorting: false,
      cell: ({ row }) => <TargetTypeBadge type={row.original.type} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={targets}
      isLoading={isLoading}
      page={page}
      pageSize={pageSize}
      totalItems={data?.total ?? 0}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSortChange={(col, order) => setParams({ sortBy: col, sortOrder: order })}
      filterValue={filter}
      onFilterChange={setFilter}
      filterColumnKey="value"
      filterPlaceholder="Search targets"
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      onRowClick={(row) => toggle([row], !selected.has(row.id))}
      emptyMessage="No discovered targets"
    />
  );
}
