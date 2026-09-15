import { type GetUrlAssetsDTO } from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'lucide-react';

export const urlAssetsColumn: ColumnDef<GetUrlAssetsDTO>[] = [
  {
    accessorKey: 'url',
    header: 'URL',
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
        </div>
      );
    },
  },
  {
    accessorKey: 'assetCount',
    header: 'Number of services',
    size: 250,
    cell: ({ row }) => {
      const data = row.original;

      return (
        <div className="flex flex-wrap gap-1 items-center">
          {data.assetCount} {data.assetCount > 1 ? 'services' : 'service'}
        </div>
      );
    },
  },
];
