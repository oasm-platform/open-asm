import { useT } from '@/lib/i18n-dictionary';
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
  const t = useT();
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
          toast.success(t('vulnerabilities.fastScan.toastStarted'));
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
        title={t('vulnerabilities.fastScan.buttonTitle')}
        onClick={() => setOpen(true)}
      >
        <Bug className="h-4 w-4" />
        {t('vulnerabilities.fastScan.button')}
      </Button>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{t('vulnerabilities.fastScan.title')}</DialogTitle>
          <DialogDescription>
            {target
              ? t('vulnerabilities.fastScan.descTarget')
              : t('vulnerabilities.fastScan.descPick')}
          </DialogDescription>
        </DialogHeader>
        {target ? (
          <div className="space-y-2">
            <Label htmlFor="fast-scan-target">{t('vulnerabilities.fastScan.target')}</Label>
            <Input id="fast-scan-target" value={target.value} readOnly />
          </div>
        ) : (
          <TargetPicker selected={selected} onSelectedChange={setSelected} />
        )}
        <DialogFooter className="items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {!target && t('vulnerabilities.fastScan.selected', { n: selected.size })}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRun}
              disabled={targetIds.length === 0 || isPending}
            >
              {isPending
                ? t('vulnerabilities.fastScan.starting')
                : t('vulnerabilities.fastScan.run')}
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
  const t = useT();
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
        const all = targets.length > 0 && targets.every((x) => selected.has(x.id));
        const some = targets.some((x) => selected.has(x.id));
        return (
          <Checkbox
            checked={all || (some && 'indeterminate')}
            onCheckedChange={(value) => toggle(targets, !!value)}
            aria-label={t('vulnerabilities.fastScan.selectAll')}
          />
        );
      },
      cell: ({ row }) => (
        <Checkbox
          checked={selected.has(row.original.id)}
          onCheckedChange={(value) => toggle([row.original], !!value)}
          onClick={(e) => e.stopPropagation()}
          aria-label={t('vulnerabilities.fastScan.selectRow')}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    { accessorKey: 'value', header: t('vulnerabilities.fastScan.colTarget') },
    {
      accessorKey: 'type',
      header: t('vulnerabilities.fastScan.colType'),
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
      filterPlaceholder={t('vulnerabilities.fastScan.search')}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      onRowClick={(row) => toggle([row], !selected.has(row.id))}
      emptyMessage={t('vulnerabilities.fastScan.empty')}
    />
  );
}
