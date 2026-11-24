import { type GetUrlAssetsDTO } from '@/services/apis/gen/queries';
import { t } from '@/lib/i18n-dictionary';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'lucide-react';
import { NewBadge } from './new-badge';

export const urlAssetsColumn: ColumnDef<GetUrlAssetsDTO>[] = [
  {
    accessorKey: 'url',
    header: () => t('assets.columns.url'),
    enableHiding: false,
    size: 500,
    cell: ({ row }) => {
      const data = row.original;
      return (
        <div className="flex items-center gap-2 py-2 max-w-[500px]">
          <Link className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate" title={data.url}>
            {data.url}
          </span>
          <NewBadge isNew={data.isNew} />
        </div>
      );
    },
  },
  {
    accessorKey: 'assetCount',
    header: () => t('assets.columns.numberOfServices'),
    size: 250,
    cell: ({ row }) => {
      const data = row.original;

      return (
        <div className="flex flex-wrap gap-1 items-center">
          {t('assets.columns.serviceCount', { count: data.assetCount })}
        </div>
      );
    },
  },
];
